package monitoring

import (
	"context"
	"fmt"
	"time"
)

type UptimeTracker struct {
	orchestrator *Orchestrator
}

type UptimeRecord struct {
	DeploymentID string
	Timestamp    time.Time
	IsUp         bool
	ResponseTime int
	Uptime       float64 // percentage
}

func NewUptimeTracker(o *Orchestrator) *UptimeTracker {
	return &UptimeTracker{
		orchestrator: o,
	}
}

// Track records uptime for all deployments
func (ut *UptimeTracker) Track(ctx context.Context) error {
	deployments, err := ut.getActiveDeployments(ctx)
	if err != nil {
		return fmt.Errorf("failed to get active deployments: %w", err)
	}

	for _, deployment := range deployments {
		if err := ut.trackDeployment(ctx, deployment); err != nil {
			// Log error but continue with other deployments
			fmt.Printf("Failed to track uptime for deployment %s: %v\n", deployment.ID, err)
		}
	}

	return nil
}

func (ut *UptimeTracker) trackDeployment(ctx context.Context, deployment *Deployment) error {
	// Check if deployment is up
	isUp := ut.checkDeploymentStatus(ctx, deployment)

	// Calculate uptime percentage
	uptime := ut.calculateUptime(ctx, deployment.ID, isUp)

	// Store uptime record
	record := &UptimeRecord{
		DeploymentID: deployment.ID,
		Timestamp:    time.Now(),
		IsUp:         isUp,
		Uptime:       uptime,
	}

	return ut.storeUptimeRecord(ctx, record)
}

func (ut *UptimeTracker) checkDeploymentStatus(ctx context.Context, deployment *Deployment) bool {
	// Check container status
	stats, err := ut.orchestrator.dockerClient.GetContainerStats(ctx, deployment.ContainerID)
	if err != nil {
		return false
	}

	return stats.State == "running"
}

func (ut *UptimeTracker) calculateUptime(ctx context.Context, deploymentID string, currentStatus bool) float64 {
	// Get uptime records for last 24 hours
	query := `
		SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_up = true) as up_count
		FROM uptime_records
		WHERE deployment_id = $1 AND timestamp > NOW() - INTERVAL '24 hours'
	`

	var total, upCount int
	err := ut.orchestrator.db.QueryRowContext(ctx, query, deploymentID).Scan(&total, &upCount)
	if err != nil || total == 0 {
		if currentStatus {
			return 100.0
		}
		return 0.0
	}

	return (float64(upCount) / float64(total)) * 100.0
}

func (ut *UptimeTracker) storeUptimeRecord(ctx context.Context, record *UptimeRecord) error {
	query := `
		INSERT INTO uptime_records (
			deployment_id, timestamp, is_up, uptime_percentage
		) VALUES ($1, $2, $3, $4)
	`

	_, err := ut.orchestrator.db.ExecContext(
		ctx,
		query,
		record.DeploymentID,
		record.Timestamp,
		record.IsUp,
		record.Uptime,
	)

	// Store in Redis for quick access
	if err == nil {
		key := fmt.Sprintf("uptime:%s", record.DeploymentID)
		ut.orchestrator.redis.Set(ctx, key, record.Uptime, 5*time.Minute)
	}

	return err
}

// GetUptime retrieves current uptime for a deployment
func (ut *UptimeTracker) GetUptime(ctx context.Context, deploymentID string) (float64, error) {
	// Try Redis first
	key := fmt.Sprintf("uptime:%s", deploymentID)
	val, err := ut.orchestrator.redis.Get(ctx, key).Float64()
	if err == nil {
		return val, nil
	}

	// Fallback to database
	query := `
		SELECT uptime_percentage
		FROM uptime_records
		WHERE deployment_id = $1
		ORDER BY timestamp DESC
		LIMIT 1
	`

	var uptime float64
	err = ut.orchestrator.db.QueryRowContext(ctx, query, deploymentID).Scan(&uptime)
	return uptime, err
}

func (ut *UptimeTracker) getActiveDeployments(ctx context.Context) ([]*Deployment, error) {
	query := `
		SELECT d.id, dc.container_id 
		FROM deployments d
		JOIN deployment_containers dc ON dc.deployment_id = d.id AND dc.is_active = true
		WHERE d.status NOT IN ('deleted', 'terminated', 'rolled_back')
	`
	rows, err := ut.orchestrator.db.QueryContext(ctx, query)
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
