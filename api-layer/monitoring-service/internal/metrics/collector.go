package metrics

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"monitoring-service/pkg/db"
	"monitoring-service/pkg/docker"
	"monitoring-service/pkg/logger"
)

type Collector struct {
	dockerClient *docker.Client
	db           *sql.DB
	redis        *db.RedisClient
}

func NewCollector(dockerClient *docker.Client, db *sql.DB, redisClient *db.RedisClient) *Collector {
	return &Collector{
		dockerClient: dockerClient,
		db:           db,
		redis:        redisClient,
	}
}

// CollectAll collects metrics for all active deployments
func (c *Collector) CollectAll(ctx context.Context) error {
	deployments, err := c.getActiveDeployments(ctx)
	if err != nil {
		return fmt.Errorf("failed to get active deployments: %w", err)
	}

	for _, deployment := range deployments {
		if err := c.collectDeploymentMetrics(ctx, deployment); err != nil {
			logger.Error("Failed to collect metrics for deployment", logger.String("deployment_id", deployment.ID), logger.Err(err))
		}
	}

	return nil
}

func (c *Collector) collectDeploymentMetrics(ctx context.Context, deployment *Deployment) error {
	// Collect container metrics
	containerMetrics, err := c.dockerClient.GetContainerStats(ctx, deployment.ContainerID)
	if err != nil {
		return fmt.Errorf("failed to get container stats: %w", err)
	}

	// Calculate CPU percentage
	cpuUsage := c.calculateCPUPercentage(containerMetrics)

	// Calculate memory usage
	memoryUsage := containerMetrics.MemoryStats.Usage

	// Get network stats
	networkRx := containerMetrics.Networks["eth0"].RxBytes
	networkTx := containerMetrics.Networks["eth0"].TxBytes

	// Store metrics in database
	metric := &DeploymentMetric{
		DeploymentID: deployment.ID,
		Timestamp:    time.Now(),
		CPUUsage:     cpuUsage,
		MemoryUsage:  memoryUsage,
		NetworkRx:    networkRx,
		NetworkTx:    networkTx,
		Status:       deployment.Status,
	}

	if err := c.storeMetric(ctx, metric); err != nil {
		return fmt.Errorf("failed to store metric: %w", err)
	}

	// Store in Redis for real-time access
	if err := c.cacheMetric(ctx, metric); err != nil {
		logger.Error("Failed to cache metric", logger.Err(err))
	}

	return nil
}

func (c *Collector) storeMetric(ctx context.Context, metric *DeploymentMetric) error {
	query := `
		INSERT INTO deployments_metrics (
			deployment_id, timestamp, cpu_usage, memory_usage,
			network_rx, network_tx, status
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`

	_, err := c.db.ExecContext(
		ctx,
		query,
		metric.DeploymentID,
		metric.Timestamp,
		metric.CPUUsage,
		metric.MemoryUsage,
		metric.NetworkRx,
		metric.NetworkTx,
		metric.Status,
	)

	return err
}

func (c *Collector) cacheMetric(ctx context.Context, metric *DeploymentMetric) error {
	key := fmt.Sprintf("metrics:%s:latest", metric.DeploymentID)

	// Store as hash
	return c.redis.HSet(ctx, key,
		"cpu_usage", metric.CPUUsage,
		"memory_usage", metric.MemoryUsage,
		"network_rx", metric.NetworkRx,
		"network_tx", metric.NetworkTx,
		"timestamp", metric.Timestamp.Unix(),
	).Err()
}

func (c *Collector) calculateCPUPercentage(stats *docker.ContainerStats) float64 {
	cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage - stats.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(stats.CPUStats.SystemUsage - stats.PreCPUStats.SystemUsage)

	if systemDelta > 0 && cpuDelta > 0 {
		return (cpuDelta / systemDelta) * float64(len(stats.CPUStats.CPUUsage.PercpuUsage)) * 100.0
	}

	return 0.0
}

func (c *Collector) getActiveDeployments(ctx context.Context) ([]*Deployment, error) {
	query := `
		SELECT 
			d.id, 
			dc.container_id,
			dc.status
		FROM deployments d
		JOIN deployment_containers dc ON dc.deployment_id = d.id AND dc.is_active = true
		WHERE d.status IN ('active', 'running', 'starting', 'healthy', 'deploying')
	`

	rows, err := c.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deployments []*Deployment
	for rows.Next() {
		var d Deployment
		if err := rows.Scan(&d.ID, &d.ContainerID, &d.Status); err != nil {
			return nil, err
		}
		deployments = append(deployments, &d)
	}

	return deployments, nil
}

type Deployment struct {
	ID          string
	ContainerID string
	Status      string
}

type DeploymentMetric struct {
	DeploymentID string
	Timestamp    time.Time
	CPUUsage     float64
	MemoryUsage  int64
	NetworkRx    int64
	NetworkTx    int64
	Status       string
}
