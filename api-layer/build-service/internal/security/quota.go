package security

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type BuildQuota struct {
	// Per-company limits
	MaxConcurrentBuilds int           // Max concurrent builds per company
	MaxBuildDuration    time.Duration // Max duration for a single build
	MaxBuildSize        int64         // Max build context size in bytes

	// Per-subscription limits (from subscription tier)
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
		&quota.MaxBuildsPerMonth,
		&cpuCores,
		&quota.MemoryGB,
		&quota.DiskSpaceGB,
		&quota.MaxBuildArtifactsGB,
		&quota.MaxLogsRetentionDays,
	)

	if err != nil {
		return BuildQuota{}, fmt.Errorf("failed to get quota for company: %w", err)
	}

	// Convert nullable values
	if durationMinutes.Valid {
		quota.MaxBuildDuration = time.Duration(durationMinutes.Int32) * time.Minute
	} else {
		quota.MaxBuildDuration = 30 * time.Minute // Default
	}
	
	if buildSizeMB.Valid {
		quota.MaxBuildSize = int64(buildSizeMB.Int32) * 1024 * 1024
	} else {
		quota.MaxBuildSize = 500 * 1024 * 1024 // Default 500MB
	}
	
	if cpuCores.Valid {
		quota.CPUCores = cpuCores.Float64
	} else {
		quota.CPUCores = 2.0 // Default
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
		&quota.MaxBuildsPerMonth,
		&cpuCores,
		&quota.MemoryGB,
		&quota.DiskSpaceGB,
		&quota.MaxBuildArtifactsGB,
		&quota.MaxLogsRetentionDays,
	)

	if err != nil {
		return BuildQuota{}, fmt.Errorf("failed to get quota for project: %w", err)
	}

	// Convert nullable values
	if durationMinutes.Valid {
		quota.MaxBuildDuration = time.Duration(durationMinutes.Int32) * time.Minute
	} else {
		quota.MaxBuildDuration = 30 * time.Minute
	}
	
	if buildSizeMB.Valid {
		quota.MaxBuildSize = int64(buildSizeMB.Int32) * 1024 * 1024
	} else {
		quota.MaxBuildSize = 500 * 1024 * 1024
	}
	
	if cpuCores.Valid {
		quota.CPUCores = cpuCores.Float64
	} else {
		quota.CPUCores = 2.0
	}

	// Set reasonable defaults
	quota.MaxBuildLogs = 50 * 1024 * 1024
	quota.MaxServices = 10

	return quota, nil
}

func (qs *QuotaService) GetQuotaByPlanID(ctx context.Context, planID string) (BuildQuota, error) {
	query := `
		SELECT 
			max_concurrent_builds,
			max_build_duration_minutes,
			max_build_size_mb,
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
	} else {
		quota.MaxBuildDuration = 30 * time.Minute
	}
	
	if buildSizeMB.Valid {
		quota.MaxBuildSize = int64(buildSizeMB.Int32) * 1024 * 1024
	} else {
		quota.MaxBuildSize = 500 * 1024 * 1024
	}
	
	if cpuCores.Valid {
		quota.CPUCores = cpuCores.Float64
	} else {
		quota.CPUCores = 2.0
	}

	quota.MaxBuildLogs = 50 * 1024 * 1024
	quota.MaxServices = 10

	return quota, nil
}

// IsWithinQuota checks if the usage is within the specified quota limits
type Usage struct {
	CurrentBuildsPerMonth   int
	CurrentConcurrentBuilds int
	CurrentBuildSize        int64
	CurrentServices         int
}

func (q BuildQuota) IsWithinQuota(usage Usage) (bool, string) {
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