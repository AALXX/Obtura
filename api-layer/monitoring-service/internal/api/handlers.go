package api

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"monitoring-service/internal/metrics"
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
		c.Writer.Header().Set("Access-Control-Expose-Headers", "Content-Type")
		c.Writer.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate, proxy-revalidate")
		c.Writer.Header().Set("Connection", "keep-alive")

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

type TimeSeriesPoint struct {
	Time        int64   `json:"time"`
	CPUUsage    float64 `json:"cpuUsage"`
	MemoryUsage int64   `json:"memoryUsage"`
}

type StatusCodeStat struct {
	Code  string `json:"code"`
	Count int64  `json:"count"`
	Label string `json:"label"`
}

type HeatmapPoint struct {
	Day   int `json:"day"`
	Hour  int `json:"hour"`
	Value int `json:"value"`
}

type ProjectMetricsResponse struct {
	ProjectID           string                      `json:"projectId"`
	Production          *DeploymentMetrics          `json:"production,omitempty"`
	Staging             *DeploymentMetrics          `json:"staging,omitempty"`
	AvailableDataTypes  []string                    `json:"availableDataTypes"`
	NotAvailable        []string                    `json:"notAvailable"`
	TimeRange           string                      `json:"timeRange"`
	Timestamp           time.Time                   `json:"timestamp"`
	TimeSeriesData      []TimeSeriesPoint           `json:"timeSeriesData,omitempty"`
	LatencyDistribution []metrics.LatencyBucket     `json:"latencyDistribution,omitempty"`
	StatusCodes         []StatusCodeStat            `json:"statusCodes,omitempty"`
	Endpoints           []metrics.EndpointStat      `json:"endpoints,omitempty"`
	GeographicData      []metrics.GeoStat           `json:"geographicData,omitempty"`
	HeatmapData         []HeatmapPoint              `json:"heatmapData,omitempty"`
	RequestsData        []metrics.RequestsDataPoint `json:"requestsData,omitempty"`
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

	response := ProjectMetricsResponse{
		ProjectID:          projectID,
		AvailableDataTypes: available,
		NotAvailable:       notAvailable,
		TimeRange:          timeRange,
		Timestamp:          time.Now(),
	}

	if prodDeployment != nil {
		response.Production = prodMetrics
		// Fetch historical time series data for production deployment
		timeSeriesData, err := s.getDeploymentTimeSeriesData(ctx, *prodDeployment, timeRange)
		if err != nil {
			logger.Error("Failed to get time series data", zap.String("deployment_id", *prodDeployment), logger.Err(err))
		} else {
			response.TimeSeriesData = timeSeriesData
			if len(timeSeriesData) > 0 {
				available = append(available, "timeSeriesData")
			}
		}

		// Fetch HTTP metrics for production deployment
		httpMetrics, err := s.getHTTPMetrics(ctx, *prodDeployment, timeRange)
		if err != nil {
			logger.Error("Failed to get HTTP metrics", zap.String("deployment_id", *prodDeployment), logger.Err(err))
			notAvailable = append(notAvailable, "latencyDistribution", "statusCodes", "endpoints", "geographicData", "heatmapData", "requestsData")
		} else {
			response.LatencyDistribution = httpMetrics.LatencyDistribution
			response.StatusCodes = httpMetrics.StatusCodes
			response.Endpoints = httpMetrics.Endpoints
			response.GeographicData = httpMetrics.GeographicData
			response.HeatmapData = httpMetrics.HeatmapData
			response.RequestsData = httpMetrics.RequestsData

			if len(httpMetrics.LatencyDistribution) > 0 {
				available = append(available, "latencyDistribution")
			}
			if len(httpMetrics.StatusCodes) > 0 {
				available = append(available, "statusCodes")
			}
			if len(httpMetrics.Endpoints) > 0 {
				available = append(available, "endpoints")
			}
			if len(httpMetrics.GeographicData) > 0 {
				available = append(available, "geographicData")
			}
			if len(httpMetrics.HeatmapData) > 0 {
				available = append(available, "heatmapData")
			}
			if len(httpMetrics.RequestsData) > 0 {
				available = append(available, "requestsData")
			}
		}
	}
	if stagingDeployment != nil {
		response.Staging = stagingMetrics
	}

	response.AvailableDataTypes = available
	response.NotAvailable = notAvailable

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"metrics": response,
		},
	})
}

func (s *Server) getProductionDeploymentMetrics(ctx context.Context, projectID string) (*string, *DeploymentMetrics) {
	// Get production deployment with its container info and HTTP metrics
	query := `
		SELECT 
			d.id, d.status,
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
	var cpuPercent, memMB sql.NullFloat64

	err := s.orchestrator.GetDB().QueryRowContext(ctx, query, projectID).Scan(
		&deploymentID, &status,
		&containerID, &cpuPercent, &memMB, &containerHealth, &containerStatus,
	)

	if err == sql.ErrNoRows {
		// This is normal during SSE initialization - no need to warn
		return nil, nil
	}
	if err != nil {
		logger.Error("Failed to get production deployment metrics", zap.String("project_id", projectID), logger.Err(err))
		return nil, nil
	}

	// Check if deployment ID is empty after successful query
	if !deploymentID.Valid || deploymentID.String == "" {
		return nil, nil
	}

	// Get HTTP metrics for this deployment
	httpQuery := `
		SELECT 
			COALESCE(SUM(request_count), 0)::integer as requests_per_minute,
			COALESCE(AVG(latency_avg), 0)::integer as latency_avg,
			COALESCE(AVG(error_rate) * 100, 0) as error_rate
		FROM http_metrics_minute
		WHERE deployment_id = $1
		  AND timestamp_minute >= NOW() - INTERVAL '5 minutes'
	`
	var requestsPerMin, avgLatencyMs int
	var errorRate float64
	s.orchestrator.GetDB().QueryRowContext(ctx, httpQuery, deploymentID.String).Scan(&requestsPerMin, &avgLatencyMs, &errorRate)

	logger.Info("Production deployment metrics query result",
		zap.String("deployment_id", deploymentID.String),
		zap.String("status", status.String),
		zap.String("container_id", containerID.String),
		zap.Float64("cpu", cpuPercent.Float64),
		zap.Float64("memory", memMB.Float64),
		zap.String("health", containerHealth.String),
		zap.Int("requests_per_min", requestsPerMin),
		zap.Int("latency_avg", avgLatencyMs),
	)

	// Use HTTP metrics error rate, or fallback to container health
	errRate := fmt.Sprintf("%.2f", errorRate)
	if errorRate == 0 && (containerHealth.String == "unhealthy" || containerStatus.String == "unhealthy") {
		errRate = "100.00"
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
	if !cpuPercent.Valid {
		cpuUsage = -1 // Will show as N/A in UI
	}
	if !memMB.Valid {
		memUsage = 0
	}

	return &deploymentID.String, &DeploymentMetrics{
		DeploymentID:   deploymentID.String,
		CPUUsage:       cpuUsage,
		MemoryUsage:    memUsage,
		NetworkRx:      0,
		NetworkTx:      0,
		RequestsPerMin: requestsPerMin,
		AvgLatency:     fmt.Sprintf("%dms", avgLatencyMs),
		ErrorRate:      errRate + "%",
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

func (s *Server) getDeploymentTimeSeriesData(ctx context.Context, deploymentID string, timeRange string) ([]TimeSeriesPoint, error) {
	// Parse timeRange into hours for debugging
	timeRangeSQL := ""
	switch timeRange {
	case "1h":
		timeRangeSQL = "1 hour"
	case "6h":
		timeRangeSQL = "6 hours"
	case "24h":
		timeRangeSQL = "24 hours"
	case "7d":
		timeRangeSQL = "7 days"
	case "30d":
		timeRangeSQL = "30 days"
	default:
		timeRangeSQL = "24 hours"
	}

	query := `
		SELECT 
			EXTRACT(EPOCH FROM timestamp) * 1000 as time_ms,
			COALESCE(cpu_usage, 0) as cpu_usage,
			COALESCE(memory_usage, 0) as memory_usage,
			COALESCE(network_rx, 0) as network_rx,
			COALESCE(network_tx, 0) as network_tx
		FROM deployments_metrics
		WHERE deployment_id = $1 
		  AND timestamp >= NOW() - $2::interval
		ORDER BY timestamp ASC
	`

	logger.Info("Querying time series data",
		zap.String("deployment_id", deploymentID),
		zap.String("time_range", timeRange),
		zap.String("interval", timeRangeSQL))

	rows, err := s.orchestrator.GetDB().QueryContext(ctx, query, deploymentID, timeRangeSQL)
	if err != nil {
		logger.Error("Failed to query time series", zap.String("deployment_id", deploymentID), logger.Err(err))
		return nil, fmt.Errorf("failed to query time series data: %w", err)
	}
	defer rows.Close()

	var data []TimeSeriesPoint
	rowCount := 0
	for rows.Next() {
		rowCount++
		var point TimeSeriesPoint
		var netRx, netTx int64
		var timeFloat float64
		err := rows.Scan(
			&timeFloat,
			&point.CPUUsage,
			&point.MemoryUsage,
			&netRx,
			&netTx,
		)
		if err != nil {
			logger.Error("Failed to scan time series row", zap.Int("row", rowCount), logger.Err(err))
			continue
		}
		point.Time = int64(timeFloat)
		data = append(data, point)
	}

	if err = rows.Err(); err != nil {
		logger.Error("Error iterating rows", logger.Err(err))
		return nil, fmt.Errorf("error iterating time series rows: %w", err)
	}

	logger.Info("Retrieved time series data",
		zap.String("deployment_id", deploymentID),
		zap.Int("total_rows", rowCount),
		zap.Int("valid_points", len(data)),
		zap.String("time_range", timeRange))

	return data, nil
}

type HTTPMetricsData struct {
	LatencyDistribution []metrics.LatencyBucket
	StatusCodes         []StatusCodeStat
	Endpoints           []metrics.EndpointStat
	GeographicData      []metrics.GeoStat
	HeatmapData         []HeatmapPoint
	RequestsData        []metrics.RequestsDataPoint
}

func (s *Server) getHTTPMetrics(ctx context.Context, deploymentID string, timeRange string) (*HTTPMetricsData, error) {
	interval := getTimeRangeInterval(timeRange)

	data := &HTTPMetricsData{}

	// Get latency distribution
	latencyQuery := `
		SELECT 
			CASE 
				WHEN latency_avg < 50 THEN '0-50ms'
				WHEN latency_avg < 100 THEN '50-100ms'
				WHEN latency_avg < 200 THEN '100-200ms'
				WHEN latency_avg < 500 THEN '200-500ms'
				WHEN latency_avg < 1000 THEN '500ms-1s'
				ELSE '>1s'
			END as bucket,
			SUM(request_count) as count
		FROM http_metrics_minute
		WHERE deployment_id = $1 
		  AND timestamp_minute >= NOW() - $2::interval
		GROUP BY 1
		ORDER BY MIN(latency_avg)
	`
	latencyRows, err := s.orchestrator.GetDB().QueryContext(ctx, latencyQuery, deploymentID, interval)
	if err == nil {
		defer latencyRows.Close()
		for latencyRows.Next() {
			var b metrics.LatencyBucket
			var count int64
			if err := latencyRows.Scan(&b.Bucket, &count); err == nil {
				b.Count = count
				data.LatencyDistribution = append(data.LatencyDistribution, b)
			}
		}
	}

	// Get status codes
	statusQuery := `
		SELECT 
			status_code::text as code,
			SUM(request_count) as count
		FROM http_metrics_minute
		WHERE deployment_id = $1 
		  AND timestamp_minute >= NOW() - $2::interval
		GROUP BY status_code
		ORDER BY count DESC
	`
	statusRows, err := s.orchestrator.GetDB().QueryContext(ctx, statusQuery, deploymentID, interval)
	if err == nil {
		defer statusRows.Close()
		for statusRows.Next() {
			var stat StatusCodeStat
			if err := statusRows.Scan(&stat.Code, &stat.Count); err == nil {
				stat.Label = getStatusCodeLabel(stat.Code)
				data.StatusCodes = append(data.StatusCodes, stat)
			}
		}
	}

	// Get top endpoints - aggregate from http_metrics_minute
	endpointsQuery := `
		SELECT 
			'/' || SUBSTRING(deployment_id::text, 1, 8) as path_normalized,
			'GET' as method,
			SUM(request_count) as request_count,
			AVG(latency_avg)::integer as latency_avg,
			AVG(error_rate) * 100 as error_rate
		FROM http_metrics_minute
		WHERE deployment_id = $1 
		  AND timestamp_minute >= NOW() - $2::interval
		GROUP BY deployment_id
		ORDER BY request_count DESC
		LIMIT 10
	`
	endpointsRows, err := s.orchestrator.GetDB().QueryContext(ctx, endpointsQuery, deploymentID, interval)
	if err == nil {
		defer endpointsRows.Close()
		for endpointsRows.Next() {
			var e metrics.EndpointStat
			var errorRate float64
			if err := endpointsRows.Scan(&e.Path, &e.Method, &e.RequestCount, &e.AvgLatency, &errorRate); err == nil {
				e.ErrorRate = fmt.Sprintf("%.2f", errorRate)
				data.Endpoints = append(data.Endpoints, e)
			}
		}
	}

	// Get geographic distribution - use container region as placeholder
	geoQuery := `
		SELECT 
			'US' as country_code,
			'Unknown' as region,
			SUM(request_count) as request_count
		FROM http_metrics_minute
		WHERE deployment_id = $1 
		  AND timestamp_minute >= NOW() - $2::interval
		GROUP BY deployment_id
		ORDER BY request_count DESC
		LIMIT 10
	`
	geoRows, err := s.orchestrator.GetDB().QueryContext(ctx, geoQuery, deploymentID, interval)
	if err == nil {
		defer geoRows.Close()
		totalRequests := 0
		for geoRows.Next() {
			var g metrics.GeoStat
			if err := geoRows.Scan(&g.CountryCode, &g.Region, &g.Requests); err == nil {
				totalRequests += g.Requests
				data.GeographicData = append(data.GeographicData, g)
			}
		}
		for i := range data.GeographicData {
			if totalRequests > 0 {
				data.GeographicData[i].Percentage = (data.GeographicData[i].Requests * 100) / totalRequests
			}
		}
	}

	// Get heatmap data (requests by hour and day)
	heatmapQuery := `
		SELECT 
			EXTRACT(DOW FROM timestamp_minute)::int as day,
			EXTRACT(HOUR FROM timestamp_minute)::int as hour,
			SUM(request_count) as value
		FROM http_metrics_minute
		WHERE deployment_id = $1 
		  AND timestamp_minute >= NOW() - $2::interval
		GROUP BY 1, 2
		ORDER BY 1, 2
	`
	heatmapRows, err := s.orchestrator.GetDB().QueryContext(ctx, heatmapQuery, deploymentID, interval)
	if err == nil {
		defer heatmapRows.Close()
		for heatmapRows.Next() {
			var h HeatmapPoint
			if err := heatmapRows.Scan(&h.Day, &h.Hour, &h.Value); err == nil {
				data.HeatmapData = append(data.HeatmapData, h)
			}
		}
	}

	// Get requests time series
	requestsQuery := `
		SELECT 
			EXTRACT(EPOCH FROM timestamp_minute) * 1000 as time_ms,
			COALESCE(requests_per_minute, 0) as rpm,
			COALESCE(latency_avg, 0) as latency,
			COALESCE(error_rate, 0) as error_rate
		FROM http_metrics_minute
		WHERE deployment_id = $1 
		  AND timestamp_minute >= NOW() - $2::interval
		ORDER BY timestamp_minute ASC
	`
	requestsRows, err := s.orchestrator.GetDB().QueryContext(ctx, requestsQuery, deploymentID, interval)
	if err == nil {
		defer requestsRows.Close()
		for requestsRows.Next() {
			var d metrics.RequestsDataPoint
			var timeMs float64
			var errorRate float64
			if err := requestsRows.Scan(&timeMs, &d.RequestsPerMin, &d.AvgLatency, &errorRate); err == nil {
				d.Time = int64(timeMs)
				d.ErrorRate = errorRate * 100
				data.RequestsData = append(data.RequestsData, d)
			}
		}
	}

	return data, nil
}

func getStatusCodeLabel(code string) string {
	labels := map[string]string{
		"200": "OK",
		"201": "Created",
		"204": "No Content",
		"301": "Moved Permanently",
		"302": "Found",
		"304": "Not Modified",
		"400": "Bad Request",
		"401": "Unauthorized",
		"403": "Forbidden",
		"404": "Not Found",
		"405": "Method Not Allowed",
		"429": "Too Many Requests",
		"500": "Internal Server Error",
		"502": "Bad Gateway",
		"503": "Service Unavailable",
	}
	if label, ok := labels[code]; ok {
		return label
	}
	return code
}

func getTimeRangeInterval(timeRange string) string {
	switch timeRange {
	case "1h":
		return "1 hour"
	case "6h":
		return "6 hours"
	case "24h":
		return "24 hours"
	case "7d":
		return "7 days"
	case "30d":
		return "30 days"
	default:
		return "24 hours"
	}
}

func (s *Server) handleProjectMetricsSSE(c *gin.Context) {
	projectID := c.Param("projectId")
	timeRange := c.DefaultQuery("timeRange", "24h")

	proto := c.Request.Proto
	if strings.Contains(c.Request.Header.Get("Alt-Used"), ":443") ||
		strings.Contains(proto, "HTTP/3") {
		c.Header("Alt-Svc", "clear")
	}

	// Set SSE headers - critical for HTTP/2/HTTP/3 compatibility
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache, no-store, must-revalidate, proxy-revalidate")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
	c.Header("Access-Control-Expose-Headers", "Content-Type")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
	c.Header("Content-Encoding", "identity")
	c.Header("Transfer-Encoding", "identity")

	// Get the flusher interface for proper streaming
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Streaming not supported"})
		return
	}

	// Write status and headers immediately
	c.Status(http.StatusOK)
	flusher.Flush()

	logger.Info("SSE connection opened for project", zap.String("project_id", projectID))

	// Create a channel to signal client disconnect
	clientGone := c.Request.Context().Done()

	// Send an initial comment to establish connection first
	fmt.Fprintf(c.Writer, ":ok\n\n")
	flusher.Flush()

	// Then send initial data
	s.sendProjectMetricsEvent(c, flusher, projectID, timeRange)

	// Send heartbeat every 5 seconds (shorter for HTTP/3 compatibility)
	heartbeat := time.NewTicker(5 * time.Second)
	metricsTicker := time.NewTicker(5 * time.Second)
	defer heartbeat.Stop()
	defer metricsTicker.Stop()

	// Send an initial comment to establish connection
	fmt.Fprintf(c.Writer, ":ok\n\n")
	flusher.Flush()

	for {
		select {
		case <-clientGone:
			logger.Info("SSE client disconnected", zap.String("project_id", projectID))
			return
		case <-heartbeat.C:
			fmt.Fprintf(c.Writer, "event: heartbeat\ndata: %s\n\n", mustMarshal(gin.H{"timestamp": time.Now().Unix()}))
			flusher.Flush()
		case <-metricsTicker.C:
			s.sendProjectMetricsEvent(c, flusher, projectID, timeRange)
		}
	}
}

func (s *Server) sendProjectMetricsEvent(c *gin.Context, flusher http.Flusher, projectID, timeRange string) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	prodID, prodMetrics := s.getProductionDeploymentMetrics(ctx, projectID)
	stagingID, stagingMetrics := s.getStagingDeploymentMetrics(ctx, projectID)

	available := []string{}
	notAvailable := []string{}

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
		// Fetch time series data for SSE updates too
		timeSeriesData, err := s.getDeploymentTimeSeriesData(ctx, *prodID, timeRange)
		if err != nil {
			logger.Error("Failed to get SSE time series data", zap.String("deployment_id", *prodID), logger.Err(err))
		} else {
			response.TimeSeriesData = timeSeriesData
			if len(timeSeriesData) > 0 {
				available = append(available, "timeSeriesData")
			}
		}

		// Fetch HTTP metrics for production deployment
		httpMetrics, err := s.getHTTPMetrics(ctx, *prodID, timeRange)
		if err != nil {
			logger.Error("Failed to get SSE HTTP metrics", zap.String("deployment_id", *prodID), logger.Err(err))
			notAvailable = append(notAvailable, "latencyDistribution", "statusCodes", "endpoints", "geographicData", "heatmapData", "requestsData")
		} else {
			response.LatencyDistribution = httpMetrics.LatencyDistribution
			response.StatusCodes = httpMetrics.StatusCodes
			response.Endpoints = httpMetrics.Endpoints
			response.GeographicData = httpMetrics.GeographicData
			response.HeatmapData = httpMetrics.HeatmapData
			response.RequestsData = httpMetrics.RequestsData

			if len(httpMetrics.LatencyDistribution) > 0 {
				available = append(available, "latencyDistribution")
			}
			if len(httpMetrics.StatusCodes) > 0 {
				available = append(available, "statusCodes")
			}
			if len(httpMetrics.Endpoints) > 0 {
				available = append(available, "endpoints")
			}
			if len(httpMetrics.GeographicData) > 0 {
				available = append(available, "geographicData")
			}
			if len(httpMetrics.HeatmapData) > 0 {
				available = append(available, "heatmapData")
			}
			if len(httpMetrics.RequestsData) > 0 {
				available = append(available, "requestsData")
			}
		}
	}
	if stagingID != nil {
		response.Staging = stagingMetrics
	}

	response.AvailableDataTypes = available
	response.NotAvailable = notAvailable

	metricsData := gin.H{
		"metrics":   response,
		"alerts":    []ProjectAlert{},
		"timestamp": time.Now().Format(time.RFC3339),
	}
	fmt.Fprintf(c.Writer, "event: metrics\ndata: %s\n\n", mustMarshal(metricsData))
	flusher.Flush()
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
