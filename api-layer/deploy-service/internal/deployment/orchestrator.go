package deployment

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"deploy-service/internal/detection"
	"deploy-service/internal/security"
)

type DeploymentOrchestrator struct {
	db           *sql.DB
	quotaService *security.QuotaService
	rateLimiter  *security.RateLimiter
}

type DeploymentJob struct {
	JobID               string                 `json:"job_id"`
	ProjectID           string                 `json:"project_id"`
	BuildID             string                 `json:"build_id"`
	ImageTag            string                 `json:"image_tag"`
	DeploymentID        string                 `json:"deployment_id"`
	Environment         string                 `json:"environment"`
	Strategy            string                 `json:"strategy"`
	ReplicaCount        int                    `json:"replica_count"`
	PreviousContainerID string                 `json:"previous_container_id"`
	RequiresMigration   bool                   `json:"requires_migration"`
	Config              map[string]interface{} `json:"config"`
	CreatedAt           time.Time              `json:"created_at"`
}

type ContainerInfo struct {
	ID              string
	Name            string
	Status          string
	Image           string
	Port            int
	Health          string
	DeploymentGroup string 
	IsActive        bool
	IsPrimary       bool
	ReplicaIndex    int
}

type StrategyState struct {
	ID                      string
	DeploymentID            string
	Strategy                string
	CurrentPhase            string
	ActiveGroup             string
	StandbyGroup            string
	TotalBatches            int
	CurrentBatch            int
	BatchSize               int
	CanaryTrafficPercentage int
	CanaryDurationMinutes   int
	TotalReplicas           int
	HealthyReplicas         int
	UnhealthyReplicas       int
}

func NewDeploymentOrchestrator(db *sql.DB, quotaService *security.QuotaService, rateLimiter *security.RateLimiter) *DeploymentOrchestrator {
	return &DeploymentOrchestrator{
		db:           db,
		quotaService: quotaService,
		rateLimiter:  rateLimiter,
	}
}

func (o *DeploymentOrchestrator) Deploy(ctx context.Context, job DeploymentJob) error {
	log.Printf("🚀 Starting deployment %s for project %s using %s strategy",
		job.DeploymentID, job.ProjectID, job.Strategy)

	if job.Strategy == "" {
		job.Strategy = "blue_green"
	}

	if job.ReplicaCount == 0 {
		job.ReplicaCount = 1
	}

	if err := o.checkDeploymentQuota(ctx, job); err != nil {
		return o.handleFailure(job, "quota_check", err)
	}

	if err := o.validateDeployment(ctx, job); err != nil {
		o.rateLimiter.DecrementConcurrentDeployments(ctx, job.ProjectID)
		return o.handleFailure(job, "validation", err)
	}

	if err := o.initializeStrategyState(ctx, job); err != nil {
		o.rateLimiter.DecrementConcurrentDeployments(ctx, job.ProjectID)
		return o.handleFailure(job, "strategy_initialization", err)
	}

	dependencies, err := o.detectDependencies(ctx, job)
	if err != nil {
		o.rateLimiter.DecrementConcurrentDeployments(ctx, job.ProjectID)
		return o.handleFailure(job, "dependency_detection", err)
	}
	log.Printf("✅ Detected dependencies: services=%d, databases=%d",
		len(dependencies.Services), len(dependencies.Databases))

	// 5. Route to appropriate deployment strategy
	var deployErr error
	switch job.Strategy {
	case "blue_green":
		deployErr = o.BlueGreenDeploy(ctx, job)
	case "rolling":
		deployErr = o.RollingUpdate(ctx, job)
	case "canary":
		deployErr = o.CanaryDeploy(ctx, job, 10) // 10% canary traffic
	default:
		deployErr = fmt.Errorf("unknown deployment strategy: %s", job.Strategy)
	}

	if deployErr != nil {
		o.rateLimiter.DecrementConcurrentDeployments(ctx, job.ProjectID)
		return deployErr
	}

	o.rateLimiter.DecrementConcurrentDeployments(ctx, job.ProjectID)

	log.Printf("✅ Deployment %s completed successfully", job.DeploymentID)
	return nil
}

func (o *DeploymentOrchestrator) BlueGreenDeploy(ctx context.Context, job DeploymentJob) error {
	log.Printf("🔵🟢 Starting Blue-Green deployment for %s", job.DeploymentID)

	activeGroup, err := o.getActiveGroup(ctx, job.DeploymentID)
	if err != nil && err != sql.ErrNoRows {
		return o.handleFailure(job, "get_active_group", err)
	}

	// Determine new group
	var newGroup string
	if activeGroup == "" || activeGroup == "green" {
		newGroup = "blue"
	} else {
		newGroup = "green"
	}

	log.Printf("Active group: %s, Deploying to: %s", activeGroup, newGroup)

	o.updateStrategyPhase(ctx, job.DeploymentID, "deploying_new", map[string]interface{}{
		"active_group":  activeGroup,
		"standby_group": newGroup,
	})

	newContainers := make([]*ContainerInfo, 0, job.ReplicaCount)
	for i := 0; i < job.ReplicaCount; i++ {
		container, err := o.deployContainer(ctx, job, newGroup, i, false)
		if err != nil {
			o.cleanupContainers(ctx, newContainers)
			return o.handleFailure(job, "container_creation", err)
		}
		newContainers = append(newContainers, container)
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "health_checking", nil)

	allHealthy := o.waitForAllContainersHealthy(ctx, newContainers, 120*time.Second)
	if !allHealthy {
		o.cleanupContainers(ctx, newContainers)
		return o.handleFailure(job, "health_check", errors.New("health check timeout"))
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "switching_traffic", nil)

	if err := o.switchTrafficBlueGreen(ctx, job, activeGroup, newGroup, newContainers); err != nil {
		o.cleanupContainers(ctx, newContainers)
		return o.handleFailure(job, "traffic_switch", err)
	}

	if activeGroup != "" {
		o.updateStrategyPhase(ctx, job.DeploymentID, "draining_old", nil)
		time.Sleep(5 * time.Second) // Grace period

		oldContainers, _ := o.getContainersByGroup(ctx, job.DeploymentID, activeGroup)
		o.cleanupContainers(ctx, oldContainers)
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "completed", nil)

	log.Printf("✅ Blue-Green deployment completed for %s", job.DeploymentID)
	return nil
}

func (o *DeploymentOrchestrator) RollingUpdate(ctx context.Context, job DeploymentJob) error {
	log.Printf("🔄 Starting Rolling Update for %s with %d replicas", job.DeploymentID, job.ReplicaCount)

	currentContainers, err := o.getActiveContainers(ctx, job.DeploymentID)
	if err != nil {
		return o.handleFailure(job, "get_current_containers", err)
	}

	if len(currentContainers) == 0 {
		return o.BlueGreenDeploy(ctx, job)
	}

	batchSize := 1 // Update one at a time for safety
	totalBatches := (job.ReplicaCount + batchSize - 1) / batchSize

	o.updateStrategyPhase(ctx, job.DeploymentID, "deploying_new", map[string]interface{}{
		"total_batches": totalBatches,
		"batch_size":    batchSize,
	})

	newContainers := make([]*ContainerInfo, 0, job.ReplicaCount)

	for batch := 0; batch < totalBatches; batch++ {
		log.Printf("🔄 Processing batch %d/%d", batch+1, totalBatches)

		o.updateStrategyState(ctx, job.DeploymentID, map[string]interface{}{
			"current_batch": batch + 1,
		})

		start := batch * batchSize
		end := start + batchSize
		if end > job.ReplicaCount {
			end = job.ReplicaCount
		}

		batchContainers := make([]*ContainerInfo, 0)
		for i := start; i < end; i++ {
			container, err := o.deployContainer(ctx, job, "stable", i, true)
			if err != nil {
				o.cleanupContainers(ctx, batchContainers)
				return o.handleFailure(job, "rolling_update_batch", err)
			}
			batchContainers = append(batchContainers, container)
			newContainers = append(newContainers, container)
		}

		healthy := o.waitForAllContainersHealthy(ctx, batchContainers, 60*time.Second)
		if !healthy {
			o.cleanupContainers(ctx, newContainers)
			return o.handleFailure(job, "rolling_update_health", errors.New("batch health check failed"))
		}

		if len(currentContainers) > start {
			toRemove := currentContainers[start:end]
			if len(toRemove) > len(currentContainers) {
				toRemove = currentContainers[start:]
			}

			time.Sleep(10 * time.Second) // Drain period
			for _, old := range toRemove {
				o.deactivateContainer(ctx, old.ID)
				o.removeContainer(ctx, old.ID)
			}
		}

		log.Printf("✅ Batch %d/%d completed", batch+1, totalBatches)
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "completed", nil)
	o.updateDeploymentStatus(job.DeploymentID, DeploymentStatusActive)

	log.Printf("✅ Rolling update completed for %s", job.DeploymentID)
	return nil
}

func (o *DeploymentOrchestrator) CanaryDeploy(ctx context.Context, job DeploymentJob, canaryPercentage int) error {
	log.Printf("🐦 Starting Canary deployment for %s with %d%% traffic", job.DeploymentID, canaryPercentage)

	o.updateStrategyPhase(ctx, job.DeploymentID, "deploying_new", map[string]interface{}{
		"canary_traffic_percentage": canaryPercentage,
		"canary_duration_minutes":   5,
	})

	canaryContainer, err := o.deployContainer(ctx, job, "canary", 0, true)
	if err != nil {
		return o.handleFailure(job, "canary_deployment", err)
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "health_checking", nil)

	healthy := o.waitForContainerHealthy(ctx, canaryContainer.ID, 60*time.Second)
	if !healthy {
		o.removeContainer(ctx, canaryContainer.ID)
		return o.handleFailure(job, "canary_health", errors.New("canary health check failed"))
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "switching_traffic", nil)

	if err := o.routeTrafficToCanary(ctx, job, canaryContainer.ID, canaryPercentage); err != nil {
		o.removeContainer(ctx, canaryContainer.ID)
		return o.handleFailure(job, "canary_traffic", err)
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "monitoring", nil)

	monitoringDuration := 5 * time.Minute
	log.Printf("📊 Monitoring canary for %v", monitoringDuration)

	select {
	case <-ctx.Done():
		o.removeContainer(ctx, canaryContainer.ID)
		return o.handleFailure(job, "canary_monitoring", errors.New("canary monitoring cancelled"))
	case <-time.After(monitoringDuration):
		passed, err := o.analyzeCanaryMetrics(ctx, job.DeploymentID, canaryContainer.ID)
		if err != nil || !passed {
			log.Printf("❌ Canary failed analysis, rolling back")
			o.routeTrafficToCanary(ctx, job, canaryContainer.ID, 0)
			o.removeContainer(ctx, canaryContainer.ID)
			return o.handleFailure(job, "canary_analysis", errors.New("canary analysis failed"))
		}
	}

	log.Printf("✅ Canary successful, promoting to full deployment")
	o.updateStrategyPhase(ctx, job.DeploymentID, "completed", nil)

	o.routeTrafficToCanary(ctx, job, canaryContainer.ID, 100)

	o.updateContainerGroup(ctx, canaryContainer.ID, "stable", true)

	o.updateDeploymentStatus(job.DeploymentID, DeploymentStatusActive)
	return nil
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

func (o *DeploymentOrchestrator) updateStrategyPhase(ctx context.Context, deploymentID, phase string, metadata map[string]interface{}) error {
	// Record phase transition
	query := `
		INSERT INTO deployment_phase_transitions (deployment_id, from_phase, to_phase)
		SELECT $1, current_phase, $2
		FROM deployment_strategy_state
		WHERE deployment_id = $1
	`
	o.db.ExecContext(ctx, query, deploymentID, phase)

	// Update strategy state
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

func (o *DeploymentOrchestrator) updateStrategyState(ctx context.Context, deploymentID string, updates map[string]interface{}) error {
	// Build dynamic update query
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

func (o *DeploymentOrchestrator) deployContainer(ctx context.Context, job DeploymentJob, group string, replicaIndex int, isActive bool) (*ContainerInfo, error) {
	containerID := fmt.Sprintf("container_%s_%s_%d_%d", job.DeploymentID, group, replicaIndex, time.Now().Unix())

	container := &ContainerInfo{
		ID:              containerID,
		Name:            fmt.Sprintf("%s-%s-%d", job.ProjectID, group, replicaIndex),
		Status:          "starting",
		Image:           job.ImageTag,
		Port:            8080,
		Health:          "starting",
		DeploymentGroup: group,
		IsActive:        isActive,
		IsPrimary:       false,
		ReplicaIndex:    replicaIndex,
	}

	// Store in database
	query := `
		INSERT INTO deployment_containers 
		(id, deployment_id, container_id, container_name, image, deployment_group, 
		 is_active, is_primary, replica_index, status, health_status, port, started_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
	`

	_, err := o.db.ExecContext(ctx, query,
		job.DeploymentID, container.ID, container.Name, container.Image,
		container.DeploymentGroup, container.IsActive, container.IsPrimary,
		container.ReplicaIndex, container.Status, container.Health, container.Port)

	if err != nil {
		return nil, fmt.Errorf("failed to store container: %w", err)
	}

	// TODO: Actually start the container using Docker/K8s API
	log.Printf("✅ Created container: %s (group: %s, replica: %d)", containerID, group, replicaIndex)

	// Simulate container starting
	time.Sleep(2 * time.Second)
	o.updateContainerStatus(ctx, containerID, "running", "healthy")

	container.Status = "running"
	container.Health = "healthy"

	return container, nil
}

func (o *DeploymentOrchestrator) updateContainerStatus(ctx context.Context, containerID, status, health string) error {
	query := `
		UPDATE deployment_containers
		SET status = $2, health_status = $3, updated_at = NOW()
		WHERE container_id = $1
	`
	_, err := o.db.ExecContext(ctx, query, containerID, status, health)
	return err
}

func (o *DeploymentOrchestrator) updateContainerGroup(ctx context.Context, containerID, group string, isPrimary bool) error {
	query := `
		UPDATE deployment_containers
		SET deployment_group = $2, is_primary = $3, updated_at = NOW()
		WHERE container_id = $1
	`
	_, err := o.db.ExecContext(ctx, query, containerID, group, isPrimary)
	return err
}

func (o *DeploymentOrchestrator) waitForContainerHealthy(ctx context.Context, containerID string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return false
		default:
			// Check container health
			var health string
			query := `SELECT health_status FROM deployment_containers WHERE container_id = $1`
			err := o.db.QueryRowContext(ctx, query, containerID).Scan(&health)

			if err == nil && health == "healthy" {
				log.Printf("✅ Container %s is healthy", containerID)
				return true
			}

			// Record health check
			o.recordHealthCheck(ctx, containerID, health == "healthy")

			time.Sleep(3 * time.Second)
		}
	}

	return false
}

func (o *DeploymentOrchestrator) waitForAllContainersHealthy(ctx context.Context, containers []*ContainerInfo, timeout time.Duration) bool {
	for _, container := range containers {
		if !o.waitForContainerHealthy(ctx, container.ID, timeout) {
			return false
		}
	}
	return true
}

func (o *DeploymentOrchestrator) recordHealthCheck(ctx context.Context, containerID string, passed bool) {
	status := "passed"
	if !passed {
		status = "failed"
	}

	query := `
		INSERT INTO container_health_checks 
		(container_id, deployment_id, check_type, status, endpoint, response_time_ms)
		SELECT 
			(SELECT id FROM deployment_containers WHERE container_id = $1),
			deployment_id,
			'http',
			$2,
			'/health',
			100
		FROM deployment_containers
		WHERE container_id = $1
	`
	o.db.ExecContext(ctx, query, containerID, status)

	// Update container health check counters
	if passed {
		o.db.ExecContext(ctx, `
			UPDATE deployment_containers 
			SET health_checks_passed = health_checks_passed + 1,
				consecutive_health_failures = 0,
				last_health_check_at = NOW()
			WHERE container_id = $1`, containerID)
	} else {
		o.db.ExecContext(ctx, `
			UPDATE deployment_containers 
			SET health_checks_failed = health_checks_failed + 1,
				consecutive_health_failures = consecutive_health_failures + 1,
				last_health_check_at = NOW()
			WHERE container_id = $1`, containerID)
	}
}

func (o *DeploymentOrchestrator) getActiveGroup(ctx context.Context, deploymentID string) (string, error) {
	var activeGroup sql.NullString
	query := `SELECT active_group FROM deployment_strategy_state WHERE deployment_id = $1`
	err := o.db.QueryRowContext(ctx, query, deploymentID).Scan(&activeGroup)

	if err == sql.ErrNoRows {
		return "", nil
	}

	return activeGroup.String, err
}

func (o *DeploymentOrchestrator) getActiveContainers(ctx context.Context, deploymentID string) ([]*ContainerInfo, error) {
	query := `
		SELECT container_id, container_name, status, image, port, health_status, 
		       deployment_group, is_active, is_primary, replica_index
		FROM deployment_containers
		WHERE deployment_id = $1 AND is_active = true AND status IN ('running', 'healthy')
		ORDER BY replica_index
	`

	rows, err := o.db.QueryContext(ctx, query, deploymentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	containers := make([]*ContainerInfo, 0)
	for rows.Next() {
		c := &ContainerInfo{}
		err := rows.Scan(&c.ID, &c.Name, &c.Status, &c.Image, &c.Port,
			&c.Health, &c.DeploymentGroup, &c.IsActive, &c.IsPrimary, &c.ReplicaIndex)
		if err != nil {
			return nil, err
		}
		containers = append(containers, c)
	}

	return containers, nil
}

func (o *DeploymentOrchestrator) getContainersByGroup(ctx context.Context, deploymentID, group string) ([]*ContainerInfo, error) {
	query := `
		SELECT container_id, container_name, status, image, port, health_status,
		       deployment_group, is_active, is_primary, replica_index
		FROM deployment_containers
		WHERE deployment_id = $1 AND deployment_group = $2
		ORDER BY replica_index
	`

	rows, err := o.db.QueryContext(ctx, query, deploymentID, group)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	containers := make([]*ContainerInfo, 0)
	for rows.Next() {
		c := &ContainerInfo{}
		err := rows.Scan(&c.ID, &c.Name, &c.Status, &c.Image, &c.Port,
			&c.Health, &c.DeploymentGroup, &c.IsActive, &c.IsPrimary, &c.ReplicaIndex)
		if err != nil {
			return nil, err
		}
		containers = append(containers, c)
	}

	return containers, nil
}

func (o *DeploymentOrchestrator) switchTrafficBlueGreen(ctx context.Context, job DeploymentJob, oldGroup, newGroup string, newContainers []*ContainerInfo) error {
	log.Printf("🔄 Switching traffic from %s to %s", oldGroup, newGroup)

	// Deactivate old traffic routing
	if oldGroup != "" {
		query := `
			UPDATE deployment_traffic_routing
			SET is_active = false, deactivated_at = NOW()
			WHERE deployment_id = $1 AND is_active = true
		`
		o.db.ExecContext(ctx, query, job.DeploymentID)

		// Deactivate old containers
		o.db.ExecContext(ctx, `
			UPDATE deployment_containers
			SET is_active = false, is_primary = false, updated_at = NOW()
			WHERE deployment_id = $1 AND deployment_group = $2
		`, job.DeploymentID, oldGroup)
	}

	// Activate new containers
	o.db.ExecContext(ctx, `
		UPDATE deployment_containers
		SET is_active = true, is_primary = true, updated_at = NOW()
		WHERE deployment_id = $1 AND deployment_group = $2
	`, job.DeploymentID, newGroup)

	// Create new traffic routing
	containerIDs := make([]string, len(newContainers))
	for i, c := range newContainers {
		containerIDs[i] = c.ID
	}
	containerIDsJSON, _ := json.Marshal(containerIDs)

	query := `
		INSERT INTO deployment_traffic_routing
		(deployment_id, routing_group, traffic_percentage, container_ids)
		VALUES ($1, $2, 100, $3)
	`
	_, err := o.db.ExecContext(ctx, query, job.DeploymentID, newGroup, string(containerIDsJSON))

	// Update strategy state
	o.updateStrategyState(ctx, job.DeploymentID, map[string]interface{}{
		"active_group":  newGroup,
		"standby_group": oldGroup,
	})

	// TODO: Update actual load balancer/ingress configuration

	log.Printf("✅ Traffic switched to %s", newGroup)
	return err
}

func (o *DeploymentOrchestrator) deactivateContainer(ctx context.Context, containerID string) {
	query := `
		UPDATE deployment_containers
		SET is_active = false, status = 'stopping', updated_at = NOW()
		WHERE container_id = $1
	`
	o.db.ExecContext(ctx, query, containerID)
}

func (o *DeploymentOrchestrator) removeContainer(ctx context.Context, containerID string) {
	log.Printf("🗑️ Removing container %s", containerID)

	// TODO: Actually stop and remove container using Docker/K8s API

	query := `
		UPDATE deployment_containers
		SET status = 'stopped', stopped_at = NOW(), updated_at = NOW()
		WHERE container_id = $1
	`
	o.db.ExecContext(ctx, query, containerID)
}

func (o *DeploymentOrchestrator) cleanupContainers(ctx context.Context, containers []*ContainerInfo) {
	for _, c := range containers {
		o.deactivateContainer(ctx, c.ID)
		o.removeContainer(ctx, c.ID)
	}
}

func (o *DeploymentOrchestrator) routeTrafficToCanary(ctx context.Context, job DeploymentJob, canaryContainerID string, percentage int) error {
	log.Printf("🐦 Routing %d%% traffic to canary %s", percentage, canaryContainerID)

	// Deactivate existing canary routing
	o.db.ExecContext(ctx, `
		UPDATE deployment_traffic_routing
		SET is_active = false, deactivated_at = NOW()
		WHERE deployment_id = $1 AND routing_group = 'canary'
	`, job.DeploymentID)

	if percentage > 0 {
		// Create new canary routing
		containerIDs, _ := json.Marshal([]string{canaryContainerID})
		query := `
			INSERT INTO deployment_traffic_routing
			(deployment_id, routing_group, traffic_percentage, container_ids)
			VALUES ($1, 'canary', $2, $3)
		`
		_, err := o.db.ExecContext(ctx, query, job.DeploymentID, percentage, string(containerIDs))
		return err
	}

	return nil
}

func (o *DeploymentOrchestrator) analyzeCanaryMetrics(ctx context.Context, deploymentID, canaryContainerID string) (bool, error) {
	log.Printf("📊 Analyzing canary metrics for %s", canaryContainerID)

	// Simulate metric collection
	canaryErrorRate := 1.5       // 1.5% error rate
	canaryAvgResponseTime := 150 // 150ms

	baselineErrorRate := 2.0       // 2% error rate
	baselineAvgResponseTime := 200 // 200ms

	// Determine if canary passed
	passed := canaryErrorRate <= 5.0 && canaryAvgResponseTime < 1000

	// Store analysis results
	query := `
		INSERT INTO canary_analysis_results
		(deployment_id, strategy_state_id, analysis_type, canary_error_rate, 
		 canary_avg_response_time_ms, baseline_error_rate, baseline_avg_response_time_ms,
		 passed, score, decision)
		VALUES (
			$1,
			(SELECT id FROM deployment_strategy_state WHERE deployment_id = $1),
			'automatic',
			$2, $3, $4, $5, $6,
			CASE WHEN $6 THEN 95.0 ELSE 45.0 END,
			CASE WHEN $6 THEN 'promote' ELSE 'rollback' END
		)
	`

	_, err := o.db.ExecContext(ctx, query, deploymentID,
		canaryErrorRate, canaryAvgResponseTime,
		baselineErrorRate, baselineAvgResponseTime, passed)

	if err != nil {
		return false, err
	}

	log.Printf("📊 Canary analysis: passed=%v, error_rate=%.2f%%, response_time=%dms",
		passed, canaryErrorRate, canaryAvgResponseTime)

	return passed, nil
}

// Deployment status constants - must match DB CHECK constraint
const (
	DeploymentStatusPending    = "pending"
	DeploymentStatusDeploying  = "deploying"
	DeploymentStatusActive     = "active"
	DeploymentStatusFailed     = "failed"
	DeploymentStatusRolledBack = "rolled_back"
	DeploymentStatusTerminated = "terminated"
)

func (o *DeploymentOrchestrator) updateDeploymentStatus(deploymentID, status string) error {
	// Validate status against allowed values
	validStatuses := map[string]bool{
		DeploymentStatusPending:    true,
		DeploymentStatusDeploying:  true,
		DeploymentStatusActive:     true,
		DeploymentStatusFailed:     true,
		DeploymentStatusRolledBack: true,
		DeploymentStatusTerminated: true,
	}

	if !validStatuses[status] {
		return fmt.Errorf("invalid deployment status: %s (must be one of: pending, deploying, active, failed, rolled_back, terminated)", status)
	}

	query := `
		UPDATE deployments
		SET status = $2, updated_at = NOW()
		WHERE id = $1
	`
	result, err := o.db.Exec(query, deploymentID, status)
	if err != nil {
		return fmt.Errorf("failed to update deployment status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no deployment found with id: %s", deploymentID)
	}

	return nil
}


func (o *DeploymentOrchestrator) checkDeploymentQuota(ctx context.Context, job DeploymentJob) error {
	quota, err := o.quotaService.GetDeploymentQuotaForProject(ctx, job.ProjectID)
	if err != nil {
		return fmt.Errorf("failed to get deployment quota: %w", err)
	}

	deploymentLimits := security.DeploymentLimits{
		MaxConcurrent: quota.MaxConcurrentDeployments,
		MaxPerMonth:   quota.MaxDeploymentsPerMonth,
	}

	if err := o.rateLimiter.CheckAndIncrementDeploymentLimit(ctx, job.ProjectID, deploymentLimits); err != nil {
		return fmt.Errorf("deployment rate limit exceeded: %w", err)
	}

	environmentCount, err := o.getCurrentEnvironmentCount(ctx, job.ProjectID)
	if err != nil {
		return fmt.Errorf("failed to check environment count: %w", err)
	}

	previewCount, err := o.getCurrentPreviewEnvironmentCount(ctx, job.ProjectID)
	if err != nil {
		return fmt.Errorf("failed to check preview environment count: %w", err)
	}

	usage := security.DeploymentUsage{
		CurrentEnvironmentsCount:     environmentCount,
		CurrentPreviewEnvironments:   previewCount,
		CurrentServicesPerDeployment: 1,
	}

	if ok, reason := quota.IsWithinDeploymentQuota(usage); !ok {
		return fmt.Errorf("deployment quota exceeded: %s", reason)
	}

	log.Printf("✅ Deployment quota check passed for %s", job.DeploymentID)
	return nil
}

func (o *DeploymentOrchestrator) validateDeployment(ctx context.Context, job DeploymentJob) error {
	if job.ProjectID == "" {
		return errors.New("project ID is required")
	}
	if job.ImageTag == "" {
		return errors.New("image tag is required")
	}
	if job.DeploymentID == "" {
		return errors.New("deployment ID is required")
	}

	log.Printf("✅ Deployment validation passed for %s", job.DeploymentID)
	return nil
}

func (o *DeploymentOrchestrator) detectDependencies(ctx context.Context, job DeploymentJob) (*detection.ServiceDependencies, error) {
	var metadataJSON string
	query := `SELECT metadata FROM builds WHERE id = $1`
	err := o.db.QueryRowContext(ctx, query, job.BuildID).Scan(&metadataJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch build metadata: %w", err)
	}

	var metadata map[string]interface{}
	if err := json.Unmarshal([]byte(metadataJSON), &metadata); err != nil {
		return nil, fmt.Errorf("failed to parse build metadata: %w", err)
	}

	archData, ok := metadata["architecture"]
	if !ok {
		return nil, fmt.Errorf("architecture not found in build metadata")
	}

	archJSON, err := json.Marshal(archData)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal architecture data: %w", err)
	}

	var dependencies detection.ServiceDependencies
	if err := json.Unmarshal(archJSON, &dependencies); err != nil {
		return nil, fmt.Errorf("failed to unmarshal dependencies: %w", err)
	}

	if err := o.storeDetectedDependencies(ctx, job.DeploymentID, &dependencies); err != nil {
		log.Printf("Warning: failed to store detected dependencies: %v", err)
	}

	return &dependencies, nil
}

func (o *DeploymentOrchestrator) storeDetectedDependencies(ctx context.Context, deploymentID string, deps *detection.ServiceDependencies) error {
	depsJSON, err := json.Marshal(deps)
	if err != nil {
		return fmt.Errorf("failed to marshal dependencies: %w", err)
	}

	query := `
		UPDATE deployments
		SET detected_dependencies = $1
		WHERE id = $2
	`

	_, err = o.db.ExecContext(ctx, query, string(depsJSON), deploymentID)
	return err
}

func (o *DeploymentOrchestrator) handleFailure(job DeploymentJob, phase string, err error) error {
	log.Printf("❌ Deployment %s failed in phase %s: %v", job.DeploymentID, phase, err)

	// Update strategy state
	o.db.Exec(`
		UPDATE deployment_strategy_state
		SET current_phase = 'failed',
			error_message = $2,
			failed_at = NOW()
		WHERE deployment_id = $1
	`, job.DeploymentID, err.Error())

	// Update deployment
	o.db.Exec(`
		UPDATE deployments 
		SET status = $2,
			error_message = $3,
			updated_at = NOW()
		WHERE id = $1
	`, job.DeploymentID, DeploymentStatusFailed, err.Error())

	// Log event
	o.db.Exec(`
		INSERT INTO deployment_events
		(deployment_id, event_type, event_message, severity)
		VALUES ($1, 'failed', $2, 'critical')
	`, job.DeploymentID, fmt.Sprintf("Failed in %s: %v", phase, err))

	return err
}

func (o *DeploymentOrchestrator) getCurrentEnvironmentCount(ctx context.Context, projectID string) (int, error) {
	query := `
		SELECT COUNT(DISTINCT environment)
		FROM deployments
		WHERE project_id = $1 AND status = 'active'
	`

	var count int
	err := o.db.QueryRowContext(ctx, query, projectID).Scan(&count)
	return count, err
}

func (o *DeploymentOrchestrator) getCurrentPreviewEnvironmentCount(ctx context.Context, projectID string) (int, error) {
	query := `
		SELECT COUNT(*)
		FROM deployments
		WHERE project_id = $1 AND status = 'active' AND environment = 'preview'
	`

	var count int
	err := o.db.QueryRowContext(ctx, query, projectID).Scan(&count)
	return count, err
}

// Rollback function
func (o *DeploymentOrchestrator) Rollback(ctx context.Context, deploymentID, targetDeploymentID string) error {
	log.Printf("🔙 Starting rollback for deployment %s to deployment %s", deploymentID, targetDeploymentID)

	// Get target deployment containers
	targetContainers, err := o.getActiveContainers(ctx, targetDeploymentID)
	if err != nil {
		return fmt.Errorf("failed to get target containers: %w", err)
	}

	if len(targetContainers) == 0 {
		return fmt.Errorf("no containers found in target deployment")
	}

	// Record rollback
	_, err = o.db.ExecContext(ctx, `
		INSERT INTO deployment_rollbacks
		(from_deployment_id, to_deployment_id, reason, automatic)
		VALUES ($1, $2, 'Manual rollback', false)
	`, deploymentID, targetDeploymentID)

	if err != nil {
		return fmt.Errorf("failed to record rollback: %w", err)
	}

	// Deactivate current deployment containers
	_, err = o.db.ExecContext(ctx, `
		UPDATE deployment_containers
		SET is_active = false, status = 'stopped', stopped_at = NOW()
		WHERE deployment_id = $1
	`, deploymentID)

	if err != nil {
		return fmt.Errorf("failed to deactivate current containers: %w", err)
	}

	// Reactivate target containers
	_, err = o.db.ExecContext(ctx, `
		UPDATE deployment_containers
		SET is_active = true, status = 'running'
		WHERE deployment_id = $1
	`, targetDeploymentID)

	if err != nil {
		return fmt.Errorf("failed to reactivate target containers: %w", err)
	}

	// Update deployment status
	o.db.ExecContext(ctx, `
		UPDATE deployments
		SET status = $2,
			is_rollback = true,
			rolled_back_from_deployment_id = $3,
			updated_at = NOW()
		WHERE id = $1
	`, deploymentID, DeploymentStatusRolledBack, targetDeploymentID)

	// Update target deployment to active
	o.db.ExecContext(ctx, `
		UPDATE deployments
		SET status = $2, updated_at = NOW()
		WHERE id = $1
	`, targetDeploymentID, DeploymentStatusActive)

	log.Printf("✅ Rollback completed for deployment %s", deploymentID)
	return nil
}
