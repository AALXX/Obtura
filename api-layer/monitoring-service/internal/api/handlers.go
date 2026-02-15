package api

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"monitoring-service/internal/monitoring"
	"monitoring-service/pkg/config"
	"monitoring-service/pkg/logger"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type Server struct {
	config       *config.Config
	orchestrator *monitoring.Orchestrator
	router       *gin.Engine
}

func NewServer(cfg *config.Config, orch *monitoring.Orchestrator) *Server {
	// Set Gin mode based on environment
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	s := &Server{
		config:       cfg,
		orchestrator: orch,
		router:       gin.New(),
	}

	s.setupMiddleware()
	s.setupRoutes()
	return s
}

// getUserIdFromSessionToken retrieves the user ID from a session token
func (s *Server) getUserIdFromSessionToken(ctx context.Context, sessionToken string) (string, error) {
	query := `SELECT user_id FROM sessions WHERE access_token = $1`

	var userID string
	err := s.orchestrator.GetDB().QueryRowContext(ctx, query, sessionToken).Scan(&userID)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("invalid session token")
		}
		return "", err
	}

	return userID, nil
}

func (s *Server) Router() *gin.Engine {
	return s.router
}

func (s *Server) setupMiddleware() {
	// Recovery middleware recovers from any panics
	s.router.Use(gin.Recovery())

	// Custom logging middleware
	s.router.Use(s.loggingMiddleware())

	// CORS middleware
	s.router.Use(s.corsMiddleware())

	// Request timeout middleware
	s.router.Use(s.timeoutMiddleware())
}

func (s *Server) setupRoutes() {
	s.router.GET("/health", s.handleHealth)

	// API group
	api := s.router.Group("/api")
	{
		// Project-level monitoring routes
		projects := api.Group("/projects")
		{
			projects.GET("/:projectId/metrics", s.validateProjectID(), s.handleGetProjectMetrics)
			projects.GET("/:projectId/metrics/sse", s.validateProjectID(), s.handleProjectMetricsSSE)
			projects.GET("/:projectId/alerts", s.validateProjectID(), s.handleGetProjectAlerts)
		}

		metrics := api.Group("/metrics")
		{
			metrics.GET("/:deploymentId", s.validateDeploymentID(), s.handleGetMetrics)
			metrics.GET("/:deploymentId/current", s.validateDeploymentID(), s.handleGetCurrentMetrics)
			metrics.GET("/:deploymentId/history", s.validateDeploymentID(), s.handleGetMetricsHistory)
		}

		logs := api.Group("/logs")
		{
			logs.GET("/:deploymentId", s.validateDeploymentID(), s.handleGetLogs)
			logs.GET("/:deploymentId/stream", s.validateDeploymentID(), s.handleStreamLogs)
		}

		platformLogs := api.Group("/platform-logs")
		{
			platformLogs.POST("/ingest", s.handleIngestLogs)
			platformLogs.GET("/query", s.handleQueryLogs)
			platformLogs.POST("/query", s.handleQueryLogs)
			platformLogs.GET("/stream/:resourceType/:resourceId", s.handleStreamPlatformLogs)
			platformLogs.GET("/stats", s.handleGetLogStats)
		}

		alerts := api.Group("/alerts")
		{
			alerts.GET("", s.handleGetAlerts)
			alerts.GET("/:alertId", s.validateAlertID(), s.handleGetAlert)
			alerts.POST("/:alertId/acknowledge/:sessionToken", s.validateAlertID(), s.handleAcknowledgeAlert)
			alerts.POST("/:alertId/resolve/:sessionToken", s.validateAlertID(), s.handleResolveAlert)
		}

		deployments := api.Group("/deployments")
		{
			deployments.GET("/:deploymentId/health", s.validateDeploymentID(), s.handleGetDeploymentHealth)
			deployments.GET("/:deploymentId/uptime", s.validateDeploymentID(), s.handleGetDeploymentUptime)
		}

		incidents := api.Group("/incidents")
		{
			incidents.GET("", s.handleGetIncidents)
			incidents.GET("/:incidentId", s.validateIncidentID(), s.handleGetIncident)
		}
	}

	ws := s.router.Group("/ws")
	{
		ws.GET("/metrics/:deploymentId", s.validateDeploymentID(), s.handleWebSocketMetrics)
		ws.GET("/logs/:deploymentId", s.validateDeploymentID(), s.handleWebSocketLogs)
	}
}

func (s *Server) validateDeploymentID() gin.HandlerFunc {
	return func(c *gin.Context) {
		deploymentID := c.Param("deploymentId")
		if !isValidID(deploymentID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid deployment ID format"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func (s *Server) validateAlertID() gin.HandlerFunc {
	return func(c *gin.Context) {
		alertID := c.Param("alertId")
		if !isValidID(alertID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid alert ID format"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func (s *Server) validateIncidentID() gin.HandlerFunc {
	return func(c *gin.Context) {
		incidentID := c.Param("incidentId")
		if !isValidID(incidentID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid incident ID format"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func isValidID(id string) bool {
	// Allow UUIDs (with hyphens), alphanumerics, underscores, hyphens
	matched, _ := regexp.MatchString("^[a-zA-Z0-9-]{1,50}$", id)
	return matched
}

func (s *Server) validateProjectID() gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("projectId")
		if !isValidID(projectID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid project ID format"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func isValidTimeFormat(timeStr string) bool {
	if timeStr == "" {
		return true
	}
	_, err := time.Parse(time.RFC3339, timeStr)
	return err == nil
}

func (s *Server) handleHealth(c *gin.Context) {
	health := gin.H{
		"status":  "healthy",
		"time":    time.Now().Format(time.RFC3339),
		"version": "1.0.0",
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if err := s.orchestrator.GetDB().PingContext(ctx); err != nil {
		health["status"] = "unhealthy"
		health["database"] = "disconnected"
		c.JSON(http.StatusServiceUnavailable, health)
		return
	}
	health["database"] = "connected"

	// Check Redis connection
	if err := s.orchestrator.GetRedis().HealthCheck(ctx); err != nil {
		health["status"] = "degraded"
		health["redis"] = "disconnected"
	} else {
		health["redis"] = "connected"
	}

	c.JSON(http.StatusOK, health)
}

func (s *Server) handleGetMetrics(c *gin.Context) {
	deploymentID := c.Param("deploymentId")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT timestamp, cpu_usage, memory_usage, network_rx, network_tx, status
		FROM deployments_metrics
		WHERE deployment_id = $1
		ORDER BY timestamp DESC
		LIMIT 100
	`

	rows, err := s.orchestrator.GetDB().QueryContext(ctx, query, deploymentID)
	if err != nil {
		logger.Error("Failed to query metrics", zap.String("deployment_id", deploymentID), logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve metrics"})
		return
	}
	defer rows.Close()

	var metrics []gin.H
	for rows.Next() {
		var timestamp time.Time
		var cpu float64
		var mem, netRx, netTx int64
		var status string

		if err := rows.Scan(&timestamp, &cpu, &mem, &netRx, &netTx, &status); err != nil {
			logger.Error("Failed to scan metric row", logger.Err(err))
			continue
		}

		metrics = append(metrics, gin.H{
			"timestamp":    timestamp,
			"cpu_usage":    cpu,
			"memory_usage": mem,
			"network_rx":   netRx,
			"network_tx":   netTx,
			"status":       status,
		})
	}

	if err := rows.Err(); err != nil {
		logger.Error("Error iterating metric rows", logger.Err(err))
	}

	c.JSON(http.StatusOK, metrics)
}

// Get current metrics
func (s *Server) handleGetCurrentMetrics(c *gin.Context) {
	deploymentID := c.Param("deploymentId")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	key := "metrics:" + deploymentID + ":latest"
	result, err := s.orchestrator.GetRedis().HGetAll(ctx, key).Result()
	if err != nil {
		logger.Error("Failed to get current metrics from Redis",
			zap.String("deployment_id", deploymentID),
			logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve current metrics"})
		return
	}

	if len(result) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "No current metrics available"})
		return
	}

	c.JSON(http.StatusOK, result)
}

// Get metrics history
func (s *Server) handleGetMetricsHistory(c *gin.Context) {
	deploymentID := c.Param("deploymentId")
	startTime := c.Query("start")
	endTime := c.Query("end")

	// Validate time parameters
	if !isValidTimeFormat(startTime) || !isValidTimeFormat(endTime) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid time format. Use RFC3339 format."})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var query string
	var args []interface{}

	if startTime != "" && endTime != "" {
		query = `
			SELECT timestamp, cpu_usage, memory_usage, network_rx, network_tx, status
			FROM deployments_metrics
			WHERE deployment_id = $1 AND timestamp >= $2 AND timestamp <= $3
			ORDER BY timestamp DESC
			LIMIT 1000
		`
		args = []interface{}{deploymentID, startTime, endTime}
	} else {
		query = `
			SELECT timestamp, cpu_usage, memory_usage, network_rx, network_tx, status
			FROM deployments_metrics
			WHERE deployment_id = $1
			ORDER BY timestamp DESC
			LIMIT 1000
		`
		args = []interface{}{deploymentID}
	}

	rows, err := s.orchestrator.GetDB().QueryContext(ctx, query, args...)
	if err != nil {
		logger.Error("Failed to query metrics history",
			zap.String("deployment_id", deploymentID),
			logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve metrics history"})
		return
	}
	defer rows.Close()

	var metrics []gin.H
	for rows.Next() {
		var timestamp time.Time
		var cpu float64
		var mem, netRx, netTx int64
		var status string

		if err := rows.Scan(&timestamp, &cpu, &mem, &netRx, &netTx, &status); err != nil {
			logger.Error("Failed to scan metric row", logger.Err(err))
			continue
		}

		metrics = append(metrics, gin.H{
			"timestamp":    timestamp,
			"cpu_usage":    cpu,
			"memory_usage": mem,
			"network_rx":   netRx,
			"network_tx":   netTx,
			"status":       status,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"deployment_id": deploymentID,
		"start":         startTime,
		"end":           endTime,
		"metrics":       metrics,
		"count":         len(metrics),
	})
}

// Get logs
func (s *Server) handleGetLogs(c *gin.Context) {
	deploymentID := c.Param("deploymentId")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT timestamp, level, message, source
		FROM logs_archive
		WHERE deployment_id = $1
		ORDER BY timestamp DESC
		LIMIT 1000
	`

	rows, err := s.orchestrator.GetDB().QueryContext(ctx, query, deploymentID)
	if err != nil {
		logger.Error("Failed to query logs",
			zap.String("deployment_id", deploymentID),
			logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve logs"})
		return
	}
	defer rows.Close()

	var logs []gin.H
	for rows.Next() {
		var timestamp time.Time
		var level, message, source string

		if err := rows.Scan(&timestamp, &level, &message, &source); err != nil {
			logger.Error("Failed to scan log row", logger.Err(err))
			continue
		}

		logs = append(logs, gin.H{
			"timestamp": timestamp,
			"level":     level,
			"message":   message,
			"source":    source,
		})
	}

	c.JSON(http.StatusOK, logs)
}

// Stream logs via WebSocket
func (s *Server) handleStreamLogs(c *gin.Context) {
	deploymentID := c.Param("deploymentId")

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logger.Error("Failed to upgrade WebSocket connection", logger.Err(err))
		return
	}
	defer conn.Close()

	logger.Info("WebSocket log stream started", zap.String("deployment_id", deploymentID))

	// Stream logs in real-time
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Send periodic ping to keep connection alive
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := conn.WriteMessage(websocket.PingMessage, []byte{}); err != nil {
				logger.Error("WebSocket ping failed", logger.Err(err))
				return
			}
		}
	}
}

// Get alerts
func (s *Server) handleGetAlerts(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT id, deployment_id, severity, title, description, status, triggered_at
		FROM alerts
		WHERE status = 'active'
		ORDER BY triggered_at DESC
		LIMIT 100
	`

	rows, err := s.orchestrator.GetDB().QueryContext(ctx, query)
	if err != nil {
		logger.Error("Failed to query alerts", logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve alerts"})
		return
	}
	defer rows.Close()

	var alerts []gin.H
	for rows.Next() {
		var id, deploymentID, severity, title, description, status string
		var triggeredAt time.Time

		if err := rows.Scan(&id, &deploymentID, &severity, &title, &description, &status, &triggeredAt); err != nil {
			logger.Error("Failed to scan alert row", logger.Err(err))
			continue
		}

		alerts = append(alerts, gin.H{
			"id":            id,
			"deployment_id": deploymentID,
			"severity":      severity,
			"title":         title,
			"description":   description,
			"status":        status,
			"triggered_at":  triggeredAt,
		})
	}

	c.JSON(http.StatusOK, alerts)
}

// Get single alert
func (s *Server) handleGetAlert(c *gin.Context) {
	alertID := c.Param("alertId")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	query := `
		SELECT id, deployment_id, severity, title, description, status, triggered_at
		FROM alerts
		WHERE id = $1
	`

	var alert gin.H
	var id, deploymentID, severity, title, description, status string
	var triggeredAt time.Time

	err := s.orchestrator.GetDB().QueryRowContext(ctx, query, alertID).Scan(
		&id, &deploymentID, &severity, &title, &description, &status, &triggeredAt,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
		return
	} else if err != nil {
		logger.Error("Failed to query alert", zap.String("alert_id", alertID), logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve alert"})
		return
	}

	alert = gin.H{
		"id":            id,
		"deployment_id": deploymentID,
		"severity":      severity,
		"title":         title,
		"description":   description,
		"status":        status,
		"triggered_at":  triggeredAt,
	}

	c.JSON(http.StatusOK, alert)
}

func (s *Server) handleAcknowledgeAlert(c *gin.Context) {
	alertID := c.Param("alertId")
	sessionToken := c.Param("sessionToken")

	logger.Info("Acknowledging alert", zap.String("alert_id", alertID))

	// Get user ID from session token
	userID, err := s.getUserIdFromSessionToken(c.Request.Context(), sessionToken)
	if err != nil {
		logger.Error("Failed to get user ID from session token", zap.Error(err))
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid session token"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	query := `UPDATE deployment_alerts SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by_user_id = $2 WHERE id = $1`
	result, err := s.orchestrator.GetDB().ExecContext(ctx, query, alertID, userID)
	if err != nil {
		logger.Error("Failed to acknowledge alert", zap.String("alert_id", alertID), logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to acknowledge alert"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
		return
	}

	logger.Info("Alert acknowledged", zap.String("alert_id", alertID), zap.String("user_id", userID))
	c.JSON(http.StatusOK, gin.H{"message": "Alert acknowledged"})
}

func (s *Server) handleResolveAlert(c *gin.Context) {
	alertID := c.Param("alertId")
	sessionToken := c.Param("sessionToken")

	logger.Info("Resolving alert", zap.String("alert_id", alertID))

	// Get user ID from session token
	userID, err := s.getUserIdFromSessionToken(c.Request.Context(), sessionToken)
	if err != nil {
		logger.Error("Failed to get user ID from session token", zap.Error(err))
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid session token"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	query := `UPDATE deployment_alerts SET resolved = true, resolved_at = NOW(), resolved_by_user_id = $2 WHERE id = $1`
	result, err := s.orchestrator.GetDB().ExecContext(ctx, query, alertID, userID)
	if err != nil {
		logger.Error("Failed to resolve alert", zap.String("alert_id", alertID), logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve alert"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
		return
	}

	logger.Info("Alert resolved", zap.String("alert_id", alertID), zap.String("user_id", userID))
	c.JSON(http.StatusOK, gin.H{"message": "Alert resolved"})
}

// Get deployment health
func (s *Server) handleGetDeploymentHealth(c *gin.Context) {
	deploymentID := c.Param("deploymentId")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT check_type, status, response_time, checked_at
		FROM health_checks
		WHERE deployment_id = $1
		ORDER BY checked_at DESC
		LIMIT 10
	`

	rows, err := s.orchestrator.GetDB().QueryContext(ctx, query, deploymentID)
	if err != nil {
		logger.Error("Failed to query health checks",
			zap.String("deployment_id", deploymentID),
			logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve health checks"})
		return
	}
	defer rows.Close()

	var checks []gin.H
	for rows.Next() {
		var checkType, status string
		var responseTime int
		var checkedAt time.Time

		if err := rows.Scan(&checkType, &status, &responseTime, &checkedAt); err != nil {
			logger.Error("Failed to scan health check row", logger.Err(err))
			continue
		}

		checks = append(checks, gin.H{
			"check_type":    checkType,
			"status":        status,
			"response_time": responseTime,
			"checked_at":    checkedAt,
		})
	}

	c.JSON(http.StatusOK, checks)
}

// Get deployment uptime
func (s *Server) handleGetDeploymentUptime(c *gin.Context) {
	deploymentID := c.Param("deploymentId")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	// Calculate uptime from health checks
	query := `
		SELECT 
			COUNT(*) as total_checks,
			COUNT(CASE WHEN status = 'healthy' THEN 1 END) as healthy_checks
		FROM health_checks
		WHERE deployment_id = $1 AND checked_at > NOW() - INTERVAL '24 hours'
	`

	var totalChecks, healthyChecks int
	err := s.orchestrator.GetDB().QueryRowContext(ctx, query, deploymentID).Scan(&totalChecks, &healthyChecks)
	if err != nil {
		logger.Error("Failed to calculate uptime",
			zap.String("deployment_id", deploymentID),
			logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to calculate uptime"})
		return
	}

	uptime := 0.0
	if totalChecks > 0 {
		uptime = float64(healthyChecks) / float64(totalChecks) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"deployment_id":  deploymentID,
		"uptime_percent": fmt.Sprintf("%.2f%%", uptime),
		"healthy_checks": healthyChecks,
		"total_checks":   totalChecks,
		"period":         "24h",
	})
}

// Get incidents
func (s *Server) handleGetIncidents(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT id, deployment_id, title, description, severity, status, started_at
		FROM incidents
		ORDER BY started_at DESC
		LIMIT 100
	`

	rows, err := s.orchestrator.GetDB().QueryContext(ctx, query)
	if err != nil {
		logger.Error("Failed to query incidents", logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve incidents"})
		return
	}
	defer rows.Close()

	var incidents []gin.H
	for rows.Next() {
		var id, deploymentID, title, description, severity, status string
		var startedAt time.Time

		if err := rows.Scan(&id, &deploymentID, &title, &description, &severity, &status, &startedAt); err != nil {
			logger.Error("Failed to scan incident row", logger.Err(err))
			continue
		}

		incidents = append(incidents, gin.H{
			"id":            id,
			"deployment_id": deploymentID,
			"title":         title,
			"description":   description,
			"severity":      severity,
			"status":        status,
			"started_at":    startedAt,
		})
	}

	c.JSON(http.StatusOK, incidents)
}

// Get single incident
func (s *Server) handleGetIncident(c *gin.Context) {
	incidentID := c.Param("incidentId")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	query := `
		SELECT id, deployment_id, title, description, severity, status, started_at
		FROM incidents
		WHERE id = $1
	`

	var incident gin.H
	var id, deploymentID, title, description, severity, status string
	var startedAt time.Time

	err := s.orchestrator.GetDB().QueryRowContext(ctx, query, incidentID).Scan(
		&id, &deploymentID, &title, &description, &severity, &status, &startedAt,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Incident not found"})
		return
	} else if err != nil {
		logger.Error("Failed to query incident", zap.String("incident_id", incidentID), logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve incident"})
		return
	}

	incident = gin.H{
		"id":            id,
		"deployment_id": deploymentID,
		"title":         title,
		"description":   description,
		"severity":      severity,
		"status":        status,
		"started_at":    startedAt,
	}

	c.JSON(http.StatusOK, incident)
}

// WebSocket for real-time metrics
func (s *Server) handleWebSocketMetrics(c *gin.Context) {
	deploymentID := c.Param("deploymentId")

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logger.Error("Failed to upgrade WebSocket connection for metrics", logger.Err(err))
		return
	}
	defer conn.Close()

	logger.Info("WebSocket metrics stream started", zap.String("deployment_id", deploymentID))

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			key := "metrics:" + deploymentID + ":latest"
			metrics, err := s.orchestrator.GetRedis().HGetAll(ctx, key).Result()
			if err != nil {
				logger.Error("Failed to get metrics from Redis",
					zap.String("deployment_id", deploymentID),
					logger.Err(err))
				continue
			}

			if err := conn.WriteJSON(metrics); err != nil {
				logger.Error("Failed to write metrics to WebSocket", logger.Err(err))
				return
			}
		}
	}
}

// WebSocket for real-time logs
func (s *Server) handleWebSocketLogs(c *gin.Context) {
	deploymentID := c.Param("deploymentId")

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logger.Error("Failed to upgrade WebSocket connection for logs", logger.Err(err))
		return
	}
	defer conn.Close()

	logger.Info("WebSocket logs stream started", zap.String("deployment_id", deploymentID))

	// Keep connection alive with ping/pong
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := conn.WriteMessage(websocket.PingMessage, []byte{}); err != nil {
				logger.Error("WebSocket ping failed", logger.Err(err))
				return
			}
		}
	}
}

// Middleware
func (s *Server) loggingMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		method := c.Request.Method

		// Process request
		c.Next()

		// Log after request
		duration := time.Since(start)
		statusCode := c.Writer.Status()

		logger.Info("HTTP Request",
			zap.String("method", method),
			zap.String("path", path),
			zap.Int("status", statusCode),
			zap.Duration("duration", duration),
			zap.String("client_ip", c.ClientIP()),
		)
	}
}

func (s *Server) corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}

		c.Next()
	}
}

func (s *Server) timeoutMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip timeout for SSE endpoints - they need to be long-lived
		if strings.Contains(c.Request.URL.Path, "/stream/") || strings.Contains(c.Request.URL.Path, "/sse") {
			c.Next()
			return
		}

		// Set a default timeout of 30 seconds for all other requests
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

// Project-level metrics handlers

type ProjectMetricsResponse struct {
	ProjectID          string             `json:"projectId"`
	Production         *DeploymentMetrics `json:"production,omitempty"`
	Staging            *DeploymentMetrics `json:"staging,omitempty"`
	AvailableDataTypes []string           `json:"availableDataTypes"`
	NotAvailable       []string           `json:"notAvailable"`
	TimeRange          string             `json:"timeRange"`
	Timestamp          time.Time          `json:"timestamp"`
}

type DeploymentMetrics struct {
	DeploymentID   string  `json:"deploymentId"`
	CPUUsage       float64 `json:"cpuUsage"`
	MemoryUsage    int64   `json:"memoryUsage"`
	NetworkRx      int64   `json:"networkRx"`
	NetworkTx      int64   `json:"networkTx"`
	RequestsPerMin int     `json:"requestsPerMin"`
	AvgLatency     string  `json:"avgLatency"`
	ErrorRate      string  `json:"errorRate"`
	Uptime         string  `json:"uptime"`
	Status         string  `json:"status"`
}

type ProjectAlert struct {
	ID           string    `json:"id"`
	DeploymentID string    `json:"deploymentId"`
	Severity     string    `json:"severity"`
	Message      string    `json:"message"`
	Timestamp    time.Time `json:"timestamp"`
	Status       string    `json:"status"`
}

func (s *Server) handleGetProjectMetrics(c *gin.Context) {
	projectID := c.Param("projectId")
	timeRange := c.DefaultQuery("timeRange", "24h")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// Get production deployment for the project
	prodDeployment, prodMetrics := s.getProductionDeploymentMetrics(ctx, projectID)
	stagingDeployment, stagingMetrics := s.getStagingDeploymentMetrics(ctx, projectID)

	// Determine what's available
	available := []string{}
	notAvailable := []string{}

	if prodDeployment != nil {
		available = append(available, "production")
	}
	if stagingDeployment != nil {
		available = append(available, "staging")
	}

	// HTTP metrics are not available (data-layer exists but not populated)
	notAvailable = append(notAvailable, "latencyDistribution", "statusCodes", "endpoints", "geographicData", "heatmapData")

	response := ProjectMetricsResponse{
		ProjectID:          projectID,
		AvailableDataTypes: available,
		NotAvailable:       notAvailable,
		TimeRange:          timeRange,
		Timestamp:          time.Now(),
	}

	if prodDeployment != nil {
		response.Production = prodMetrics
	}
	if stagingDeployment != nil {
		response.Staging = stagingMetrics
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    response,
	})
}

func (s *Server) getProductionDeploymentMetrics(ctx context.Context, projectID string) (*string, *DeploymentMetrics) {
	// Get production deployment with its container info in one query
	query := `
		SELECT 
			d.id, d.status, d.current_requests_per_minute, d.avg_response_time_ms,
			dc.container_id, dc.cpu_usage_percent, dc.memory_usage_mb, dc.health_status, dc.status as container_status
		FROM deployments d
		LEFT JOIN deployment_containers dc ON dc.deployment_id = d.id AND dc.is_active = true
		WHERE d.project_id = $1 
		  AND d.environment = 'production' 
		  AND d.status IN ('active', 'running', 'healthy')
		ORDER BY d.created_at DESC
		LIMIT 1
	`

	var deploymentID, status, containerID, containerHealth, containerStatus sql.NullString
	var requestsPerMin, avgLatencyMs sql.NullInt64
	var cpuPercent, memMB sql.NullFloat64

	err := s.orchestrator.GetDB().QueryRowContext(ctx, query, projectID).Scan(
		&deploymentID, &status, &requestsPerMin, &avgLatencyMs,
		&containerID, &cpuPercent, &memMB, &containerHealth, &containerStatus,
	)

	if err == sql.ErrNoRows || deploymentID.String == "" {
		logger.Warn("No active production deployment found", zap.String("project_id", projectID))
		return nil, nil
	}
	if err != nil {
		logger.Error("Failed to get production deployment metrics", zap.String("project_id", projectID), logger.Err(err))
		return nil, nil
	}

	logger.Info("Production deployment metrics query result",
		zap.String("deployment_id", deploymentID.String),
		zap.String("status", status.String),
		zap.String("container_id", containerID.String),
		zap.Float64("cpu", cpuPercent.Float64),
		zap.Float64("memory", memMB.Float64),
		zap.String("health", containerHealth.String),
	)

	// Determine error rate based on container health
	errorRate := "0.00"
	if containerHealth.String == "unhealthy" || containerStatus.String == "unhealthy" {
		errorRate = "100.00"
	}

	// Calculate uptime
	uptime := "100.00"
	if containerHealth.String == "healthy" {
		uptime = "100.00"
	} else if containerHealth.String == "unhealthy" || containerStatus.String == "unhealthy" {
		uptime = "0.00"
	}

	// If no CPU/memory from container, show as N/A
	cpuUsage := cpuPercent.Float64
	memUsage := int64(memMB.Float64)
	if !cpuPercent.Valid || cpuPercent.Float64 == 0 {
		cpuUsage = 0 // Will show as 0 in UI
	}
	if !memMB.Valid || memMB.Float64 == 0 {
		memUsage = 0
	}

	return &deploymentID.String, &DeploymentMetrics{
		DeploymentID:   deploymentID.String,
		CPUUsage:       cpuUsage,
		MemoryUsage:    memUsage,
		NetworkRx:      0,
		NetworkTx:      0,
		RequestsPerMin: int(requestsPerMin.Int64),
		AvgLatency:     fmt.Sprintf("%dms", avgLatencyMs.Int64),
		ErrorRate:      errorRate + "%",
		Uptime:         uptime + "%",
		Status:         status.String,
	}
}

func (s *Server) getStagingDeploymentMetrics(ctx context.Context, projectID string) (*string, *DeploymentMetrics) {
	// Query for staging deployment
	query := `
		SELECT d.id, d.status,
			   dm.cpu_usage, dm.memory_usage, dm.network_rx, dm.network_tx,
			   d.current_requests_per_minute, d.avg_response_time_ms
		FROM deployments d
		LEFT JOIN deployments_metrics dm ON dm.deployment_id = d.id
		WHERE d.project_id = $1 
		  AND d.environment = 'staging' 
		  AND d.status IN ('active', 'running', 'healthy')
		ORDER BY dm.timestamp DESC
		LIMIT 1
	`

	var deploymentID, status string
	var cpuUsage sql.NullFloat64
	var memUsage, netRx, netTx sql.NullInt64
	var requestsPerMin sql.NullInt64
	var avgLatencyMs sql.NullInt64

	err := s.orchestrator.GetDB().QueryRowContext(ctx, query, projectID).Scan(
		&deploymentID, &status,
		&cpuUsage, &memUsage, &netRx, &netTx,
		&requestsPerMin, &avgLatencyMs,
	)

	if err == sql.ErrNoRows || deploymentID == "" {
		return nil, nil
	}
	if err != nil {
		logger.Error("Failed to get staging metrics", zap.String("project_id", projectID), logger.Err(err))
		return nil, nil
	}

	return &deploymentID, &DeploymentMetrics{
		DeploymentID:   deploymentID,
		CPUUsage:       cpuUsage.Float64,
		MemoryUsage:    memUsage.Int64,
		NetworkRx:      netRx.Int64,
		NetworkTx:      netTx.Int64,
		RequestsPerMin: int(requestsPerMin.Int64),
		AvgLatency:     fmt.Sprintf("%dms", avgLatencyMs.Int64),
		ErrorRate:      "0.00%",
		Uptime:         "100.00%",
		Status:         status,
	}
}

func (s *Server) handleProjectMetricsSSE(c *gin.Context) {
	projectID := c.Param("projectId")
	timeRange := c.DefaultQuery("timeRange", "24h")

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	logger.Info("SSE connection opened for project", zap.String("project_id", projectID))

	// Create a channel to signal client disconnect
	clientGone := c.Request.Context().Done()

	// Send initial data
	s.sendProjectMetricsEvent(c, projectID, timeRange)

	// Send heartbeat every 30 seconds
	heartbeat := time.NewTicker(30 * time.Second)
	metricsTicker := time.NewTicker(10 * time.Second)
	defer heartbeat.Stop()
	defer metricsTicker.Stop()

	for {
		select {
		case <-clientGone:
			logger.Info("SSE client disconnected", zap.String("project_id", projectID))
			return
		case <-heartbeat.C:
			c.SSEvent("heartbeat", gin.H{"timestamp": time.Now().Unix()})
			c.Writer.Flush()
		case <-metricsTicker.C:
			s.sendProjectMetricsEvent(c, projectID, timeRange)
		}
	}
}

func (s *Server) sendProjectMetricsEvent(c *gin.Context, projectID, timeRange string) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	prodID, prodMetrics := s.getProductionDeploymentMetrics(ctx, projectID)
	stagingID, stagingMetrics := s.getStagingDeploymentMetrics(ctx, projectID)

	available := []string{}
	notAvailable := []string{"latencyDistribution", "statusCodes", "endpoints", "geographicData", "heatmapData"}

	if prodID != nil {
		available = append(available, "production")
	}
	if stagingID != nil {
		available = append(available, "staging")
	}

	response := ProjectMetricsResponse{
		ProjectID:          projectID,
		AvailableDataTypes: available,
		NotAvailable:       notAvailable,
		TimeRange:          timeRange,
		Timestamp:          time.Now(),
	}

	if prodID != nil {
		response.Production = prodMetrics
	}
	if stagingID != nil {
		response.Staging = stagingMetrics
	}

	c.SSEvent("metrics", gin.H{
		"metrics":   response,
		"alerts":    []ProjectAlert{},
		"timestamp": time.Now().Format(time.RFC3339),
	})
	c.Writer.Flush()
}

func (s *Server) handleGetProjectAlerts(c *gin.Context) {
	projectID := c.Param("projectId")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT da.id, da.deployment_id, da.severity, da.title, da.status, da.triggered_at
		FROM deployment_alerts da
		JOIN deployments d ON d.id = da.deployment_id
		WHERE d.project_id = $1 
		  AND da.resolved = false
		ORDER BY 
			CASE da.severity 
				WHEN 'critical' THEN 1 
				WHEN 'high' THEN 2 
				WHEN 'medium' THEN 3 
				ELSE 4 
			END,
			da.triggered_at DESC
		LIMIT 50
	`

	rows, err := s.orchestrator.GetDB().QueryContext(ctx, query, projectID)
	if err != nil {
		logger.Error("Failed to get project alerts", zap.String("project_id", projectID), logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve alerts"})
		return
	}
	defer rows.Close()

	var alerts []ProjectAlert
	for rows.Next() {
		var alert ProjectAlert
		var title string
		if err := rows.Scan(&alert.ID, &alert.DeploymentID, &alert.Severity, &title, &alert.Status, &alert.Timestamp); err != nil {
			continue
		}
		alert.Message = title
		alerts = append(alerts, alert)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "alerts": alerts})
}
