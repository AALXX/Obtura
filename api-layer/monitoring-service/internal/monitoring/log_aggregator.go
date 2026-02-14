package monitoring

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"monitoring-service/pkg/db"
	"monitoring-service/pkg/logger"
	"monitoring-service/pkg/models"
)

type LogAggregator struct {
	orchestrator     *Orchestrator
	logStorage       *db.LogStorage
	lastLogTimestamp map[string]time.Time // Track last seen log timestamp per deployment
}

type LogEntry struct {
	DeploymentID string    `json:"deployment_id"`
	ContainerID  string    `json:"container_id"`
	Timestamp    time.Time `json:"timestamp"`
	Level        string    `json:"level"`
	Message      string    `json:"message"`
	Source       string    `json:"source"`
	Metadata     string    `json:"metadata"`
}

const (
	LogChannelPrefix  = "logs:"
	MaxDBLogsPerQuery = 10000
	LogBatchSize      = 100
)

func NewLogAggregator(o *Orchestrator, logStorage *db.LogStorage) *LogAggregator {
	return &LogAggregator{
		orchestrator:     o,
		logStorage:       logStorage,
		lastLogTimestamp: make(map[string]time.Time),
	}
}

// AggregateAll collects logs from all active deployments
func (la *LogAggregator) AggregateAll(ctx context.Context) error {
	deployments, err := la.getActiveDeployments(ctx)
	if err != nil {
		return fmt.Errorf("failed to get active deployments: %w", err)
	}

	for _, deployment := range deployments {
		if err := la.aggregateDeploymentLogs(ctx, deployment); err != nil {
			log.Printf("Failed to aggregate logs for deployment %s: %v", deployment.ID, err)
		}
	}

	return nil
}

func (la *LogAggregator) aggregateDeploymentLogs(ctx context.Context, deployment *Deployment) error {
	// Get last seen timestamp for this deployment
	var since *time.Time
	if lastTime, exists := la.lastLogTimestamp[deployment.ID]; exists {
		since = &lastTime
	}

	// Get container logs (only new logs since last fetch)
	logs, err := la.orchestrator.dockerClient.GetContainerLogs(ctx, deployment.ContainerID, 100, since)
	if err != nil {
		return fmt.Errorf("failed to get container logs: %w", err)
	}

	// Parse logs
	var entries []*LogEntry
	var newestTimestamp time.Time
	for _, logLine := range logs {
		entry := la.parseLogLine(deployment, logLine)
		entries = append(entries, entry)
		if entry.Timestamp.After(newestTimestamp) {
			newestTimestamp = entry.Timestamp
		}
	}

	// Update last seen timestamp for this deployment
	if !newestTimestamp.IsZero() {
		la.lastLogTimestamp[deployment.ID] = newestTimestamp.Add(time.Second) // Add buffer to avoid edge cases
	}

	// Store logs using hybrid approach:
	// 1. Recent logs -> Database (fast queries)
	// 2. Real-time -> Redis pub/sub
	// 3. Archive -> MinIO (runs separately via worker)

	for _, entry := range entries {
		// Store in database for recent queries (last 24h)
		if time.Since(entry.Timestamp) < db.LogRetentionDB {
			if err := la.storeLogEntry(ctx, entry); err != nil {
				logger.Error("Failed to store log entry in DB", logger.Err(err))
			}
		}

		// Publish to Redis for real-time streaming
		if err := la.publishLogToRedis(ctx, entry); err != nil {
			logger.Error("Failed to publish log to Redis", logger.Err(err))
		}

		// Check for error patterns
		if la.isErrorLog(entry) {
			la.handleErrorLog(ctx, entry)
		}
	}

	return nil
}

func (la *LogAggregator) parseLogLine(deployment *Deployment, logLine string) *LogEntry {
	// Extract timestamp from Docker log format (ISO8601 with nanoseconds)
	// Format: 2026-02-08T22:50:25.703664702Z ▲ Next.js 16.1.6
	timestamp := time.Now()
	message := logLine

	// Try to extract timestamp from beginning of log line
	if len(logLine) > 30 && logLine[10] == 'T' {
		if endIdx := strings.Index(logLine, " "); endIdx > 0 {
			if ts, err := time.Parse(time.RFC3339Nano, logLine[:endIdx]); err == nil {
				timestamp = ts
				message = strings.TrimSpace(logLine[endIdx:])
			}
		}
	}

	entry := &LogEntry{
		DeploymentID: deployment.ID,
		ContainerID:  deployment.ContainerID,
		Timestamp:    timestamp,
		Message:      message,
		Source:       "container",
		Metadata:     "{}",
	}

	// Try to parse JSON logs (after timestamp extraction)
	var jsonLog map[string]interface{}
	if err := json.Unmarshal([]byte(message), &jsonLog); err == nil {
		if level, ok := jsonLog["level"].(string); ok {
			entry.Level = level
		}
		if msg, ok := jsonLog["message"].(string); ok {
			entry.Message = msg
		}
		// Don't override timestamp from Docker - it should match
		// Store additional metadata (exclude fields already extracted)
		delete(jsonLog, "level")
		delete(jsonLog, "message")
		delete(jsonLog, "timestamp")
		if meta, err := json.Marshal(jsonLog); err == nil && string(meta) != "{}" {
			entry.Metadata = string(meta)
		}
	} else {
		// Parse log level from text
		entry.Level = la.detectLogLevel(message)
	}

	return entry
}

func (la *LogAggregator) detectLogLevel(logLine string) string {
	logLine = strings.ToLower(logLine)

	if strings.Contains(logLine, "error") || strings.Contains(logLine, "fatal") {
		return "error"
	}
	if strings.Contains(logLine, "warn") {
		return "warning"
	}
	if strings.Contains(logLine, "info") {
		return "info"
	}
	if strings.Contains(logLine, "debug") {
		return "debug"
	}

	return "info"
}

func (la *LogAggregator) isErrorLog(entry *LogEntry) bool {
	return entry.Level == "error" || entry.Level == "fatal"
}

func (la *LogAggregator) handleErrorLog(ctx context.Context, entry *LogEntry) {
	// Increment error count in Redis
	key := fmt.Sprintf("errors:%s:%s", entry.DeploymentID, time.Now().Format("2006-01-02-15"))
	la.orchestrator.redis.Incr(ctx, key)
	la.orchestrator.redis.Expire(ctx, key, 24*time.Hour)

	// Check if error threshold exceeded
	errorCount, _ := la.orchestrator.redis.Get(ctx, key).Int()
	if errorCount > 10 {
		// Trigger alert
		la.orchestrator.alertManager.TriggerAlert(ctx, &models.Alert{
			DeploymentID: entry.DeploymentID,
			Severity:     "warning",
			Title:        "High error rate detected",
			Description:  fmt.Sprintf("Deployment has logged %d errors in the last hour", errorCount),
			MetricType:   "error_rate",
		})
	}
}

func (la *LogAggregator) storeLogEntry(ctx context.Context, entry *LogEntry) error {
	query := `
		INSERT INTO logs_archive (
			deployment_id, container_id, timestamp, level, message, source, metadata
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (container_id, timestamp, message) DO NOTHING
	`

	_, err := la.orchestrator.db.ExecContext(
		ctx,
		query,
		entry.DeploymentID,
		entry.ContainerID,
		entry.Timestamp,
		entry.Level,
		entry.Message,
		entry.Source,
		entry.Metadata,
	)

	return err
}

func (la *LogAggregator) publishLogToRedis(ctx context.Context, entry *LogEntry) error {
	// Publish to deployment-specific channel
	channel := fmt.Sprintf("%s%s", LogChannelPrefix, entry.DeploymentID)

	logData, err := json.Marshal(entry)
	if err != nil {
		return fmt.Errorf("failed to marshal log entry: %w", err)
	}

	return la.orchestrator.redis.Publish(ctx, channel, logData).Err()
}

// GetRecentLogs retrieves recent logs from database (last 24h)
func (la *LogAggregator) GetRecentLogs(ctx context.Context, deploymentID string, limit int) ([]*LogEntry, error) {
	if limit <= 0 || limit > MaxDBLogsPerQuery {
		limit = MaxDBLogsPerQuery
	}

	query := `
		SELECT deployment_id, container_id, timestamp, level, message, source, metadata
		FROM logs_archive
		WHERE deployment_id = $1 AND timestamp > NOW() - INTERVAL '24 hours'
		ORDER BY timestamp DESC
		LIMIT $2
	`

	rows, err := la.orchestrator.db.QueryContext(ctx, query, deploymentID, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query recent logs: %w", err)
	}
	defer rows.Close()

	var logs []*LogEntry
	for rows.Next() {
		var entry LogEntry
		if err := rows.Scan(
			&entry.DeploymentID,
			&entry.ContainerID,
			&entry.Timestamp,
			&entry.Level,
			&entry.Message,
			&entry.Source,
			&entry.Metadata,
		); err != nil {
			logger.Error("Failed to scan log entry", logger.Err(err))
			continue
		}
		logs = append(logs, &entry)
	}

	return logs, nil
}

// GetArchivedLogs retrieves older logs from MinIO
func (la *LogAggregator) GetArchivedLogs(ctx context.Context, deploymentID string, startDate, endDate time.Time) ([]*LogEntry, error) {
	logs, err := la.logStorage.GetLogs(ctx, deploymentID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get archived logs: %w", err)
	}

	// Convert models.LogEntry to *LogEntry
	var result []*LogEntry
	for i := range logs {
		result = append(result, &LogEntry{
			DeploymentID: logs[i].DeploymentID,
			ContainerID:  logs[i].ContainerID,
			Timestamp:    logs[i].Timestamp,
			Level:        logs[i].Level,
			Message:      logs[i].Message,
			Source:       logs[i].Source,
		})
	}

	return result, nil
}

// ArchiveOldLogs moves logs older than 24h from DB to MinIO
func (la *LogAggregator) ArchiveOldLogs(ctx context.Context) error {
	cutoffTime := time.Now().Add(-db.LogRetentionDB)

	// Get logs to archive (older than 24h but not yet archived)
	query := `
		SELECT id, deployment_id, container_id, timestamp, level, message, source, metadata
		FROM logs_archive
		WHERE timestamp < $1 AND archived_to_minio = false
		ORDER BY deployment_id, timestamp
		LIMIT $2
	`

	rows, err := la.orchestrator.db.QueryContext(ctx, query, cutoffTime, db.MaxLogsPerBatch)
	if err != nil {
		return fmt.Errorf("failed to query logs for archival: %w", err)
	}
	defer rows.Close()

	// Group logs by deployment and date
	logsByDeployment := make(map[string]map[string][]models.LogEntry)
	var logIDs []int

	for rows.Next() {
		var entry LogEntry
		var id int
		if err := rows.Scan(
			&id,
			&entry.DeploymentID,
			&entry.ContainerID,
			&entry.Timestamp,
			&entry.Level,
			&entry.Message,
			&entry.Source,
			&entry.Metadata,
		); err != nil {
			logger.Error("Failed to scan log for archival", logger.Err(err))
			continue
		}

		logIDs = append(logIDs, id)
		date := entry.Timestamp.Format("2006-01-02")

		if _, ok := logsByDeployment[entry.DeploymentID]; !ok {
			logsByDeployment[entry.DeploymentID] = make(map[string][]models.LogEntry)
		}

		// Parse metadata JSON
		var metadata map[string]interface{}
		if entry.Metadata != "" {
			json.Unmarshal([]byte(entry.Metadata), &metadata)
		}

		logsByDeployment[entry.DeploymentID][date] = append(
			logsByDeployment[entry.DeploymentID][date],
			models.LogEntry{
				DeploymentID: entry.DeploymentID,
				ContainerID:  entry.ContainerID,
				Timestamp:    entry.Timestamp,
				Level:        entry.Level,
				Message:      entry.Message,
				Source:       entry.Source,
				Metadata:     metadata,
			},
		)
	}

	// Store logs to MinIO
	for deploymentID, dates := range logsByDeployment {
		for date, logs := range dates {
			d, _ := time.Parse("2006-01-02", date)
			if err := la.logStorage.StoreLogs(ctx, deploymentID, d, logs); err != nil {
				logger.Error("Failed to store logs to MinIO",
					logger.String("deployment_id", deploymentID),
					logger.String("date", date),
					logger.Err(err),
				)
				continue
			}
		}
	}

	// Delete archived logs from DB
	if len(logIDs) > 0 {
		// Use batch delete for performance
		for i := 0; i < len(logIDs); i += 1000 {
			end := i + 1000
			if end > len(logIDs) {
				end = len(logIDs)
			}
			batch := logIDs[i:end]

			// Build delete query with IN clause
			placeholders := make([]string, len(batch))
			args := make([]interface{}, len(batch))
			for j, id := range batch {
				placeholders[j] = fmt.Sprintf("$%d", j+1)
				args[j] = id
			}

			deleteQuery := fmt.Sprintf(
				"DELETE FROM logs_archive WHERE id IN (%s)",
				strings.Join(placeholders, ","),
			)

			if _, err := la.orchestrator.db.ExecContext(ctx, deleteQuery, args...); err != nil {
				logger.Error("Failed to delete archived logs from DB", logger.Err(err))
			}
		}

		logger.Info("Archived logs to MinIO",
			logger.Int("count", len(logIDs)),
		)
	}

	return nil
}

// StreamLogs streams logs in real-time for a deployment using Redis pub/sub
func (la *LogAggregator) StreamLogs(ctx context.Context, deploymentID string) (<-chan *LogEntry, error) {
	logChan := make(chan *LogEntry, 100)

	channel := fmt.Sprintf("%s%s", LogChannelPrefix, deploymentID)
	pubsub := la.orchestrator.redis.Subscribe(ctx, channel)

	go func() {
		defer close(logChan)
		defer pubsub.Close()

		ch := pubsub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg := <-ch:
				if msg == nil {
					return
				}

				var entry LogEntry
				if err := json.Unmarshal([]byte(msg.Payload), &entry); err != nil {
					continue
				}

				select {
				case logChan <- &entry:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	return logChan, nil
}

func (la *LogAggregator) getActiveDeployments(ctx context.Context) ([]*Deployment, error) {
	query := `
		SELECT d.id, dc.container_id 
		FROM deployments d
		JOIN deployment_containers dc ON dc.deployment_id = d.id AND dc.is_active = true
		WHERE d.status IN ('active', 'running', 'starting', 'healthy')
	`
	rows, err := la.orchestrator.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deployments []*Deployment
	for rows.Next() {
		var d Deployment
		if err := rows.Scan(&d.ID, &d.ContainerID); err != nil {
			return nil, err
		}
		deployments = append(deployments, &d)
	}

	return deployments, nil
}

type Deployment struct {
	ID          string
	ContainerID string
}
