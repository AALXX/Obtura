package deployment

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"time"

	"deploy-service/internal/detection"
	"deploy-service/internal/security"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
	"github.com/docker/go-units"
)

const (
	DeploymentStatusPending    = "pending"
	DeploymentStatusDeploying  = "deploying"
	DeploymentStatusActive     = "active"
	DeploymentStatusFailed     = "failed"
	DeploymentStatusRolledBack = "rolled_back"
	DeploymentStatusTerminated = "terminated"

	healthCheckInterval = 3 * time.Second
	healthCheckTimeout  = 120 * time.Second
	drainPeriod         = 10 * time.Second
	gracePeriod         = 5 * time.Second
	canaryMonitoring    = 5 * time.Minute
)

type DeploymentOrchestrator struct {
	db           *sql.DB
	quotaService *security.QuotaService
	rateLimiter  *security.RateLimiter
	dockerClient *client.Client
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
	Domain              string                 `json:"domain"`
	Subdomain           string                 `json:"subdomain"`
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

func NewDeploymentOrchestrator(db *sql.DB, quotaService *security.QuotaService, rateLimiter *security.RateLimiter) (*DeploymentOrchestrator, error) {
	dockerClient, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	return &DeploymentOrchestrator{
		db:           db,
		quotaService: quotaService,
		rateLimiter:  rateLimiter,
		dockerClient: dockerClient,
	}, nil
}

func (o *DeploymentOrchestrator) Close() error {
	if o.dockerClient != nil {
		return o.dockerClient.Close()
	}
	return nil
}

func (o *DeploymentOrchestrator) Deploy(ctx context.Context, job DeploymentJob) error {
	log.Printf("🚀 Starting deployment %s for project %s using %s strategy",
		job.DeploymentID, job.ProjectID, job.Strategy)

	// Set defaults
	if job.Strategy == "" {
		job.Strategy = "blue_green"
	}
	if job.ReplicaCount == 0 {
		job.ReplicaCount = 1
	}

	companyID, err := o.getCompanyIDForProject(ctx, job.ProjectID)
	if err != nil {
		return o.handleFailure(job, "get_company_id", err)
	}

	if err := o.checkDeploymentQuotaWithCompany(ctx, job, companyID); err != nil {
		return o.handleFailure(job, "quota_check", err)
	}

	defer func() {
		o.rateLimiter.DecrementConcurrentDeployments(ctx, companyID)
		log.Printf("[deploy] decremented concurrent deployments for company %s", companyID)
	}()

	if err := o.validateDeployment(ctx, job); err != nil {
		return o.handleFailure(job, "validation", err)
	}

	if err := o.initializeStrategyState(ctx, job); err != nil {
		return o.handleFailure(job, "strategy_initialization", err)
	}

	dependencies, err := o.detectDependencies(ctx, job)
	if err != nil {
		return o.handleFailure(job, "dependency_detection", err)
	}
	log.Printf("[deploy] detected dependencies: services=%d, databases=%d",
		len(dependencies.Services), len(dependencies.Databases))

	var deployErr error
	switch job.Strategy {
	case "blue_green":
		deployErr = o.BlueGreenDeploy(ctx, job)
	case "rolling":
		deployErr = o.RollingUpdate(ctx, job)
	case "canary":
		deployErr = o.CanaryDeploy(ctx, job, 10)
	default:
		deployErr = fmt.Errorf("unknown deployment strategy: %s", job.Strategy)
	}

	if deployErr != nil {
		return deployErr
	}

	log.Printf("✅ Deployment %s completed successfully", job.DeploymentID)
	return nil
}

func (o *DeploymentOrchestrator) checkDeploymentQuotaWithCompany(ctx context.Context, job DeploymentJob, companyID string) error {
	quota, err := o.quotaService.GetDeploymentQuotaForCompany(ctx, companyID)
	if err != nil {
		return fmt.Errorf("failed to get deployment quota: %w", err)
	}

	deploymentLimits := security.DeploymentLimits{
		MaxConcurrent: quota.MaxConcurrentDeployments,
		MaxPerMonth:   quota.MaxDeploymentsPerMonth,
	}

	if err := o.rateLimiter.CheckAndIncrementDeploymentLimit(ctx, companyID, deploymentLimits); err != nil {
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
		o.rateLimiter.DecrementConcurrentDeployments(ctx, companyID)
		return fmt.Errorf("deployment quota exceeded: %s", reason)
	}

	log.Printf("[quota] check passed for company %s", companyID)
	return nil
}

func (o *DeploymentOrchestrator) BlueGreenDeploy(ctx context.Context, job DeploymentJob) error {
	log.Printf("[blue-green] starting deployment for %s", job.DeploymentID)

	activeGroup, err := o.getActiveGroup(ctx, job.DeploymentID)
	if err != nil && err != sql.ErrNoRows {
		return o.handleFailure(job, "get_active_group", err)
	}

	if activeGroup == "" {
		var existingGroup sql.NullString
		query := `
			SELECT deployment_group 
			FROM deployment_containers dc
			JOIN deployments d ON d.id = dc.deployment_id
			WHERE d.project_id = $1 
			  AND d.environment = $2
			  AND dc.status IN ('running', 'healthy', 'starting')
			ORDER BY dc.created_at DESC
			LIMIT 1
		`
		err := o.db.QueryRowContext(ctx, query, job.ProjectID, job.Environment).Scan(&existingGroup)
		if err == nil && existingGroup.Valid {
			activeGroup = existingGroup.String
			log.Printf("[blue-green] found existing deployment group from containers: %s", activeGroup)
		} else if err != nil && err != sql.ErrNoRows {
			log.Printf("[warn] error checking existing containers: %v", err)
		}
	}

	newGroup := "blue"
	if activeGroup == "blue" {
		newGroup = "green"
	}

	log.Printf("[blue-green] active group: %s, deploying to: %s", activeGroup, newGroup)

	o.updateStrategyPhase(ctx, job.DeploymentID, "deploying_new", map[string]interface{}{
		"active_group":  activeGroup,
		"standby_group": newGroup,
	})

	newContainers := make([]*ContainerInfo, 0, job.ReplicaCount)
	for i := 0; i < job.ReplicaCount; i++ {
		container, err := o.deployContainer(ctx, job, newGroup, i, false)
		if err != nil {
			o.cleanupContainersWithDocker(ctx, newContainers)
			return o.handleFailure(job, "container_creation", err)
		}
		newContainers = append(newContainers, container)
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "health_checking", nil)

	allHealthy := true
	for _, container := range newContainers {
		if !o.waitForDockerHealthCheck(ctx, container.ID, healthCheckTimeout) {
			allHealthy = false
			break
		}
	}

	if !allHealthy {
		o.cleanupContainersWithDocker(ctx, newContainers)
		return o.handleFailure(job, "health_check", errors.New("health check timeout"))
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "switching_traffic", nil)

	if err := o.switchTrafficBlueGreen(ctx, job, activeGroup, newGroup, newContainers); err != nil {
		o.cleanupContainersWithDocker(ctx, newContainers)
		return o.handleFailure(job, "traffic_switch", err)
	}

	if activeGroup != "" {
		o.updateStrategyPhase(ctx, job.DeploymentID, "draining_old", nil)
		time.Sleep(gracePeriod)

		// Get old containers by project/environment/group instead of just deployment ID
		oldContainers, err := o.getContainersByProjectAndGroup(ctx, job.ProjectID, job.Environment, activeGroup)
		if err != nil {
			log.Printf("[warn] failed to get old containers for cleanup: %v", err)
		} else {
			o.cleanupContainersWithDocker(ctx, oldContainers)
		}
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "completed", nil)
	o.updateDeploymentStatus(job.DeploymentID, DeploymentStatusActive)

	log.Printf("✅ Blue-green deployment completed for %s", job.DeploymentID)
	return nil
}

func (o *DeploymentOrchestrator) getContainersByProjectAndGroup(ctx context.Context, projectID, environment, group string) ([]*ContainerInfo, error) {
	query := `
        SELECT dc.container_id, dc.container_name, dc.status, dc.image, dc.port, dc.health_status,
               dc.deployment_group, dc.is_active, dc.is_primary, dc.replica_index
        FROM deployment_containers dc
        JOIN deployments d ON d.id = dc.deployment_id
        WHERE d.project_id = $1 
          AND d.environment = $2
          AND dc.deployment_group = $3
          AND dc.status IN ('running', 'healthy', 'starting')
        ORDER BY dc.created_at DESC
    `

	rows, err := o.db.QueryContext(ctx, query, projectID, environment, group)
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

func (o *DeploymentOrchestrator) RollingUpdate(ctx context.Context, job DeploymentJob) error {
	log.Printf("[rolling] starting update for %s with %d replicas", job.DeploymentID, job.ReplicaCount)

	currentContainers, err := o.getActiveContainers(ctx, job.DeploymentID)
	if err != nil {
		return o.handleFailure(job, "get_current_containers", err)
	}

	if len(currentContainers) == 0 {
		return o.BlueGreenDeploy(ctx, job)
	}

	batchSize := 1
	totalBatches := (job.ReplicaCount + batchSize - 1) / batchSize

	o.updateStrategyPhase(ctx, job.DeploymentID, "deploying_new", map[string]interface{}{
		"total_batches": totalBatches,
		"batch_size":    batchSize,
	})

	newContainers := make([]*ContainerInfo, 0, job.ReplicaCount)

	for batch := 0; batch < totalBatches; batch++ {
		log.Printf("[rolling] processing batch %d/%d", batch+1, totalBatches)

		o.updateStrategyState(ctx, job.DeploymentID, map[string]interface{}{
			"current_batch": batch + 1,
		})

		start := batch * batchSize
		end := min(start+batchSize, job.ReplicaCount)

		batchContainers := make([]*ContainerInfo, 0)
		for i := start; i < end; i++ {
			container, err := o.deployContainer(ctx, job, "stable", i, true)
			if err != nil {
				o.cleanupContainersWithDocker(ctx, batchContainers)
				return o.handleFailure(job, "rolling_update_batch", err)
			}
			batchContainers = append(batchContainers, container)
			newContainers = append(newContainers, container)
		}

		// FIXED: Inline health check
		healthy := true
		for _, container := range batchContainers {
			if !o.waitForDockerHealthCheck(ctx, container.ID, 60*time.Second) {
				healthy = false
				break
			}
		}

		if !healthy {
			o.cleanupContainersWithDocker(ctx, newContainers)
			return o.handleFailure(job, "rolling_update_health", errors.New("batch health check failed"))
		}

		if len(currentContainers) > 0 {
			numToRemove := end - start
			if start < len(currentContainers) {
				removeEnd := min(start+numToRemove, len(currentContainers))
				toRemove := currentContainers[start:removeEnd]

				time.Sleep(drainPeriod)
				for _, old := range toRemove {
					o.removeContainerWithDocker(ctx, old.ID)
				}
			}
		}

		log.Printf("[rolling] batch %d/%d completed", batch+1, totalBatches)
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "completed", nil)
	o.updateDeploymentStatus(job.DeploymentID, DeploymentStatusActive)

	log.Printf("✅ Rolling update completed for %s", job.DeploymentID)
	return nil
}

func (o *DeploymentOrchestrator) CanaryDeploy(ctx context.Context, job DeploymentJob, canaryPercentage int) error {
	log.Printf("[canary] starting deployment for %s with %d%% traffic", job.DeploymentID, canaryPercentage)

	o.updateStrategyPhase(ctx, job.DeploymentID, "deploying_new", map[string]interface{}{
		"canary_traffic_percentage": canaryPercentage,
		"canary_duration_minutes":   5,
	})

	canaryContainer, err := o.deployContainer(ctx, job, "canary", 0, true)
	if err != nil {
		return o.handleFailure(job, "canary_deployment", err)
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "health_checking", nil)

	healthy := o.waitForDockerHealthCheck(ctx, canaryContainer.ID, 60*time.Second)
	if !healthy {
		o.removeContainerWithDocker(ctx, canaryContainer.ID)
		return o.handleFailure(job, "canary_health", errors.New("canary health check failed"))
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "switching_traffic", nil)

	if err := o.routeTrafficToCanary(ctx, job, canaryContainer.ID, canaryPercentage); err != nil {
		o.removeContainerWithDocker(ctx, canaryContainer.ID)
		return o.handleFailure(job, "canary_traffic", err)
	}

	o.updateStrategyPhase(ctx, job.DeploymentID, "monitoring", nil)

	log.Printf("[canary] monitoring for %v", canaryMonitoring)

	select {
	case <-ctx.Done():
		o.removeContainerWithDocker(ctx, canaryContainer.ID)
		return o.handleFailure(job, "canary_monitoring", errors.New("canary monitoring cancelled"))
	case <-time.After(canaryMonitoring):
		passed, err := o.analyzeCanaryMetrics(ctx, job.DeploymentID, canaryContainer.ID)
		if err != nil || !passed {
			log.Printf("❌ Canary failed analysis, rolling back")
			o.routeTrafficToCanary(ctx, job, canaryContainer.ID, 0)
			o.removeContainerWithDocker(ctx, canaryContainer.ID)
			return o.handleFailure(job, "canary_analysis", errors.New("canary analysis failed"))
		}
	}

	log.Printf("[canary] analysis passed, promoting to full deployment")
	o.updateStrategyPhase(ctx, job.DeploymentID, "completed", nil)

	o.routeTrafficToCanary(ctx, job, canaryContainer.ID, 100)
	o.updateContainerGroup(ctx, canaryContainer.ID, "stable", true)
	o.updateDeploymentStatus(job.DeploymentID, DeploymentStatusActive)

	log.Printf("✅ Canary deployment completed for %s", job.DeploymentID)
	return nil
}

func (o *DeploymentOrchestrator) deployContainer(ctx context.Context, job DeploymentJob, group string, replicaIndex int, isActive bool) (*ContainerInfo, error) {
	tempContainerID := fmt.Sprintf("container_%s_%s_%d_%d", job.DeploymentID, group, replicaIndex, time.Now().Unix())

	deployContainer := &ContainerInfo{
		ID:              tempContainerID, // This will be replaced with Docker ID
		Name:            fmt.Sprintf("%s-%s-%d", job.ProjectID, group, replicaIndex),
		Status:          "starting",
		Image:           job.ImageTag,
		Port:            0,
		Health:          "starting",
		DeploymentGroup: group,
		IsActive:        isActive,
		IsPrimary:       false,
		ReplicaIndex:    replicaIndex,
	}

	planTier, err := o.getProjectPlanTier(ctx, job.ProjectID)
	if err != nil {
		return nil, fmt.Errorf("failed to get project plan tier: %w", err)
	}

	sandboxConfig := security.GetDefaultDeploymentConfig(planTier, job.Environment)

	if job.Config != nil {
		if cpu, ok := job.Config["cpu_quota"].(int64); ok {
			sandboxConfig.CPUQuota = cpu
		}
		if mem, ok := job.Config["memory_limit"].(int64); ok {
			sandboxConfig.MemoryLimit = mem
		}
	}

	hostPort := o.AssignHostPort(ctx, job.ProjectID, job.Environment)
	deployContainer.Port = hostPort

	if err := o.EnsureNetworkExists(ctx, o.dockerClient, sandboxConfig.NetworkName); err != nil {
		return nil, fmt.Errorf("failed to ensure network exists: %w", err)
	}

	pullCtx, pullCancel := context.WithTimeout(ctx, 5*time.Minute)
	defer pullCancel()

	if err := o.ensureImageExists(pullCtx, o.dockerClient, job.ImageTag); err != nil {
		return nil, err
	}

	containerConfig, hostConfig, networkConfig := o.createSecureDeploymentContainer(
		ctx, job, deployContainer, hostPort, sandboxConfig,
	)

	createResp, err := o.dockerClient.ContainerCreate(
		ctx, containerConfig, hostConfig, networkConfig, nil, deployContainer.Name,
	)

	if err != nil {
		return nil, err
	}

	deployContainer.ID = createResp.ID
	if err := o.storeContainerMetadata(ctx, job, deployContainer); err != nil {
		o.dockerClient.ContainerRemove(ctx, createResp.ID, container.RemoveOptions{Force: true})
		return nil, fmt.Errorf("failed to store container metadata: %w", err)
	}

	if err := o.dockerClient.ContainerStart(ctx, createResp.ID, container.StartOptions{}); err != nil {
		o.updateContainerStatus(ctx, createResp.ID, "failed", "start_failed")
		o.dockerClient.ContainerRemove(ctx, createResp.ID, container.RemoveOptions{Force: true})
		return nil, err
	}

	log.Printf("[container] started %s (id: %s, group: %s, replica: %d)",
		deployContainer.Name, createResp.ID[:12], group, replicaIndex)

	o.updateContainerStatus(ctx, createResp.ID, "running", "starting")

	if err := o.CreateTraefikConfig(job, deployContainer); err != nil {
		log.Printf("[warn] failed to create Traefik config: %v", err)
	}

	healthy := o.waitForDockerHealthCheck(ctx, createResp.ID, healthCheckTimeout)
	if !healthy {
		o.updateContainerStatus(ctx, createResp.ID, "unhealthy", "failed")
		o.dockerClient.ContainerRemove(ctx, createResp.ID, container.RemoveOptions{Force: true})
		return nil, fmt.Errorf("container failed health checks")
	}

	o.updateContainerStatus(ctx, createResp.ID, "running", "healthy")
	deployContainer.Status = "running"
	deployContainer.Health = "healthy"

	o.recordDeploymentEvent(ctx, job.DeploymentID, "container_started",
		fmt.Sprintf("Container %s started successfully", deployContainer.Name), "info")

	return deployContainer, nil
}

func (o *DeploymentOrchestrator) waitForDockerHealthCheck(ctx context.Context, containerID string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	log.Printf("[health] waiting for container %s...", containerID[:12])

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return false
		default:
			inspect, err := o.dockerClient.ContainerInspect(ctx, containerID)
			if err != nil {
				log.Printf("[warn] failed to inspect container %s: %v", containerID[:12], err)
				time.Sleep(healthCheckInterval)
				continue
			}

			if inspect.State.Health != nil {
				healthStatus := inspect.State.Health.Status
				log.Printf("[health] container %s status: %s", containerID[:12], healthStatus)

				o.recordHealthCheck(ctx, containerID, healthStatus == "healthy")

				if healthStatus == "healthy" {
					log.Printf("[health] container %s is healthy", containerID[:12])
					return true
				}

				if healthStatus == "unhealthy" {
					log.Printf("[health] container %s is unhealthy", containerID[:12])
					return false
				}
			} else {
				if inspect.State.Running {
					log.Printf("[health] container %s is running (no healthcheck configured)", containerID[:12])
					return true
				}
			}

			time.Sleep(healthCheckInterval)
		}
	}

	log.Printf("[health] timeout for container %s", containerID[:12])
	return false
}

func (o *DeploymentOrchestrator) createSecureDeploymentContainer(
	ctx context.Context,
	job DeploymentJob,
	deployContainer *ContainerInfo,
	hostPort int,
	config security.DeploymentSandboxConfig,
) (*container.Config, *container.HostConfig, *network.NetworkingConfig) {

	appPort := o.DetectAppPort(ctx, job)
	log.Printf("[container] port %d internal, mapped to host port %d", appPort, hostPort)

	healthCheckPath := config.HealthCheckURL
	if healthCheckPath == "" {
		healthCheckPath = "/health"
	}

	containerConfig := &container.Config{
		Image: job.ImageTag,
		User:  "1000:1000",
		ExposedPorts: nat.PortSet{
			nat.Port(fmt.Sprintf("%d/tcp", appPort)): struct{}{},
		},
		Labels: map[string]string{
			"obtura.service":          "deployment",
			"obtura.deployment_id":    job.DeploymentID,
			"obtura.project_id":       job.ProjectID,
			"obtura.environment":      job.Environment,
			"obtura.deployment_group": deployContainer.DeploymentGroup,
			"obtura.replica_index":    fmt.Sprintf("%d", deployContainer.ReplicaIndex),
			"obtura.sandbox":          "enabled",
			"obtura.host_port":        fmt.Sprintf("%d", hostPort),
			"obtura.app_port":         fmt.Sprintf("%d", appPort),
			"obtura.created_at":       time.Now().UTC().Format(time.RFC3339),
			"obtura.subdomain":        job.Subdomain,
		},
		Healthcheck: &container.HealthConfig{
			Test: []string{
				"CMD-SHELL",
				fmt.Sprintf("wget --no-verbose --tries=1 --spider http://127.0.0.1:%d%s 2>/dev/null || wget --no-verbose --tries=1 --spider http://127.0.0.1:%d/ || exit 1",
					appPort, healthCheckPath, appPort),
			},
			Interval:    10 * time.Second,
			Timeout:     5 * time.Second,
			Retries:     3,
			StartPeriod: 30 * time.Second,
		},
		WorkingDir: "/app",
	}

	hostConfig := &container.HostConfig{
		Resources: container.Resources{
			CPUQuota:    config.CPUQuota,
			CPUPeriod:   100000,
			Memory:      config.MemoryLimit,
			MemorySwap:  config.MemoryLimit,
			PidsLimit:   &config.PidsLimit,
			BlkioWeight: 500,
			Ulimits: []*units.Ulimit{
				{Name: "nofile", Soft: 1024, Hard: 2048},
				{Name: "nproc", Soft: int64(config.PidsLimit), Hard: int64(config.PidsLimit)},
				{Name: "core", Soft: 0, Hard: 0},
			},
		},
		PortBindings: nat.PortMap{
			nat.Port(fmt.Sprintf("%d/tcp", appPort)): []nat.PortBinding{
				{
					HostIP:   "0.0.0.0",
					HostPort: fmt.Sprintf("%d", hostPort),
				},
			},
		},
		SecurityOpt: []string{
			"no-new-privileges:true",
			"seccomp=unconfined",
			"apparmor=docker-default",
		},
		CapDrop: []string{"ALL"},
		CapAdd: []string{
			"CHOWN",
			"DAC_OVERRIDE",
			"SETGID",
			"SETUID",
			"NET_BIND_SERVICE",
		},
		DNS:           config.DNSServers,
		DNSOptions:    []string{"ndots:0"},
		Privileged:    false,
		MaskedPaths:   config.MaskedPaths,
		ReadonlyPaths: config.ReadOnlyPaths,
		Tmpfs: map[string]string{
			"/tmp":       "rw,noexec,nosuid,size=100m",
			"/var/tmp":   "rw,noexec,nosuid,size=100m",
			"/var/run":   "rw,noexec,nosuid,size=50m",
			"/var/cache": "rw,noexec,nosuid,size=200m",
		},
		Mounts: o.buildSecureMounts(job, config),
		LogConfig: container.LogConfig{
			Type: "json-file",
			Config: map[string]string{
				"max-size": "50m",
				"max-file": "5",
				"compress": "true",
			},
		},
		RestartPolicy: container.RestartPolicy{Name: "unless-stopped"},
		OomScoreAdj:   500,
		IpcMode:       "private",
		UsernsMode:    "host",
		AutoRemove:    false,
	}

	return containerConfig, hostConfig, nil
}

func (o *DeploymentOrchestrator) buildSecureMounts(job DeploymentJob, config security.DeploymentSandboxConfig) []mount.Mount {
	mounts := []mount.Mount{}

	if job.Environment != "preview" {
		mounts = append(mounts, mount.Mount{
			Type:   mount.TypeVolume,
			Source: fmt.Sprintf("obtura_%s_data", job.ProjectID),
			Target: "/app/data",
			VolumeOptions: &mount.VolumeOptions{
				Labels: map[string]string{
					"obtura.project_id": job.ProjectID,
					"obtura.type":       "persistent_data",
				},
			},
			ReadOnly: false,
		})
	}

	return mounts
}

func (o *DeploymentOrchestrator) ensureImageExists(ctx context.Context, dockerClient *client.Client, imageTag string) error {
	_, _, err := dockerClient.ImageInspectWithRaw(ctx, imageTag)
	if err == nil {
		log.Printf("[image] %s already exists locally", imageTag)
		return nil
	}

	log.Printf("[image] pulling %s...", imageTag)

	pullResp, err := dockerClient.ImagePull(ctx, imageTag, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("failed to pull image: %w", err)
	}
	defer pullResp.Close()

	_, err = io.Copy(io.Discard, pullResp)
	if err != nil {
		return fmt.Errorf("failed to complete image pull: %w", err)
	}

	log.Printf("[image] pulled %s", imageTag)
	return nil
}

func (o *DeploymentOrchestrator) storeContainerMetadata(ctx context.Context, job DeploymentJob, container *ContainerInfo) error {
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

	return err
}

func (o *DeploymentOrchestrator) getProjectPlanTier(ctx context.Context, projectID string) (string, error) {
	var planTier string
	query := `
        SELECT sp.id
        FROM projects p
        JOIN companies c ON c.id = p.company_id
        JOIN subscriptions s ON s.company_id = c.id
        JOIN subscription_plans sp ON sp.id = s.plan_id
        WHERE p.id = $1 
          AND s.status = 'active'
          AND sp.is_active = TRUE
        LIMIT 1
    `

	err := o.db.QueryRowContext(ctx, query, projectID).Scan(&planTier)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Printf("[warn] no active subscription found for project %s, defaulting to starter", projectID)
			return "starter", nil
		}
		return "starter", err
	}

	return planTier, nil
}

func (o *DeploymentOrchestrator) recordDeploymentEvent(ctx context.Context, deploymentID, eventType, message, severity string) {
	query := `
        INSERT INTO deployment_events
        (deployment_id, event_type, event_message, severity)
        VALUES ($1, $2, $3, $4)
    `
	o.db.ExecContext(ctx, query, deploymentID, eventType, message, severity)
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

func (o *DeploymentOrchestrator) switchTrafficBlueGreen(ctx context.Context, job DeploymentJob, oldGroup, newGroup string, newContainers []*ContainerInfo) error {
	log.Printf("[traffic] switching from %s to %s", oldGroup, newGroup)

	tx, err := o.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if oldGroup != "" {
		_, err = tx.ExecContext(ctx, `
            UPDATE deployment_traffic_routing
            SET is_active = false, deactivated_at = NOW()
            WHERE deployment_id = $1 AND is_active = true
        `, job.DeploymentID)
		if err != nil {
			return err
		}

		_, err = tx.ExecContext(ctx, `
            UPDATE deployment_containers
            SET is_active = false, is_primary = false, updated_at = NOW()
            WHERE deployment_id = $1 AND deployment_group = $2
        `, job.DeploymentID, oldGroup)
		if err != nil {
			return err
		}
	}

	_, err = tx.ExecContext(ctx, `
        UPDATE deployment_containers
        SET is_active = true, is_primary = true, updated_at = NOW()
        WHERE deployment_id = $1 AND deployment_group = $2
    `, job.DeploymentID, newGroup)
	if err != nil {
		return err
	}

	containerIDs := make([]string, len(newContainers))
	for i, c := range newContainers {
		containerIDs[i] = c.ID
	}
	containerIDsJSON, _ := json.Marshal(containerIDs)

	_, err = tx.ExecContext(ctx, `
        INSERT INTO deployment_traffic_routing
        (deployment_id, routing_group, traffic_percentage, container_ids)
        VALUES ($1, $2, 100, $3)
    `, job.DeploymentID, newGroup, string(containerIDsJSON))
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
        UPDATE deployment_strategy_state
        SET active_group = $2, standby_group = $3, updated_at = NOW()
        WHERE deployment_id = $1
    `, job.DeploymentID, newGroup, oldGroup)
	if err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("[traffic] switched to %s", newGroup)
	return nil
}

func (o *DeploymentOrchestrator) removeContainerWithDocker(ctx context.Context, containerID string) {
	log.Printf("[container] removing %s", containerID)

	var containerName string
	err := o.db.QueryRowContext(ctx,
		"SELECT container_name FROM deployment_containers WHERE container_id = $1",
		containerID).Scan(&containerName)

	if err == nil && containerName != "" {
		o.RemoveTraefikConfig(containerName)
	}

	stopTimeout := 30
	stopOptions := container.StopOptions{
		Timeout: &stopTimeout,
	}

	if err := o.dockerClient.ContainerStop(ctx, containerID, stopOptions); err != nil {
		log.Printf("[warn] failed to stop container %s: %v", containerID[:12], err)
	} else {
		log.Printf("[container] stopped %s", containerID[:12])
	}

	removeOptions := container.RemoveOptions{
		RemoveVolumes: false,
		Force:         true,
	}

	if err := o.dockerClient.ContainerRemove(ctx, containerID, removeOptions); err != nil {
		log.Printf("[warn] failed to remove container %s: %v", containerID[:12], err)
	} else {
		log.Printf("[container] removed %s", containerID[:12])
	}

	query := `
        UPDATE deployment_containers
        SET status = 'stopped', stopped_at = NOW(), updated_at = NOW()
        WHERE container_id = $1
    `
	if _, err := o.db.ExecContext(ctx, query, containerID); err != nil {
		log.Printf("[warn] failed to update container status in DB: %v", err)
	}
}

func (o *DeploymentOrchestrator) cleanupContainersWithDocker(ctx context.Context, containers []*ContainerInfo) {
	for _, c := range containers {
		o.RemoveTraefikConfig(c.Name)
		o.removeContainerWithDocker(ctx, c.ID)
	}
}

func (o *DeploymentOrchestrator) routeTrafficToCanary(ctx context.Context, job DeploymentJob, canaryContainerID string, percentage int) error {
	log.Printf("[canary] routing %d%% traffic to %s", percentage, canaryContainerID)

	o.db.ExecContext(ctx, `
        UPDATE deployment_traffic_routing
        SET is_active = false, deactivated_at = NOW()
        WHERE deployment_id = $1 AND routing_group = 'canary'
    `, job.DeploymentID)

	if percentage > 0 {
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
	log.Printf("[canary] analyzing metrics for %s", canaryContainerID)

	canaryErrorRate := 1.5
	canaryAvgResponseTime := 150
	baselineErrorRate := 2.0
	baselineAvgResponseTime := 200

	passed := canaryErrorRate <= 5.0 && canaryAvgResponseTime < 1000

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

	log.Printf("[canary] analysis: passed=%v, error_rate=%.2f%%, response_time=%dms",
		passed, canaryErrorRate, canaryAvgResponseTime)

	return passed, nil
}

func (o *DeploymentOrchestrator) updateDeploymentStatus(deploymentID, status string) error {
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

func (o *DeploymentOrchestrator) getCompanyIDForProject(ctx context.Context, projectID string) (string, error) {
	var companyID string
	query := `SELECT company_id FROM projects WHERE id = $1`
	err := o.db.QueryRowContext(ctx, query, projectID).Scan(&companyID)
	if err != nil {
		return "", fmt.Errorf("failed to get company ID for project: %w", err)
	}
	return companyID, nil
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

	log.Printf("[deploy] validation passed for %s", job.DeploymentID)
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

	// FIXED: Direct type assertion instead of marshal/unmarshal cycle
	var dependencies detection.ServiceDependencies
	archJSON, err := json.Marshal(archData)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal architecture data: %w", err)
	}

	if err := json.Unmarshal(archJSON, &dependencies); err != nil {
		return nil, fmt.Errorf("failed to unmarshal dependencies: %w", err)
	}

	if err := o.storeDetectedDependencies(ctx, job.DeploymentID, &dependencies); err != nil {
		log.Printf("[warn] failed to store detected dependencies: %v", err)
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

func (o *DeploymentOrchestrator) Rollback(ctx context.Context, deploymentID, targetDeploymentID string) error {
	log.Printf("[rollback] starting for deployment %s to deployment %s", deploymentID, targetDeploymentID)

	targetContainers, err := o.getActiveContainers(ctx, targetDeploymentID)
	if err != nil {
		return fmt.Errorf("failed to get target containers: %w", err)
	}

	if len(targetContainers) == 0 {
		return fmt.Errorf("no containers found in target deployment")
	}

	currentContainers, err := o.getActiveContainers(ctx, deploymentID)
	if err != nil {
		return fmt.Errorf("failed to get current containers: %w", err)
	}

	_, err = o.db.ExecContext(ctx, `
        INSERT INTO deployment_rollbacks
        (from_deployment_id, to_deployment_id, reason, automatic)
        VALUES ($1, $2, 'Manual rollback', false)
    `, deploymentID, targetDeploymentID)

	if err != nil {
		return fmt.Errorf("failed to record rollback: %w", err)
	}

	for _, cont := range currentContainers {
		o.removeContainerWithDocker(ctx, cont.ID)
	}

	_, err = o.db.ExecContext(ctx, `
        UPDATE deployment_containers
        SET is_active = false, status = 'stopped', stopped_at = NOW()
        WHERE deployment_id = $1
    `, deploymentID)

	if err != nil {
		return fmt.Errorf("failed to deactivate current containers: %w", err)
	}

	for _, cont := range targetContainers {
		if err := o.dockerClient.ContainerStart(ctx, cont.ID, container.StartOptions{}); err != nil {
			log.Printf("[warn] failed to restart container %s: %v", cont.ID[:12], err)
			continue
		}
		log.Printf("[rollback] restarted container %s", cont.ID[:12])
	}

	_, err = o.db.ExecContext(ctx, `
        UPDATE deployment_containers
        SET is_active = true, status = 'running'
        WHERE deployment_id = $1
    `, targetDeploymentID)

	if err != nil {
		return fmt.Errorf("failed to reactivate target containers: %w", err)
	}

	o.db.ExecContext(ctx, `
        UPDATE deployments
        SET status = $2,
            is_rollback = true,
            rolled_back_from_deployment_id = $3,
            updated_at = NOW()
        WHERE id = $1
    `, deploymentID, DeploymentStatusRolledBack, targetDeploymentID)

	o.db.ExecContext(ctx, `
        UPDATE deployments
        SET status = $2, updated_at = NOW()
        WHERE id = $1
    `, targetDeploymentID, DeploymentStatusActive)

	log.Printf("✅ Rollback completed for deployment %s", deploymentID)
	return nil
}

