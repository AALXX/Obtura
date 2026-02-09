package api

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"regexp"
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
			alerts.POST("/:alertId/acknowledge", s.validateAlertID(), s.handleAcknowledgeAlert)
			alerts.POST("/:alertId/resolve", s.validateAlertID(), s.handleResolveAlert)
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
	matched, _ := regexp.MatchString("^[a-zA-Z0-9_-]{1,50}$", id)
	return matched
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

// Acknowledge alert
func (s *Server) handleAcknowledgeAlert(c *gin.Context) {
	alertID := c.Param("alertId")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	query := `UPDATE alerts SET acknowledged_at = NOW() WHERE id = $1`
	result, err := s.orchestrator.GetDB().ExecContext(ctx, query, alertID)
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

	logger.Info("Alert acknowledged", zap.String("alert_id", alertID))
	c.JSON(http.StatusOK, gin.H{"message": "Alert acknowledged"})
}

// Resolve alert
func (s *Server) handleResolveAlert(c *gin.Context) {
	alertID := c.Param("alertId")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	query := `UPDATE alerts SET status = 'resolved', resolved_at = NOW() WHERE id = $1`
	result, err := s.orchestrator.GetDB().ExecContext(ctx, query, alertID)
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

	logger.Info("Alert resolved", zap.String("alert_id", alertID))
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
		// Set a default timeout of 30 seconds for all requests
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}
