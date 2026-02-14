package monitoring

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"monitoring-service/pkg/models"
)

type AlertManager struct {
	orchestrator *Orchestrator
	alertRules   []*AlertRule
}

type AlertRule struct {
	Name      string
	Condition string
	Duration  time.Duration
	Severity  string
	Channels  []string
}

func NewAlertManager(o *Orchestrator) *AlertManager {
	am := &AlertManager{
		orchestrator: o,
		alertRules:   make([]*AlertRule, 0),
	}

	// Load alert rules from configuration
	am.loadAlertRules()

	return am
}

func (am *AlertManager) loadAlertRules() {
	// Default alert rules
	am.alertRules = []*AlertRule{
		{
			Name:      "cpu_threshold",
			Condition: "cpu_usage > 85",
			Duration:  5 * time.Minute,
			Severity:  "critical",
			Channels:  []string{"email", "slack"},
		},
		{
			Name:      "memory_limit",
			Condition: "memory_usage > 90",
			Duration:  5 * time.Minute,
			Severity:  "critical",
			Channels:  []string{"email", "slack"},
		},
		{
			Name:      "high_error_rate",
			Condition: "error_rate > 10",
			Duration:  2 * time.Minute,
			Severity:  "warning",
			Channels:  []string{"slack"},
		},
		{
			Name:      "high_response_time",
			Condition: "response_time > 1000",
			Duration:  2 * time.Minute,
			Severity:  "warning",
			Channels:  []string{"slack"},
		},
		{
			Name:      "health_check_failed",
			Condition: "health_status == failed",
			Duration:  1 * time.Minute,
			Severity:  "critical",
			Channels:  []string{"email", "slack"},
		},
	}
}

// ProcessAlerts evaluates alert conditions and triggers notifications
func (am *AlertManager) ProcessAlerts(ctx context.Context) error {
	// Get all active deployments
	deployments, err := am.getActiveDeployments(ctx)
	if err != nil {
		return fmt.Errorf("failed to get active deployments: %w", err)
	}

	for _, deployment := range deployments {
		// Get latest metrics for deployment
		metrics, err := am.getLatestMetrics(ctx, deployment.ID)
		if err != nil {
			log.Printf("Failed to get metrics for deployment %s: %v", deployment.ID, err)
			continue
		}

		// Evaluate alert rules
		for _, rule := range am.alertRules {
			if am.evaluateRule(rule, metrics, deployment) {
				if err := am.createAlert(ctx, deployment.ID, rule, metrics); err != nil {
					log.Printf("Failed to create alert for deployment %s: %v", deployment.ID, err)
				}
			}
		}
	}

	// Process pending alerts for notifications
	if err := am.processPendingAlerts(ctx); err != nil {
		return fmt.Errorf("failed to process pending alerts: %w", err)
	}

	return nil
}

// TriggerAlert manually triggers an alert
func (am *AlertManager) TriggerAlert(ctx context.Context, alert *models.Alert) error {
	// First, get the project_id for this deployment
	var projectID string
	projectQuery := `SELECT project_id FROM deployments WHERE id = $1`
	err := am.orchestrator.db.QueryRowContext(ctx, projectQuery, alert.DeploymentID).Scan(&projectID)
	if err != nil {
		log.Printf("Warning: Could not get project_id for deployment %s: %v", alert.DeploymentID, err)
		// Continue without project_id - it will be NULL in the database
	}

	alertData, err := json.Marshal(map[string]interface{}{
		"threshold_value": alert.ThresholdValue,
		"current_value":   alert.CurrentValue,
		"metric_type":     alert.MetricType,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal alert data: %w", err)
	}

	query := `
		INSERT INTO deployment_alerts (
			deployment_id, project_id, alert_type, severity, alert_message, alert_data
		) VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at
	`

	err = am.orchestrator.db.QueryRowContext(
		ctx,
		query,
		alert.DeploymentID,
		projectID,
		alert.MetricType,
		alert.Severity,
		alert.Description,
		alertData,
	).Scan(&alert.ID, &alert.TriggeredAt)

	if err != nil {
		return fmt.Errorf("failed to create alert: %w", err)
	}

	alert.Status = "active"

	// Send notification
	go am.sendNotification(alert)

	return nil
}

func (am *AlertManager) evaluateRule(rule *AlertRule, metrics map[string]interface{}, deployment *models.Deployment) bool {
	// Simple rule evaluation logic
	// In production, use a proper expression evaluator
	switch rule.Name {
	case "cpu_threshold":
		if cpu, ok := metrics["cpu_usage"].(float64); ok && cpu > 85 {
			return true
		}
	case "memory_limit":
		if mem, ok := metrics["memory_usage"].(float64); ok && mem > 90 {
			return true
		}
	case "high_error_rate":
		if errorRate, ok := metrics["error_rate"].(float64); ok && errorRate > 10 {
			return true
		}
	case "high_response_time":
		if responseTime, ok := metrics["response_time"].(float64); ok && responseTime > 1000 {
			return true
		}
	case "health_check_failed":
		if healthStatus, ok := metrics["health_status"].(string); ok && healthStatus == "failed" {
			return true
		}
	}
	return false
}

func (am *AlertManager) createAlert(ctx context.Context, deploymentID string, rule *AlertRule, metrics map[string]interface{}) error {
	// Check if alert already exists and is active
	exists, err := am.alertExists(ctx, deploymentID, rule.Name)
	if err != nil || exists {
		return err
	}

	alert := &models.Alert{
		DeploymentID: deploymentID,
		Severity:     rule.Severity,
		Title:        fmt.Sprintf("Alert: %s", rule.Name),
		Description:  fmt.Sprintf("Alert condition met: %s", rule.Condition),
		MetricType:   rule.Name,
		Status:       "active",
	}

	// Add current and threshold values based on rule type
	switch rule.Name {
	case "cpu_threshold":
		alert.CurrentValue = metrics["cpu_usage"].(float64)
		alert.ThresholdValue = 85.0
	case "memory_limit":
		alert.CurrentValue = metrics["memory_usage"].(float64)
		alert.ThresholdValue = 90.0
	case "high_error_rate":
		alert.CurrentValue = metrics["error_rate"].(float64)
		alert.ThresholdValue = 10.0
	case "high_response_time":
		if responseTime, ok := metrics["response_time"].(float64); ok {
			alert.CurrentValue = responseTime
			alert.ThresholdValue = 1000.0
		}
	}

	return am.TriggerAlert(ctx, alert)
}

func (am *AlertManager) alertExists(ctx context.Context, deploymentID, alertType string) (bool, error) {
	query := `
		SELECT COUNT(*) FROM deployment_alerts
		WHERE deployment_id = $1 AND alert_type = $2 AND resolved = false
		AND created_at > NOW() - INTERVAL '1 hour'
	`

	var count int
	err := am.orchestrator.db.QueryRowContext(ctx, query, deploymentID, alertType).Scan(&count)
	if err != nil {
		return false, err
	}

	return count > 0, nil
}

func (am *AlertManager) processPendingAlerts(ctx context.Context) error {
	query := `
		SELECT id, deployment_id, alert_type, severity, alert_message, alert_data
		FROM deployment_alerts
		WHERE resolved = false 
		AND NOT (notified_users ? 'sent' OR notified_users @> '["sent"]'::jsonb)
		ORDER BY created_at DESC
		LIMIT 100
	`

	rows, err := am.orchestrator.db.QueryContext(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var alert models.Alert
		var alertData []byte
		if err := rows.Scan(&alert.ID, &alert.DeploymentID, &alert.MetricType, &alert.Severity, &alert.Description, &alertData); err != nil {
			log.Printf("Failed to scan alert: %v", err)
			continue
		}

		// Parse alert data
		var data map[string]interface{}
		if err := json.Unmarshal(alertData, &data); err == nil {
			if currentVal, ok := data["current_value"].(float64); ok {
				alert.CurrentValue = currentVal
			}
			if thresholdVal, ok := data["threshold_value"].(float64); ok {
				alert.ThresholdValue = thresholdVal
			}
		}

		go am.sendNotification(&alert)
	}

	return nil
}

func (am *AlertManager) sendNotification(alert *models.Alert) {
	// Get notification channels for this alert
	channels := am.getNotificationChannels(alert)

	for _, channel := range channels {
		switch channel {
		case "email":
			am.sendEmailNotification(alert)
		case "slack":
			am.sendSlackNotification(alert)
		case "webhook":
			am.sendWebhookNotification(alert)
		}
	}

	// Mark notification as sent
	am.markNotificationSent(alert.ID)
}

func (am *AlertManager) sendEmailNotification(alert *models.Alert) {
	// Implement email notification
	log.Printf("Sending email notification for alert: %s", alert.Description)
}

func (am *AlertManager) sendSlackNotification(alert *models.Alert) {
	// Implement Slack notification
	log.Printf("Sending Slack notification for alert: %s", alert.Description)
}

func (am *AlertManager) sendWebhookNotification(alert *models.Alert) {
	// Implement webhook notification
	log.Printf("Sending webhook notification for alert: %s", alert.Description)
}

func (am *AlertManager) markNotificationSent(alertID string) {
	query := `UPDATE deployment_alerts SET notified_users = notified_users || '["sent"]'::jsonb WHERE id = $1`
	if _, err := am.orchestrator.db.Exec(query, alertID); err != nil {
		log.Printf("Failed to mark notification as sent: %v", err)
	}
}

func (am *AlertManager) getNotificationChannels(alert *models.Alert) []string {
	// Return channels based on severity
	if alert.Severity == "critical" {
		return []string{"email", "slack"}
	}
	return []string{"slack"}
}

// ResolveAlert marks an alert as resolved
func (am *AlertManager) ResolveAlert(ctx context.Context, alertID string, userID string) error {
	query := `
		UPDATE deployment_alerts 
		SET resolved = true, resolved_at = NOW(), resolved_by_user_id = $2
		WHERE id = $1
	`

	_, err := am.orchestrator.db.ExecContext(ctx, query, alertID, userID)
	if err != nil {
		return fmt.Errorf("failed to resolve alert: %w", err)
	}

	return nil
}

// GetActiveAlerts retrieves all active alerts for a deployment
func (am *AlertManager) GetActiveAlerts(ctx context.Context, deploymentID string) ([]*models.Alert, error) {
	query := `
		SELECT id, deployment_id, alert_type, severity, alert_message, alert_data, created_at
		FROM deployment_alerts
		WHERE deployment_id = $1 AND resolved = false
		ORDER BY created_at DESC
	`

	rows, err := am.orchestrator.db.QueryContext(ctx, query, deploymentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []*models.Alert
	for rows.Next() {
		var alert models.Alert
		var alertData []byte
		if err := rows.Scan(&alert.ID, &alert.DeploymentID, &alert.MetricType, &alert.Severity, &alert.Description, &alertData, &alert.TriggeredAt); err != nil {
			return nil, err
		}

		// Parse alert data
		var data map[string]interface{}
		if err := json.Unmarshal(alertData, &data); err == nil {
			if currentVal, ok := data["current_value"].(float64); ok {
				alert.CurrentValue = currentVal
			}
			if thresholdVal, ok := data["threshold_value"].(float64); ok {
				alert.ThresholdValue = thresholdVal
			}
		}

		alerts = append(alerts, &alert)
	}

	return alerts, nil
}

func (am *AlertManager) getActiveDeployments(ctx context.Context) ([]*models.Deployment, error) {
	query := `
		SELECT 
			d.id, 
			d.status, 
			dc.status as container_status
		FROM deployments d
		JOIN deployment_containers dc ON dc.deployment_id = d.id AND dc.is_active = true
		WHERE d.status NOT IN ('deleted', 'terminated', 'rolled_back')
	`
	rows, err := am.orchestrator.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deployments []*models.Deployment
	for rows.Next() {
		var d models.Deployment
		if err := rows.Scan(&d.ID, &d.Status, &d.ContainerStatus); err != nil {
			return nil, err
		}
		deployments = append(deployments, &d)
	}

	return deployments, nil
}

func (am *AlertManager) getLatestMetrics(ctx context.Context, deploymentID string) (map[string]interface{}, error) {
	query := `
		SELECT cpu_usage, memory_usage, status
		FROM deployments_metrics
		WHERE deployment_id = $1
		ORDER BY timestamp DESC
		LIMIT 1
	`

	var cpu, mem float64
	var status string

	err := am.orchestrator.db.QueryRowContext(ctx, query, deploymentID).Scan(&cpu, &mem, &status)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"cpu_usage":    cpu,
		"memory_usage": mem,
		"status":       status,
	}, nil
}
