package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"monitoring-service/pkg/logger"
)

// PlatformLogEvent represents a unified log event from any service
type PlatformLogEvent struct {
	ID             string                 `json:"id"`
	EventType      string                 `json:"event_type"`
	EventSubtype   string                 `json:"event_subtype"`
	ResourceType   string                 `json:"resource_type"`
	ResourceID     string                 `json:"resource_id"`
	ProjectID      string                 `json:"project_id,omitempty"`
	CompanyID      string                 `json:"company_id,omitempty"`
	ContainerID    string                 `json:"container_id,omitempty"`
	ContainerName  string                 `json:"container_name,omitempty"`
	Severity       string                 `json:"severity"`
	Message        string                 `json:"message"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
	SourceService  string                 `json:"source_service"`
	SourceHost     string                 `json:"source_host,omitempty"`
	EventTimestamp time.Time              `json:"event_timestamp"`
}

// LogIngestRequest represents a batch log ingestion request
type LogIngestRequest struct {
	Events []PlatformLogEvent `json:"events"`
}

// LogQueryRequest represents a log query request
type LogQueryRequest struct {
	ResourceType string    `json:"resource_type"`
	ResourceID   string    `json:"resource_id"`
	ProjectID    string    `json:"project_id,omitempty"`
	EventTypes   []string  `json:"event_types,omitempty"`
	Severities   []string  `json:"severities,omitempty"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time"`
	Limit        int       `json:"limit"`
	Offset       int       `json:"offset"`
}

// LogQueryResponse represents a log query response
type LogQueryResponse struct {
	Events []PlatformLogEvent `json:"events"`
	Total  int                `json:"total"`
	Limit  int                `json:"limit"`
	Offset int                `json:"offset"`
}

// handleIngestLogs handles batch log ingestion from any service
func (s *Server) handleIngestLogs(c *gin.Context) {
	var req LogIngestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if len(req.Events) == 0 {
		c.JSON(http.StatusOK, gin.H{"ingested": 0})
		return
	}

	// Insert logs into database
	inserted, err := s.insertLogEvents(c.Request.Context(), req.Events)
	if err != nil {
		logger.Error("Failed to insert log events", logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store logs"})
		return
	}

	// Also publish to Redis for real-time streaming
	for _, event := range req.Events {
		s.publishToRedis(c.Request.Context(), event)
	}

	c.JSON(http.StatusOK, gin.H{
		"ingested": inserted,
		"total":    len(req.Events),
	})
}

func (s *Server) insertLogEvents(ctx context.Context, events []PlatformLogEvent) (int, error) {
	query := `
		INSERT INTO platform_log_events (
			id, event_type, event_subtype, resource_type, resource_id,
			project_id, company_id, container_id, container_name,
			severity, message, metadata, source_service, source_host,
			event_timestamp, ingested_at, storage_tier
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), 'hot')
	`

	db := s.orchestrator.GetDB()
	inserted := 0
	for _, event := range events {
		metadataJSON, _ := json.Marshal(event.Metadata)

		// Convert empty strings to NULL for UUID fields
		var projectID, companyID, containerID interface{}
		if event.ProjectID != "" {
			projectID = event.ProjectID
		}
		if event.CompanyID != "" {
			companyID = event.CompanyID
		}
		if event.ContainerID != "" {
			containerID = event.ContainerID
		}

		_, err := db.ExecContext(ctx, query,
			event.ID,
			event.EventType,
			event.EventSubtype,
			event.ResourceType,
			event.ResourceID,
			projectID,
			companyID,
			containerID,
			event.ContainerName,
			event.Severity,
			event.Message,
			metadataJSON,
			event.SourceService,
			event.SourceHost,
			event.EventTimestamp,
		)
		if err != nil {
			logger.Error("Failed to insert log event",
				logger.String("event_id", event.ID),
				logger.Err(err))
			continue
		}
		inserted++
	}

	return inserted, nil
}

func (s *Server) publishToRedis(ctx context.Context, event PlatformLogEvent) {
	// Publish to resource-specific channel for real-time streaming
	channel := fmt.Sprintf("platform:logs:%s:%s", event.ResourceType, event.ResourceID)

	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	s.orchestrator.GetRedis().Publish(ctx, channel, data)
}

// handleQueryLogs queries unified platform logs
func (s *Server) handleQueryLogs(c *gin.Context) {
	var req LogQueryRequest

	// Parse from query parameters or JSON body
	if c.Request.Method == "POST" {
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}
	} else {
		// GET request - parse from query params
		req.ResourceType = c.Query("resource_type")
		req.ResourceID = c.Query("resource_id")
		req.ProjectID = c.Query("project_id")

		if limit, err := strconv.Atoi(c.Query("limit")); err == nil && limit > 0 {
			req.Limit = limit
		} else {
			req.Limit = 100
		}

		if offset, err := strconv.Atoi(c.Query("offset")); err == nil {
			req.Offset = offset
		}
	}

	// Validate required parameters
	if req.ResourceType == "" || req.ResourceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "resource_type and resource_id are required"})
		return
	}

	events, total, err := s.queryLogEvents(c.Request.Context(), req)
	if err != nil {
		logger.Error("Failed to query log events", logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query logs"})
		return
	}

	c.JSON(http.StatusOK, LogQueryResponse{
		Events: events,
		Total:  total,
		Limit:  req.Limit,
		Offset: req.Offset,
	})
}

func (s *Server) queryLogEvents(ctx context.Context, req LogQueryRequest) ([]PlatformLogEvent, int, error) {
	db := s.orchestrator.GetDB()

	// Build dynamic query
	query := `
		SELECT id, event_type, event_subtype, resource_type, resource_id,
			project_id, company_id, container_id, container_name,
			severity, message, metadata, source_service, source_host,
			event_timestamp
		FROM platform_log_events
		WHERE resource_type = $1 AND resource_id = $2
	`
	args := []interface{}{req.ResourceType, req.ResourceID}
	argCount := 2

	if req.ProjectID != "" {
		argCount++
		query += fmt.Sprintf(" AND project_id = $%d", argCount)
		args = append(args, req.ProjectID)
	}

	if len(req.EventTypes) > 0 {
		placeholders := make([]string, len(req.EventTypes))
		for i := range req.EventTypes {
			argCount++
			placeholders[i] = fmt.Sprintf("$%d", argCount)
			args = append(args, req.EventTypes[i])
		}
		query += fmt.Sprintf(" AND event_type IN (%s)", strings.Join(placeholders, ","))
	}

	if len(req.Severities) > 0 {
		placeholders := make([]string, len(req.Severities))
		for i := range req.Severities {
			argCount++
			placeholders[i] = fmt.Sprintf("$%d", argCount)
			args = append(args, req.Severities[i])
		}
		query += fmt.Sprintf(" AND severity IN (%s)", strings.Join(placeholders, ","))
	}

	// Add time range if specified
	if !req.StartTime.IsZero() {
		argCount++
		query += fmt.Sprintf(" AND event_timestamp >= $%d", argCount)
		args = append(args, req.StartTime)
	}
	if !req.EndTime.IsZero() {
		argCount++
		query += fmt.Sprintf(" AND event_timestamp <= $%d", argCount)
		args = append(args, req.EndTime)
	}

	// Get total count
	countQuery := "SELECT COUNT(*) FROM (" + query + ") AS count_query"
	var total int
	err := db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Add ordering and pagination
	query += " ORDER BY event_timestamp DESC"
	if req.Limit > 0 {
		argCount++
		query += fmt.Sprintf(" LIMIT $%d", argCount)
		args = append(args, req.Limit)
	}
	if req.Offset > 0 {
		argCount++
		query += fmt.Sprintf(" OFFSET $%d", argCount)
		args = append(args, req.Offset)
	}

	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var events []PlatformLogEvent
	for rows.Next() {
		var event PlatformLogEvent
		var metadataJSON []byte
		var projectID, companyID, containerID, containerName, sourceHost sql.NullString

		err := rows.Scan(
			&event.ID,
			&event.EventType,
			&event.EventSubtype,
			&event.ResourceType,
			&event.ResourceID,
			&projectID,
			&companyID,
			&containerID,
			&containerName,
			&event.Severity,
			&event.Message,
			&metadataJSON,
			&event.SourceService,
			&sourceHost,
			&event.EventTimestamp,
		)
		if err != nil {
			logger.Error("Failed to scan log event", logger.Err(err))
			continue
		}

		// Convert nullable strings to regular strings
		if projectID.Valid {
			event.ProjectID = projectID.String
		}
		if companyID.Valid {
			event.CompanyID = companyID.String
		}
		if containerID.Valid {
			event.ContainerID = containerID.String
		}
		if containerName.Valid {
			event.ContainerName = containerName.String
		}
		if sourceHost.Valid {
			event.SourceHost = sourceHost.String
		}

		if len(metadataJSON) > 0 {
			json.Unmarshal(metadataJSON, &event.Metadata)
		}

		events = append(events, event)
	}

	return events, total, nil
}

// handleStreamPlatformLogs streams logs in real-time via SSE
func (s *Server) handleStreamPlatformLogs(c *gin.Context) {
	resourceType := c.Param("resourceType")
	resourceID := c.Param("resourceId")

	if resourceType == "" || resourceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "resource type and ID are required"})
		return
	}

	// Check if client supports HTTP/3 - if so, we need special handling
	// HTTP/3 has issues with SSE streaming, so we force HTTP/2 for this endpoint
	proto := c.Request.Proto
	if strings.Contains(c.Request.Header.Get("Alt-Used"), ":443") ||
		strings.Contains(proto, "HTTP/3") {
		// Client is trying HTTP/3 - set headers that discourage HTTP/3
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

	// Add these headers to help with buffering issues
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")

	// Disable compression for SSE (critical for HTTP/2/HTTP/3)
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

	// Subscribe to Redis channel for real-time updates
	channel := fmt.Sprintf("platform:logs:%s:%s", resourceType, resourceID)
	pubsub := s.orchestrator.GetRedis().Subscribe(c.Request.Context(), channel)
	defer pubsub.Close()

	// Send initial connection event using manual SSE format for better compatibility
	fmt.Fprintf(c.Writer, "event: connected\ndata: %s\n\n", mustMarshal(gin.H{
		"resource_type": resourceType,
		"resource_id":   resourceID,
		"message":       "Connected to log stream",
	}))
	flusher.Flush()

	// Set up shorter heartbeat for HTTP/3 compatibility
	heartbeat := time.NewTicker(5 * time.Second)
	defer heartbeat.Stop()

	ch := pubsub.Channel()
	for {
		select {
		case <-c.Request.Context().Done():
			return

		case <-heartbeat.C:
			// Use manual format for heartbeat to ensure proper flushing
			fmt.Fprintf(c.Writer, "event: heartbeat\ndata: %s\n\n", mustMarshal(gin.H{"time": time.Now().Unix()}))
			flusher.Flush()

		case msg := <-ch:
			if msg == nil {
				return
			}

			// Send the log event with immediate flush
			fmt.Fprintf(c.Writer, "event: log\ndata: %s\n\n", msg.Payload)
			flusher.Flush()
		}
	}
}

// mustMarshal is a helper to marshal JSON with error handling
func mustMarshal(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

// handleGetLogStats returns statistics about logs
func (s *Server) handleGetLogStats(c *gin.Context) {
	resourceType := c.Query("resource_type")
	resourceID := c.Query("resource_id")
	projectID := c.Query("project_id")

	stats, err := s.getLogStats(c.Request.Context(), resourceType, resourceID, projectID)
	if err != nil {
		logger.Error("Failed to get log stats", logger.Err(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get statistics"})
		return
	}

	c.JSON(http.StatusOK, stats)
}

func (s *Server) getLogStats(ctx context.Context, resourceType, resourceID, projectID string) (map[string]interface{}, error) {
	db := s.orchestrator.GetDB()

	query := `
		SELECT 
			event_type,
			severity,
			COUNT(*) as count,
			MIN(event_timestamp) as oldest,
			MAX(event_timestamp) as newest
		FROM platform_log_events
		WHERE 1=1
	`
	args := []interface{}{}
	argCount := 0

	if resourceType != "" {
		argCount++
		query += fmt.Sprintf(" AND resource_type = $%d", argCount)
		args = append(args, resourceType)
	}
	if resourceID != "" {
		argCount++
		query += fmt.Sprintf(" AND resource_id = $%d", argCount)
		args = append(args, resourceID)
	}
	if projectID != "" {
		argCount++
		query += fmt.Sprintf(" AND project_id = $%d", argCount)
		args = append(args, projectID)
	}

	query += " GROUP BY event_type, severity"

	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byType := make(map[string]int)
	bySeverity := make(map[string]int)

	for rows.Next() {
		var eventType, severity string
		var count int
		var oldest, newest time.Time

		if err := rows.Scan(&eventType, &severity, &count, &oldest, &newest); err != nil {
			continue
		}

		byType[eventType] += count
		bySeverity[severity] += count
	}

	stats := map[string]interface{}{
		"by_type":     byType,
		"by_severity": bySeverity,
	}

	return stats, nil
}
