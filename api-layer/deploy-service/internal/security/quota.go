package security

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type BuildQuota struct {
	// Per-project limits
	MaxConcurrentBuilds int           // Max concurrent builds per project
	MaxBuildDuration    time.Duration // Max duration for a single build
	MaxBuildSize        int64         // Max build context size in bytes

	// Per-user limits (from subscription tier)
	MaxBuildsPerHour  int
	MaxBuildsPerDay   int
	MaxBuildsPerMonth int

	// Resource limits per build
	CPUCores    float64 // Number of CPU cores
	MemoryGB    int     // Memory in GB
	DiskSpaceGB int     // Disk space in GB

	// Additional limits
	MaxServices          int   // Max services in monorepo
	MaxBuildLogs         int64 // Max build log size in bytes
	MaxBuildArtifactsGB  int   // Max artifact storage size
	MaxLogsRetentionDays int   // Log retention
}

type DeploymentQuota struct {
	// Per-project limits
	MaxConcurrentDeployments int           // Max concurrent deployments per project
	MaxDeploymentDuration    time.Duration // Max duration for a single deployment

	// Per-subscription limits (from subscription tier)
	MaxDeploymentsPerMonth int

	// Resource limits per deployment
	CPUCoresPerDeployment float64 // CPU cores per deployment
	MemoryGBPerDeployment int     // Memory in GB per deployment
	DiskSpaceGB           int     // Total disk space in GB

	// Environment limits
	MaxEnvironmentsPerProject int // Max environments (dev, staging, prod, preview)
	MaxPreviewEnvironments    int // Max preview environments
	RollbackRetentionCount    int // How many rollbacks to keep

	// Additional limits
	MaxServicesPerDeployment int // Max services that can be deployed together
}

type QuotaService struct {
	db *sql.DB
}

func NewQuotaService(db *sql.DB) *QuotaService {
	return &QuotaService{db: db}
}

func (qs *QuotaService) GetQuotaForCompany(ctx context.Context, companyID string) (BuildQuota, error) {
	query := `
		SELECT 
			sp.max_concurrent_builds,
			sp.max_build_duration_minutes,
			sp.max_build_size_mb,
			sp.max_builds_per_hour,
			sp.max_builds_per_day,
			sp.max_builds_per_month,
			sp.cpu_cores_per_build,
			sp.memory_gb_per_build,
			sp.storage_gb,
			sp.max_build_artifacts_gb,
			sp.max_logs_retention_days
		FROM companies c
		JOIN subscriptions s ON s.company_id = c.id
		JOIN subscription_plans sp ON sp.id = s.plan_id
		WHERE c.id = $1 AND s.status = 'active'
		LIMIT 1
	`

	var quota BuildQuota
	var durationMinutes, buildSizeMB sql.NullInt32
	var cpuCores sql.NullFloat64

	err := qs.db.QueryRowContext(ctx, query, companyID).Scan(
		&quota.MaxConcurrentBuilds,
		&durationMinutes,
		&buildSizeMB,
		&quota.MaxBuildsPerHour,
		&quota.MaxBuildsPerDay,
		&quota.MaxBuildsPerMonth,
		&cpuCores,
		&quota.MemoryGB,
		&quota.DiskSpaceGB,
		&quota.MaxBuildArtifactsGB,
		&quota.MaxLogsRetentionDays,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			// Return free tier quota as fallback
			return qs.GetFreeQuota(), nil
		}
		return BuildQuota{}, fmt.Errorf("failed to get quota for company: %w", err)
	}

	// Convert nullable values
	if durationMinutes.Valid {
		quota.MaxBuildDuration = time.Duration(durationMinutes.Int32) * time.Minute
	}
	if buildSizeMB.Valid {
		quota.MaxBuildSize = int64(buildSizeMB.Int32) * 1024 * 1024
	}
	if cpuCores.Valid {
		quota.CPUCores = cpuCores.Float64
	}

	// Set reasonable defaults for fields not in subscription_plans
	quota.MaxBuildLogs = 50 * 1024 * 1024 // 50MB default
	quota.MaxServices = 10                 // Default max services

	return quota, nil
}

func (qs *QuotaService) GetQuotaForProject(ctx context.Context, projectID string) (BuildQuota, error) {
	query := `
		SELECT 
			sp.max_concurrent_builds,
			sp.max_build_duration_minutes,
			sp.max_build_size_mb,
			sp.max_builds_per_hour,
			sp.max_builds_per_day,
			sp.max_builds_per_month,
			sp.cpu_cores_per_build,
			sp.memory_gb_per_build,
			sp.storage_gb,
			sp.max_build_artifacts_gb,
			sp.max_logs_retention_days
		FROM projects p
		JOIN companies c ON c.id = p.company_id
		JOIN subscriptions s ON s.company_id = c.id
		JOIN subscription_plans sp ON sp.id = s.plan_id
		WHERE p.id = $1 AND s.status = 'active'
		LIMIT 1
	`

	var quota BuildQuota
	var durationMinutes, buildSizeMB sql.NullInt32
	var cpuCores sql.NullFloat64

	err := qs.db.QueryRowContext(ctx, query, projectID).Scan(
		&quota.MaxConcurrentBuilds,
		&durationMinutes,
		&buildSizeMB,
		&quota.MaxBuildsPerHour,
		&quota.MaxBuildsPerDay,
		&quota.MaxBuildsPerMonth,
		&cpuCores,
		&quota.MemoryGB,
		&quota.DiskSpaceGB,
		&quota.MaxBuildArtifactsGB,
		&quota.MaxLogsRetentionDays,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return qs.GetFreeQuota(), nil
		}
		return BuildQuota{}, fmt.Errorf("failed to get quota for project: %w", err)
	}

	// Convert nullable values
	if durationMinutes.Valid {
		quota.MaxBuildDuration = time.Duration(durationMinutes.Int32) * time.Minute
	}
	if buildSizeMB.Valid {
		quota.MaxBuildSize = int64(buildSizeMB.Int32) * 1024 * 1024
	}
	if cpuCores.Valid {
		quota.CPUCores = cpuCores.Float64
	}

	// Set reasonable defaults
	quota.MaxBuildLogs = 50 * 1024 * 1024
	quota.MaxServices = 10

	return quota, nil
}

func (qs *QuotaService) GetFreeQuota() BuildQuota {
	return BuildQuota{
		MaxConcurrentBuilds:  1,
		MaxBuildDuration:     10 * time.Minute,
		MaxBuildSize:         250 * 1024 * 1024, // 250MB
		MaxBuildsPerHour:     3,
		MaxBuildsPerDay:      10,
		MaxBuildsPerMonth:    50,
		CPUCores:             1.0,
		MemoryGB:             1,
		DiskSpaceGB:          2,
		MaxServices:          2,
		MaxBuildLogs:         10 * 1024 * 1024, // 10MB
		MaxBuildArtifactsGB:  1,
		MaxLogsRetentionDays: 7,
	}
}

func (qs *QuotaService) GetQuotaByPlanID(ctx context.Context, planID string) (BuildQuota, error) {
	query := `
		SELECT 
			max_concurrent_builds,
			max_build_duration_minutes,
			max_build_size_mb,
			max_builds_per_hour,
			max_builds_per_day,
			max_builds_per_month,
			cpu_cores_per_build,
			memory_gb_per_build,
			storage_gb,
			max_build_artifacts_gb,
			max_logs_retention_days
		FROM subscription_plans
		WHERE id = $1 AND is_active = TRUE
	`

	var quota BuildQuota
	var durationMinutes, buildSizeMB sql.NullInt32
	var cpuCores sql.NullFloat64

	err := qs.db.QueryRowContext(ctx, query, planID).Scan(
		&quota.MaxConcurrentBuilds,
		&durationMinutes,
		&buildSizeMB,
		&quota.MaxBuildsPerHour,
		&quota.MaxBuildsPerDay,
		&quota.MaxBuildsPerMonth,
		&cpuCores,
		&quota.MemoryGB,
		&quota.DiskSpaceGB,
		&quota.MaxBuildArtifactsGB,
		&quota.MaxLogsRetentionDays,
	)

	if err != nil {
		return BuildQuota{}, fmt.Errorf("failed to get quota for plan %s: %w", planID, err)
	}

	// Convert nullable values
	if durationMinutes.Valid {
		quota.MaxBuildDuration = time.Duration(durationMinutes.Int32) * time.Minute
	}
	if buildSizeMB.Valid {
		quota.MaxBuildSize = int64(buildSizeMB.Int32) * 1024 * 1024
	}
	if cpuCores.Valid {
		quota.CPUCores = cpuCores.Float64
	}

	quota.MaxBuildLogs = 50 * 1024 * 1024
	quota.MaxServices = 10

	return quota, nil
}

// IsWithinQuota checks if the usage is within the specified quota limits
type Usage struct {
	CurrentBuildsPerHour    int
	CurrentBuildsPerDay     int
	CurrentBuildsPerMonth   int
	CurrentConcurrentBuilds int
	CurrentBuildSize        int64
	CurrentServices         int
}

func (q BuildQuota) IsWithinQuota(usage Usage) (bool, string) {
	if usage.CurrentBuildsPerHour >= q.MaxBuildsPerHour {
		return false, "Hourly build limit exceeded"
	}
	if usage.CurrentBuildsPerDay >= q.MaxBuildsPerDay {
		return false, "Daily build limit exceeded"
	}
	if usage.CurrentBuildsPerMonth >= q.MaxBuildsPerMonth {
		return false, "Monthly build limit exceeded"
	}
	if usage.CurrentConcurrentBuilds >= q.MaxConcurrentBuilds {
		return false, "Concurrent build limit exceeded"
	}
	if usage.CurrentBuildSize > q.MaxBuildSize {
		return false, "Build size limit exceeded"
	}
	if usage.CurrentServices > q.MaxServices {
		return false, "Service count limit exceeded"
	}
	return true, ""
}

// Deployment usage and quota checking
type DeploymentUsage struct {
	CurrentDeploymentsPerMonth   int
	CurrentConcurrentDeployments int
	CurrentEnvironmentsCount     int
	CurrentPreviewEnvironments   int
	CurrentServicesPerDeployment int
}

func (q DeploymentQuota) IsWithinDeploymentQuota(usage DeploymentUsage) (bool, string) {
	if usage.CurrentDeploymentsPerMonth >= q.MaxDeploymentsPerMonth {
		return false, "Monthly deployment limit exceeded"
	}
	if usage.CurrentConcurrentDeployments >= q.MaxConcurrentDeployments {
		return false, "Concurrent deployment limit exceeded"
	}
	if usage.CurrentEnvironmentsCount >= q.MaxEnvironmentsPerProject {
		return false, "Environment limit exceeded"
	}
	if usage.CurrentPreviewEnvironments >= q.MaxPreviewEnvironments {
		return false, "Preview environment limit exceeded"
	}
	if usage.CurrentServicesPerDeployment > q.MaxServicesPerDeployment {
		return false, "Services per deployment limit exceeded"
	}
	return true, ""
}

func (qs *QuotaService) GetDeploymentQuotaForProject(ctx context.Context, projectID string) (DeploymentQuota, error) {
	query := `
		SELECT
			sp.max_concurrent_deployments,
			sp.max_deployments_per_month,
			sp.cpu_cores_per_deployment,
			sp.memory_gb_per_deployment,
			sp.storage_gb,
			sp.max_environments_per_project,
			sp.max_preview_environments,
			sp.rollback_retention_count
		FROM projects p
		JOIN companies c ON c.id = p.company_id
		JOIN subscriptions s ON s.company_id = c.id
		JOIN subscription_plans sp ON sp.id = s.plan_id
		WHERE p.id = $1 AND s.status = 'active'
		LIMIT 1
	`

	var quota DeploymentQuota
	var maxDeploymentsPerMonth, maxPreviewEnvs sql.NullInt32
	var cpuCores sql.NullFloat64

	err := qs.db.QueryRowContext(ctx, query, projectID).Scan(
		&quota.MaxConcurrentDeployments,
		&maxDeploymentsPerMonth,
		&cpuCores,
		&quota.MemoryGBPerDeployment,
		&quota.DiskSpaceGB,
		&quota.MaxEnvironmentsPerProject,
		&maxPreviewEnvs,
		&quota.RollbackRetentionCount,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return qs.GetFreeDeploymentQuota(), nil
		}
		return DeploymentQuota{}, fmt.Errorf("failed to get deployment quota for project: %w", err)
	}

	// Handle nullable values
	if maxDeploymentsPerMonth.Valid {
		quota.MaxDeploymentsPerMonth = int(maxDeploymentsPerMonth.Int32)
	} else {
		quota.MaxDeploymentsPerMonth = 999999 // Unlimited
	}

	if maxPreviewEnvs.Valid {
		quota.MaxPreviewEnvironments = int(maxPreviewEnvs.Int32)
	} else {
		quota.MaxPreviewEnvironments = 999999 // Unlimited
	}

	if cpuCores.Valid {
		quota.CPUCoresPerDeployment = cpuCores.Float64
	}

	// Defaults
	quota.MaxDeploymentDuration = 30 * time.Minute
	quota.MaxServicesPerDeployment = 10

	return quota, nil
}

func (qs *QuotaService) GetDeploymentQuotaForCompany(ctx context.Context, companyID string) (DeploymentQuota, error) {
	query := `
		SELECT
			sp.max_concurrent_deployments,
			sp.max_deployments_per_month,
			sp.cpu_cores_per_deployment,
			sp.memory_gb_per_deployment,
			sp.storage_gb,
			sp.max_environments_per_project,
			sp.max_preview_environments,
			sp.rollback_retention_count
		FROM companies c
		JOIN subscriptions s ON s.company_id = c.id
		JOIN subscription_plans sp ON sp.id = s.plan_id
		WHERE c.id = $1 AND s.status = 'active'
		LIMIT 1
	`

	var quota DeploymentQuota
	var maxDeploymentsPerMonth, maxPreviewEnvs sql.NullInt32
	var cpuCores sql.NullFloat64

	err := qs.db.QueryRowContext(ctx, query, companyID).Scan(
		&quota.MaxConcurrentDeployments,
		&maxDeploymentsPerMonth,
		&cpuCores,
		&quota.MemoryGBPerDeployment,
		&quota.DiskSpaceGB,
		&quota.MaxEnvironmentsPerProject,
		&maxPreviewEnvs,
		&quota.RollbackRetentionCount,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return qs.GetFreeDeploymentQuota(), nil
		}
		return DeploymentQuota{}, fmt.Errorf("failed to get deployment quota for company: %w", err)
	}

	// Handle nullable values
	if maxDeploymentsPerMonth.Valid {
		quota.MaxDeploymentsPerMonth = int(maxDeploymentsPerMonth.Int32)
	} else {
		quota.MaxDeploymentsPerMonth = 999999
	}

	if maxPreviewEnvs.Valid {
		quota.MaxPreviewEnvironments = int(maxPreviewEnvs.Int32)
	} else {
		quota.MaxPreviewEnvironments = 999999
	}

	if cpuCores.Valid {
		quota.CPUCoresPerDeployment = cpuCores.Float64
	}

	quota.MaxDeploymentDuration = 30 * time.Minute
	quota.MaxServicesPerDeployment = 10

	return quota, nil
}

func (qs *QuotaService) GetFreeDeploymentQuota() DeploymentQuota {
	return DeploymentQuota{
		MaxConcurrentDeployments:  1,
		MaxDeploymentDuration:     15 * time.Minute,
		MaxDeploymentsPerMonth:    100,
		CPUCoresPerDeployment:     1.0,
		MemoryGBPerDeployment:     2,
		DiskSpaceGB:               5,
		MaxEnvironmentsPerProject: 3,
		MaxPreviewEnvironments:    2,
		RollbackRetentionCount:    5,
		MaxServicesPerDeployment:  3,
	}
}

// CheckQuotaBeforeBuild validates if a build can proceed based on current usage
func (qs *QuotaService) CheckQuotaBeforeBuild(ctx context.Context, companyID string, buildSize int64, servicesCount int) error {
	// Get current usage from subscriptions table
	var usage Usage
	query := `
		SELECT 
			current_builds_this_hour,
			current_builds_today,
			current_builds_this_month,
			current_concurrent_builds
		FROM subscriptions
		WHERE company_id = $1 AND status = 'active'
	`

	err := qs.db.QueryRowContext(ctx, query, companyID).Scan(
		&usage.CurrentBuildsPerHour,
		&usage.CurrentBuildsPerDay,
		&usage.CurrentBuildsPerMonth,
		&usage.CurrentConcurrentBuilds,
	)
	if err != nil {
		return fmt.Errorf("failed to get current usage: %w", err)
	}

	usage.CurrentBuildSize = buildSize
	usage.CurrentServices = servicesCount

	// Get quota
	quota, err := qs.GetQuotaForCompany(ctx, companyID)
	if err != nil {
		return fmt.Errorf("failed to get quota: %w", err)
	}

	// Check quota
	withinQuota, reason := quota.IsWithinQuota(usage)
	if !withinQuota {
		return fmt.Errorf("quota exceeded: %s", reason)
	}

	return nil
}

// IncrementBuildUsage updates usage counters after starting a build
func (qs *QuotaService) IncrementBuildUsage(ctx context.Context, companyID string) error {
	query := `
		UPDATE subscriptions
		SET 
			current_builds_this_hour = current_builds_this_hour + 1,
			current_builds_today = current_builds_today + 1,
			current_builds_this_month = current_builds_this_month + 1,
			current_concurrent_builds = current_concurrent_builds + 1,
			updated_at = NOW()
		WHERE company_id = $1 AND status = 'active'
	`

	_, err := qs.db.ExecContext(ctx, query, companyID)
	if err != nil {
		return fmt.Errorf("failed to increment build usage: %w", err)
	}

	return nil
}

// DecrementConcurrentBuilds decreases concurrent build count after completion
func (qs *QuotaService) DecrementConcurrentBuilds(ctx context.Context, companyID string) error {
	query := `
		UPDATE subscriptions
		SET 
			current_concurrent_builds = GREATEST(current_concurrent_builds - 1, 0),
			updated_at = NOW()
		WHERE company_id = $1 AND status = 'active'
	`

	_, err := qs.db.ExecContext(ctx, query, companyID)
	if err != nil {
		return fmt.Errorf("failed to decrement concurrent builds: %w", err)
	}

	return nil
}