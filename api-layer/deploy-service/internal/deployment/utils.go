package deployment

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
)

// EnsureNetworkExists checks if a Docker network exists and creates it if it doesn't
func (o *DeploymentOrchestrator) EnsureNetworkExists(ctx context.Context, dockerClient *client.Client, networkName string) error {
	networks, err := dockerClient.NetworkList(ctx, network.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list networks: %w", err)
	}

	for _, net := range networks {
		if net.Name == networkName {
			log.Printf("✅ Network %s already exists", networkName)
			return nil
		}
	}

	log.Printf("📡 Creating network %s", networkName)

	_, err = dockerClient.NetworkCreate(ctx, networkName, network.CreateOptions{
		Driver: "bridge",
		Options: map[string]string{
			"com.docker.network.bridge.name": networkName,
		},
		Labels: map[string]string{
			"obtura.managed": "true",
			"obtura.type":    "deployment_network",
		},
	})

	if err != nil {
		return fmt.Errorf("failed to create network: %w", err)
	}

	log.Printf("✅ Created network %s", networkName)
	return nil
}

// AssignHostPort finds and assigns an available port for a container
func (o *DeploymentOrchestrator) AssignHostPort(ctx context.Context, projectID, environment string) int {
	var maxPort sql.NullInt64
	query := `
		SELECT MAX(port) 
		FROM deployment_containers 
		WHERE status IN ('running', 'starting', 'healthy')
		AND port >= 9100 AND port <= 9900
	`
	err := o.db.QueryRowContext(ctx, query).Scan(&maxPort)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("⚠️ Error querying max port: %v, defaulting to 9100", err)
		return 9100
	}

	nextPort := 9100
	if maxPort.Valid {
		nextPort = int(maxPort.Int64) + 1
	}

	if nextPort > 9900 {
		log.Printf("❌ Port range exhausted! Consider cleaning up old deployments")
		nextPort = o.findAvailablePort(ctx)
	}

	log.Printf("📍 Assigned port %d for project %s (%s)", nextPort, projectID, environment)
	return nextPort
}

// findAvailablePort finds the first available port in the range by checking gaps
func (o *DeploymentOrchestrator) findAvailablePort(ctx context.Context) int {
	query := `
		SELECT port 
		FROM deployment_containers 
		WHERE status IN ('running', 'starting', 'healthy')
		AND port >= 9100 AND port <= 9900
		ORDER BY port
	`

	rows, err := o.db.QueryContext(ctx, query)
	if err != nil {
		return 9100
	}
	defer rows.Close()

	usedPorts := make(map[int]bool)
	for rows.Next() {
		var port int
		if err := rows.Scan(&port); err == nil {
			usedPorts[port] = true
		}
	}

	for port := 9100; port <= 9900; port++ {
		if !usedPorts[port] {
			return port
		}
	}

	return 0 // No ports available
}

// initializeStrategyState creates or updates the deployment strategy state
func (o *DeploymentOrchestrator) initializeStrategyState(ctx context.Context, job DeploymentJob) error {
	query := `
		INSERT INTO deployment_strategy_state 
		(deployment_id, strategy, current_phase, total_replicas)
		VALUES ($1, $2, 'preparing', $3)
		ON CONFLICT (deployment_id) DO UPDATE SET
			strategy = $2,
			current_phase = 'preparing',
			total_replicas = $3,
			updated_at = NOW()
	`
	_, err := o.db.ExecContext(ctx, query, job.DeploymentID, job.Strategy, job.ReplicaCount)
	return err
}

// updateStrategyPhase updates the current phase of a deployment strategy
func (o *DeploymentOrchestrator) updateStrategyPhase(ctx context.Context, deploymentID, phase string, metadata map[string]interface{}) error {
	query := `
		INSERT INTO deployment_phase_transitions (deployment_id, from_phase, to_phase)
		SELECT $1, current_phase, $2
		FROM deployment_strategy_state
		WHERE deployment_id = $1
	`
	o.db.ExecContext(ctx, query, deploymentID, phase)

	updateQuery := `
		UPDATE deployment_strategy_state
		SET current_phase = $2,
			phase_started_at = NOW(),
			phase_updated_at = NOW(),
			updated_at = NOW()
		WHERE deployment_id = $1
	`
	_, err := o.db.ExecContext(ctx, updateQuery, deploymentID, phase)

	if metadata != nil {
		o.updateStrategyState(ctx, deploymentID, metadata)
	}

	return err
}

// updateStrategyState updates specific fields in the strategy state
func (o *DeploymentOrchestrator) updateStrategyState(ctx context.Context, deploymentID string, updates map[string]interface{}) error {
	query := "UPDATE deployment_strategy_state SET updated_at = NOW()"
	args := []interface{}{deploymentID}
	argIndex := 2

	for key, value := range updates {
		query += fmt.Sprintf(", %s = $%d", key, argIndex)
		args = append(args, value)
		argIndex++
	}

	query += " WHERE deployment_id = $1"
	_, err := o.db.ExecContext(ctx, query, args...)
	return err
}

// DetectAppPort detects the application port from various sources
func (o *DeploymentOrchestrator) DetectAppPort(ctx context.Context, job DeploymentJob) int {
	// 1. Check if port is explicitly set in job config (highest priority)
	if job.Config != nil {
		if port, ok := job.Config["app_port"].(int); ok && port > 0 {
			log.Printf("📍 Using explicitly configured port: %d", port)
			return port
		}
		if port, ok := job.Config["app_port"].(float64); ok && port > 0 {
			log.Printf("📍 Using explicitly configured port: %d", int(port))
			return int(port)
		}
	}

	// 2. Try to get port from build metadata (detected during build)
	var metadataJSON sql.NullString
	query := `SELECT metadata FROM builds WHERE id = $1`
	err := o.db.QueryRowContext(ctx, query, job.BuildID).Scan(&metadataJSON)

	if err == nil && metadataJSON.Valid {
		var metadata map[string]interface{}
		if err := json.Unmarshal([]byte(metadataJSON.String), &metadata); err == nil {
			if architecture, ok := metadata["architecture"].(map[string]interface{}); ok {
				if port, ok := architecture["port"].(float64); ok && port > 0 {
					log.Printf("📍 Using port from build metadata: %d", int(port))
					return int(port)
				}
				if port, ok := architecture["port"].(int); ok && port > 0 {
					log.Printf("📍 Using port from build metadata: %d", port)
					return port
				}
			}
		}
	}

	// 3. Get framework from project and use framework defaults
	var frameworkDataJSON sql.NullString
	query = `SELECT framework_data FROM projects WHERE id = $1`
	err = o.db.QueryRowContext(ctx, query, job.ProjectID).Scan(&frameworkDataJSON)

	if err == nil && frameworkDataJSON.Valid {
		var frameworkData map[string]interface{}
		if err := json.Unmarshal([]byte(frameworkDataJSON.String), &frameworkData); err == nil {
			if framework, ok := frameworkData["framework"].(string); ok {
				port := o.getDefaultPortForFramework(framework)
				log.Printf("📍 Using default port for %s: %d", framework, port)
				return port
			}
		}
	}

	// 4. Fallback to 3000 (most common for modern web frameworks)
	log.Printf("📍 Using fallback port: 3000")
	return 3000
}

// getDefaultPortForFramework returns the default port for a given framework
func (o *DeploymentOrchestrator) getDefaultPortForFramework(framework string) int {
	frameworkPorts := map[string]int{
		// JavaScript/TypeScript frameworks
		"nextjs":    3000,
		"remix":     3000,
		"sveltekit": 3000,
		"nuxt":      3000,
		"gatsby":    8000,
		"vite":      5173,
		"astro":     4321,

		// Node.js backends
		"express": 3000,
		"fastify": 3000,
		"nestjs":  3000,
		"koa":     3000,
		"hapi":    3000,

		// Python frameworks
		"django":  8000,
		"flask":   5000,
		"fastapi": 8000,
		"tornado": 8888,

		// Ruby frameworks
		"rails":   3000,
		"sinatra": 4567,

		// PHP frameworks
		"laravel": 8000,
		"symfony": 8000,

		// Java frameworks
		"spring":     8080,
		"springboot": 8080,
		"quarkus":    8080,

		// Go frameworks
		"gin":   8080,
		"echo":  8080,
		"fiber": 3000,

		// Other
		"dotnet": 5000,
		"aspnet": 5000,
	}

	if port, exists := frameworkPorts[framework]; exists {
		return port
	}

	return 3000 // Default fallback
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func formatDuration(d time.Duration) string {
	minutes := int(d.Minutes())
	seconds := int(d.Seconds()) % 60
	if minutes > 0 {
		return fmt.Sprintf("%dm %ds", minutes, seconds)
	}
	return fmt.Sprintf("%ds", seconds)
}

func (o *DeploymentOrchestrator) handleFailure(job DeploymentJob, phase string, err error) error {
	log.Printf("❌ Deployment %s failed in phase %s: %v", job.DeploymentID, phase, err)

	o.broker.PublishLog(job.DeploymentID, "error",
		fmt.Sprintf("Deployment failed in phase %s: %v", phase, err))

	o.db.Exec(`
        UPDATE deployment_strategy_state
        SET current_phase = 'failed',
            error_message = $2,
            failed_at = NOW()
        WHERE deployment_id = $1
    `, job.DeploymentID, err.Error())

	o.db.Exec(`
        UPDATE deployments 
        SET status = $2,
            error_message = $3,
            updated_at = NOW()
        WHERE id = $1
    `, job.DeploymentID, DeploymentStatusFailed, err.Error())

	o.db.Exec(`
        INSERT INTO deployment_events
        (deployment_id, event_type, event_message, severity)
        VALUES ($1, 'failed', $2, 'critical')
    `, job.DeploymentID, fmt.Sprintf("Failed in %s: %v", phase, err))

	o.broker.PublishComplete(job.DeploymentID, "failed",
		fmt.Sprintf("Deployment failed in %s phase", phase),
		"", err.Error())

	return err
}

func (o *DeploymentOrchestrator) deactivateOldDeployments(ctx context.Context, job DeploymentJob, newDeploymentID string) error {
	log.Printf("[cleanup] deactivating old deployments for project %s environment %s", job.ProjectID, job.Environment)

	tx, err := o.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Update old deployments status to terminated and set traffic to 0
	_, err = tx.ExecContext(ctx, `
		UPDATE deployments
		SET status = $1, 
		    traffic_percentage = 0,
		    terminated_at = NOW(),
		    updated_at = NOW()
		WHERE project_id = $2 
		  AND environment = $3
		  AND id != $4
		  AND status = 'active'
	`, DeploymentStatusTerminated, job.ProjectID, job.Environment, newDeploymentID)
	if err != nil {
		return fmt.Errorf("failed to update old deployment status: %w", err)
	}

	// Deactivate all traffic routing for old deployments
	_, err = tx.ExecContext(ctx, `
		UPDATE deployment_traffic_routing
		SET is_active = false, deactivated_at = NOW()
		WHERE deployment_id IN (
			SELECT id FROM deployments 
			WHERE project_id = $1 
			  AND environment = $2
			  AND id != $3
		)
		AND is_active = true
	`, job.ProjectID, job.Environment, newDeploymentID)
	if err != nil {
		return fmt.Errorf("failed to deactivate old traffic routing: %w", err)
	}

	// Deactivate all containers from old deployments
	_, err = tx.ExecContext(ctx, `
		UPDATE deployment_containers
		SET is_active = false, 
		    is_primary = false, 
		    status = 'stopped',
		    stopped_at = NOW(),
		    updated_at = NOW()
		WHERE deployment_id IN (
			SELECT id FROM deployments 
			WHERE project_id = $1 
			  AND environment = $2
			  AND id != $3
		)
		AND is_active = true
	`, job.ProjectID, job.Environment, newDeploymentID)
	if err != nil {
		return fmt.Errorf("failed to deactivate old containers: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("[cleanup] successfully deactivated old deployments")
	return nil
}