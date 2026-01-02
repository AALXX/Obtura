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
	CPUCores    int // Number of CPU cores
	MemoryGB    int // Memory in GB
	DiskSpaceGB int // Disk space in GB
	NetworkMbps int // Network bandwidth in Mbps

	// Additional limits
	MaxServices       int   // Max services in monorepo
	MaxImageSizeGB    int   // Max final image size
	MaxBuildLogs      int64 // Max build log size in bytes
	MaxArtifactSizeGB int   // Max artifact storage size
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
			bq.max_concurrent_builds,
			bq.max_build_duration_minutes,
			bq.max_build_size_mb,
			bq.max_builds_per_hour,
			bq.max_builds_per_day,
			bq.max_builds_per_month,
			bq.cpu_cores,
			bq.memory_gb,
			bq.disk_space_gb,
			bq.network_mbps,
			bq.max_services,
			bq.max_image_size_gb,
			bq.max_build_logs_mb,
			bq.max_artifact_size_gb
		FROM companies c
		JOIN subscriptions s ON s.company_id = c.id
		JOIN subscription_plans sp ON sp.id = s.plan_id
		JOIN build_quotas bq ON bq.plan_name = sp.id
		WHERE c.id = $1 AND s.status = 'active'
		LIMIT 1
	`

	var quota BuildQuota
	var durationMinutes, buildSizeMB, buildLogsMB int

	err := qs.db.QueryRowContext(ctx, query, companyID).Scan(
		&quota.MaxConcurrentBuilds,
		&durationMinutes,
		&buildSizeMB,
		&quota.MaxBuildsPerHour,
		&quota.MaxBuildsPerDay,
		&quota.MaxBuildsPerMonth,
		&quota.CPUCores,
		&quota.MemoryGB,
		&quota.DiskSpaceGB,
		&quota.NetworkMbps,
		&quota.MaxServices,
		&quota.MaxImageSizeGB,
		&buildLogsMB,
		&quota.MaxArtifactSizeGB,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			// Return free tier quota as fallback
			return qs.GetFreeQuota(), nil
		}
		return BuildQuota{}, fmt.Errorf("failed to get quota for company: %w", err)
	}

	quota.MaxBuildDuration = time.Duration(durationMinutes) * time.Minute
	quota.MaxBuildSize = int64(buildSizeMB) * 1024 * 1024
	quota.MaxBuildLogs = int64(buildLogsMB) * 1024 * 1024

	return quota, nil
}

func (qs *QuotaService) GetQuotaForProject(ctx context.Context, projectID string) (BuildQuota, error) {
	query := `
		SELECT 
			bq.max_concurrent_builds,
			bq.max_build_duration_minutes,
			bq.max_build_size_mb,
			bq.max_builds_per_hour,
			bq.max_builds_per_day,
			bq.max_builds_per_month,
			bq.cpu_cores,
			bq.memory_gb,
			bq.disk_space_gb,
			bq.network_mbps,
			bq.max_services,
			bq.max_image_size_gb,
			bq.max_build_logs_mb,
			bq.max_artifact_size_gb
		FROM projects p
		JOIN companies c ON c.id = p.company_id
		JOIN subscriptions s ON s.company_id = c.id
		JOIN subscription_plans sp ON sp.id = s.plan_id
		JOIN build_quotas bq ON bq.plan_name = sp.id
		WHERE p.id = $1 AND s.status = 'active'
		LIMIT 1
	`

	var quota BuildQuota
	var durationMinutes, buildSizeMB, buildLogsMB int

	err := qs.db.QueryRowContext(ctx, query, projectID).Scan(
		&quota.MaxConcurrentBuilds,
		&durationMinutes,
		&buildSizeMB,
		&quota.MaxBuildsPerHour,
		&quota.MaxBuildsPerDay,
		&quota.MaxBuildsPerMonth,
		&quota.CPUCores,
		&quota.MemoryGB,
		&quota.DiskSpaceGB,
		&quota.NetworkMbps,
		&quota.MaxServices,
		&quota.MaxImageSizeGB,
		&buildLogsMB,
		&quota.MaxArtifactSizeGB,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return qs.GetFreeQuota(), nil
		}
		return BuildQuota{}, fmt.Errorf("failed to get quota for project: %w", err)
	}

	quota.MaxBuildDuration = time.Duration(durationMinutes) * time.Minute
	quota.MaxBuildSize = int64(buildSizeMB) * 1024 * 1024
	quota.MaxBuildLogs = int64(buildLogsMB) * 1024 * 1024

	return quota, nil
}

func (qs *QuotaService) GetFreeQuota() BuildQuota {
	return BuildQuota{
		MaxConcurrentBuilds: 1,
		MaxBuildDuration:    10 * time.Minute,
		MaxBuildSize:        250 * 1024 * 1024, // 250MB
		MaxBuildsPerHour:    3,
		MaxBuildsPerDay:     10,
		MaxBuildsPerMonth:   50,
		CPUCores:            1,
		MemoryGB:            1,
		DiskSpaceGB:         2,
		NetworkMbps:         10,
		MaxServices:         2,
		MaxImageSizeGB:      1,
		MaxBuildLogs:        10 * 1024 * 1024, // 10MB
		MaxArtifactSizeGB:   1,
	}
}

func (qs *QuotaService) GetQuotaByPlanName(ctx context.Context, planName string) (BuildQuota, error) {
	query := `
		SELECT 
			max_concurrent_builds,
			max_build_duration_minutes,
			max_build_size_mb,
			max_builds_per_hour,
			max_builds_per_day,
			max_builds_per_month,
			cpu_cores,
			memory_gb,
			disk_space_gb,
			network_mbps,
			max_services,
			max_image_size_gb,
			max_build_logs_mb,
			max_artifact_size_gb
		FROM build_quotas
		WHERE plan_name = $1
	`

	var quota BuildQuota
	var durationMinutes, buildSizeMB, buildLogsMB int

	err := qs.db.QueryRowContext(ctx, query, planName).Scan(
		&quota.MaxConcurrentBuilds,
		&durationMinutes,
		&buildSizeMB,
		&quota.MaxBuildsPerHour,
		&quota.MaxBuildsPerDay,
		&quota.MaxBuildsPerMonth,
		&quota.CPUCores,
		&quota.MemoryGB,
		&quota.DiskSpaceGB,
		&quota.NetworkMbps,
		&quota.MaxServices,
		&quota.MaxImageSizeGB,
		&buildLogsMB,
		&quota.MaxArtifactSizeGB,
	)

	if err != nil {
		return BuildQuota{}, fmt.Errorf("failed to get quota for plan %s: %w", planName, err)
	}

	// Convert to proper units
	quota.MaxBuildDuration = time.Duration(durationMinutes) * time.Minute
	quota.MaxBuildSize = int64(buildSizeMB) * 1024 * 1024
	quota.MaxBuildLogs = int64(buildLogsMB) * 1024 * 1024

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

func (qs *QuotaService) UpdateQuota(ctx context.Context, planName string, quota BuildQuota) error {
	query := `
		UPDATE build_quotas SET
			max_concurrent_builds = $2,
			max_build_duration_minutes = $3,
			max_build_size_mb = $4,
			max_builds_per_hour = $5,
			max_builds_per_day = $6,
			max_builds_per_month = $7,
			cpu_cores = $8,
			memory_gb = $9,
			disk_space_gb = $10,
			network_mbps = $11,
			max_services = $12,
			max_image_size_gb = $13,
			max_build_logs_mb = $14,
			max_artifact_size_gb = $15,
			updated_at = NOW()
		WHERE plan_name = $1
	`

	durationMinutes := int(quota.MaxBuildDuration.Minutes())
	buildSizeMB := int(quota.MaxBuildSize / (1024 * 1024))
	buildLogsMB := int(quota.MaxBuildLogs / (1024 * 1024))

	_, err := qs.db.ExecContext(ctx, query,
		planName,
		quota.MaxConcurrentBuilds,
		durationMinutes,
		buildSizeMB,
		quota.MaxBuildsPerHour,
		quota.MaxBuildsPerDay,
		quota.MaxBuildsPerMonth,
		quota.CPUCores,
		quota.MemoryGB,
		quota.DiskSpaceGB,
		quota.NetworkMbps,
		quota.MaxServices,
		quota.MaxImageSizeGB,
		buildLogsMB,
		quota.MaxArtifactSizeGB,
	)

	if err != nil {
		return fmt.Errorf("failed to update quota for plan %s: %w", planName, err)
	}

	return nil
}
