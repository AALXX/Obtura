package monitoring

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"monitoring-service/pkg/models"
)

type HealthChecker struct {
	orchestrator *Orchestrator
	httpClient   *http.Client
}

func NewHealthChecker(o *Orchestrator) *HealthChecker {
	return &HealthChecker{
		orchestrator: o,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// CheckAll runs health checks for all active deployments
func (hc *HealthChecker) CheckAll(ctx context.Context) error {
	deployments, err := hc.getActiveDeployments(ctx)
	if err != nil {
		return fmt.Errorf("failed to get active deployments: %w", err)
	}

	for _, deployment := range deployments {
		if err := hc.checkDeployment(ctx, deployment); err != nil {
			log.Printf("Health check failed for deployment %s: %v", deployment.ID, err)
		}
	}

	return nil
}

func (hc *HealthChecker) checkDeployment(ctx context.Context, deployment *models.Deployment) error {
	// HTTP health check
	if deployment.HealthCheckEndpoint != "" {
		if err := hc.performHTTPCheck(ctx, deployment); err != nil {
			return err
		}
	}

	// Container health check
	if err := hc.performContainerCheck(ctx, deployment); err != nil {
		return err
	}

	// Custom health checks based on deployment type
	if err := hc.performCustomChecks(ctx, deployment); err != nil {
		return err
	}

	return nil
}

func (hc *HealthChecker) performHTTPCheck(ctx context.Context, deployment *models.Deployment) error {
	startTime := time.Now()

	req, err := http.NewRequestWithContext(ctx, "GET", deployment.HealthCheckEndpoint, nil)
	if err != nil {
		return hc.recordHealthCheck(deployment.ID, "http", "failed", 0, 0, err.Error())
	}

	resp, err := hc.httpClient.Do(req)
	responseTime := time.Since(startTime).Milliseconds()

	if err != nil {
		return hc.recordHealthCheck(deployment.ID, "http", "failed", int(responseTime), 0, err.Error())
	}
	defer resp.Body.Close()

	status := "healthy"
	if resp.StatusCode >= 400 {
		status = "unhealthy"
	}

	return hc.recordHealthCheck(deployment.ID, "http", status, int(responseTime), resp.StatusCode, "")
}

func (hc *HealthChecker) performContainerCheck(ctx context.Context, deployment *models.Deployment) error {
	containerStats, err := hc.orchestrator.dockerClient.GetContainerStats(ctx, deployment.ContainerID)
	if err != nil {
		return hc.recordHealthCheck(deployment.ID, "container", "failed", 0, 0, err.Error())
	}

	status := "healthy"
	if containerStats.State != "running" {
		status = "unhealthy"
	}

	return hc.recordHealthCheck(deployment.ID, "container", status, 0, 0, "")
}

func (hc *HealthChecker) performCustomChecks(ctx context.Context, deployment *models.Deployment) error {
	// Database connection check if applicable
	if deployment.HasDatabase {
		if err := hc.checkDatabaseConnection(ctx, deployment); err != nil {
			return err
		}
	}

	// Cache check if applicable
	if deployment.HasCache {
		if err := hc.checkCacheConnection(ctx, deployment); err != nil {
			return err
		}
	}

	return nil
}

func (hc *HealthChecker) checkDatabaseConnection(ctx context.Context, deployment *models.Deployment) error {
	// Implement database-specific health check
	return nil
}

func (hc *HealthChecker) checkCacheConnection(ctx context.Context, deployment *models.Deployment) error {
	// Implement cache-specific health check
	return nil
}

func (hc *HealthChecker) recordHealthCheck(deploymentID, checkType, status string, responseTime, statusCode int, errorMsg string) error {
	query := `
		INSERT INTO health_checks (
			deployment_id, check_type, status, response_time_ms, status_code, error_message, checked_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`

	_, err := hc.orchestrator.db.Exec(
		query,
		deploymentID,
		checkType,
		status,
		responseTime,
		statusCode,
		errorMsg,
		time.Now(),
	)

	if err != nil {
		return fmt.Errorf("failed to record health check: %w", err)
	}

	// Trigger alert if status is unhealthy
	if status == "unhealthy" || status == "failed" {
		hc.orchestrator.alertManager.TriggerAlert(context.Background(), &models.Alert{
			DeploymentID: deploymentID,
			Severity:     "warning",
			Title:        fmt.Sprintf("Health check failed: %s", checkType),
			Description:  errorMsg,
			MetricType:   "health_check",
		})
	}

	return nil
}

func (hc *HealthChecker) getActiveDeployments(ctx context.Context) ([]*models.Deployment, error) {
	query := `
		SELECT 
			d.id, 
			dc.container_id, 
			d.health_check_path,
			CASE 
				WHEN d.database_connections IS NOT NULL 
					AND jsonb_array_length(d.database_connections) > 0 
				THEN true 
				ELSE false 
			END as has_database,
			COALESCE(
				(SELECT EXISTS (
					SELECT 1 FROM deployment_resources dr 
					WHERE dr.deployment_id = d.id AND dr.resource_type = 'redis'
				)),
				false
			) as has_cache
		FROM deployments d
		JOIN deployment_containers dc ON dc.deployment_id = d.id AND dc.is_active = true
		WHERE d.status IN ('active', 'running', 'starting', 'healthy')
	`

	rows, err := hc.orchestrator.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deployments []*models.Deployment
	for rows.Next() {
		var d models.Deployment
		if err := rows.Scan(&d.ID, &d.ContainerID, &d.HealthCheckEndpoint, &d.HasDatabase, &d.HasCache); err != nil {
			return nil, err
		}
		deployments = append(deployments, &d)
	}

	return deployments, nil
}
