package clients

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// PlatformDB queries the shared Obtura PostgreSQL database directly.
// Neither build-service nor deploy-service expose REST endpoints for listing
// builds or deployments — all data lives in the shared DB.
type PlatformDB struct {
	db *sql.DB
}

func NewPlatformDB(db *sql.DB) *PlatformDB {
	return &PlatformDB{db: db}
}

// ---- Build queries ----

type BuildRow struct {
	ID          string
	ProjectID   string
	ProjectName string
	CommitHash  string
	Branch      string
	Status      string
	Framework   string
	BuildTime   int
	ErrorMsg    string
	CreatedAt   time.Time
	StartedAt   *time.Time
	CompletedAt *time.Time
}

func (p *PlatformDB) GetBuild(ctx context.Context, buildID string) (*BuildRow, error) {
	query := `
		SELECT
			b.id,
			b.project_id,
			COALESCE(pr.name, '') AS project_name,
			b.commit_hash,
			COALESCE(b.branch, '') AS branch,
			b.status,
			COALESCE(b.metadata->>'framework', '') AS framework,
			COALESCE(b.build_time_seconds, 0) AS build_time_seconds,
			COALESCE(b.error_message, '') AS error_message,
			b.created_at,
			NULL::TIMESTAMP AS started_at,
			b.completed_at
		FROM builds b
		LEFT JOIN projects pr ON pr.id = b.project_id
		WHERE b.id = $1
		LIMIT 1`

	row := p.db.QueryRowContext(ctx, query, buildID)
	return scanBuildRow(row)
}

func (p *PlatformDB) GetProjectBuilds(ctx context.Context, projectID string, limit int) ([]BuildRow, error) {
	if limit <= 0 {
		limit = 20
	}
	query := `
		SELECT
			b.id,
			b.project_id,
			COALESCE(pr.name, '') AS project_name,
			b.commit_hash,
			COALESCE(b.branch, '') AS branch,
			b.status,
			COALESCE(b.metadata->>'framework', '') AS framework,
			COALESCE(b.build_time_seconds, 0) AS build_time_seconds,
			COALESCE(b.error_message, '') AS error_message,
			b.created_at,
			NULL::TIMESTAMP AS started_at,
			b.completed_at
		FROM builds b
		LEFT JOIN projects pr ON pr.id = b.project_id
		WHERE b.project_id = $1
		ORDER BY b.created_at DESC
		LIMIT $2`

	rows, err := p.db.QueryContext(ctx, query, projectID, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query builds: %w", err)
	}
	defer rows.Close()

	var builds []BuildRow
	for rows.Next() {
		b, err := scanBuildRow(rows)
		if err != nil {
			return nil, err
		}
		builds = append(builds, *b)
	}
	return builds, rows.Err()
}

// GetBuildLogs fetches stored build logs from the build_logs table.
// Returns the last maxLines lines as a single string.
func (p *PlatformDB) GetBuildLogs(ctx context.Context, buildID string, maxLines int) (string, error) {
	if maxLines <= 0 {
		maxLines = 300
	}
	query := `
		SELECT log_type, message, created_at
		FROM build_logs
		WHERE build_id = $1
		ORDER BY created_at ASC`

	rows, err := p.db.QueryContext(ctx, query, buildID)
	if err != nil {
		return "", fmt.Errorf("failed to query build logs: %w", err)
	}
	defer rows.Close()

	var lines []string
	for rows.Next() {
		var logType, message string
		var createdAt time.Time
		if err := rows.Scan(&logType, &message, &createdAt); err != nil {
			continue
		}
		lines = append(lines, message)
	}
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("error reading build log rows: %w", err)
	}

	if len(lines) == 0 {
		return "", nil
	}

	// Return last maxLines lines
	if len(lines) > maxLines {
		lines = lines[len(lines)-maxLines:]
	}
	return strings.Join(lines, "\n"), nil
}

// scanner interface satisfied by both *sql.Row and *sql.Rows
type scanner interface {
	Scan(dest ...interface{}) error
}

func scanBuildRow(s scanner) (*BuildRow, error) {
	var b BuildRow
	var completedAt sql.NullTime
	var startedAt sql.NullTime
	err := s.Scan(
		&b.ID,
		&b.ProjectID,
		&b.ProjectName,
		&b.CommitHash,
		&b.Branch,
		&b.Status,
		&b.Framework,
		&b.BuildTime,
		&b.ErrorMsg,
		&b.CreatedAt,
		&startedAt,
		&completedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("build not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to scan build row: %w", err)
	}
	if startedAt.Valid {
		b.StartedAt = &startedAt.Time
	}
	if completedAt.Valid {
		b.CompletedAt = &completedAt.Time
	}
	return &b, nil
}

// ---- Deployment queries ----

type DeploymentRow struct {
	ID          string
	ProjectID   string
	BuildID     string
	Environment string
	Status      string
	Branch      string
	CommitHash  string
	Domain      string
	Subdomain   string
	Strategy    string
	ErrorMsg    string
	CreatedAt   time.Time
	StartedAt   *time.Time
	CompletedAt *time.Time
}

func (p *PlatformDB) GetProjectDeployments(ctx context.Context, projectID string, environment string, limit int) ([]DeploymentRow, error) {
	if limit <= 0 {
		limit = 10
	}

	var args []interface{}
	args = append(args, projectID)

	envFilter := ""
	if environment != "" && environment != "all" {
		args = append(args, environment)
		envFilter = fmt.Sprintf("AND d.environment = $%d", len(args))
	}

	args = append(args, limit)
	query := fmt.Sprintf(`
		SELECT
			d.id,
			d.project_id,
			d.build_id,
			d.environment,
			d.status,
			COALESCE(d.branch, '') AS branch,
			COALESCE(d.commit_hash, '') AS commit_hash,
			COALESCE(d.domain, '') AS domain,
			COALESCE(d.subdomain, '') AS subdomain,
			COALESCE(d.deployment_strategy, '') AS strategy,
			COALESCE(d.error_message, '') AS error_message,
			d.created_at,
			d.deployment_started_at,
			d.deployment_completed_at
		FROM deployments d
		WHERE d.project_id = $1
		%s
		ORDER BY d.created_at DESC
		LIMIT $%d`, envFilter, len(args))

	rows, err := p.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query deployments: %w", err)
	}
	defer rows.Close()

	var deployments []DeploymentRow
	for rows.Next() {
		var d DeploymentRow
		var startedAt, completedAt sql.NullTime
		err := rows.Scan(
			&d.ID, &d.ProjectID, &d.BuildID, &d.Environment,
			&d.Status, &d.Branch, &d.CommitHash, &d.Domain,
			&d.Subdomain, &d.Strategy, &d.ErrorMsg, &d.CreatedAt,
			&startedAt, &completedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan deployment row: %w", err)
		}
		if startedAt.Valid {
			d.StartedAt = &startedAt.Time
		}
		if completedAt.Valid {
			d.CompletedAt = &completedAt.Time
		}
		deployments = append(deployments, d)
	}
	return deployments, rows.Err()
}

// GetDeploymentLogs fetches stored deployment logs from the deployment_logs table.
func (p *PlatformDB) GetDeploymentLogs(ctx context.Context, deploymentID string, maxLines int) (string, error) {
	if maxLines <= 0 {
		maxLines = 300
	}
	query := `
		SELECT log_type, message, created_at
		FROM deployment_logs
		WHERE deployment_id = $1
		ORDER BY created_at ASC`

	rows, err := p.db.QueryContext(ctx, query, deploymentID)
	if err != nil {
		return "", fmt.Errorf("failed to query deployment logs: %w", err)
	}
	defer rows.Close()

	var lines []string
	for rows.Next() {
		var logType, message string
		var createdAt time.Time
		if err := rows.Scan(&logType, &message, &createdAt); err != nil {
			continue
		}
		lines = append(lines, fmt.Sprintf("[%s] %s", strings.ToUpper(logType), message))
	}
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("error reading deployment log rows: %w", err)
	}

	if len(lines) == 0 {
		return "", nil
	}

	if len(lines) > maxLines {
		lines = lines[len(lines)-maxLines:]
	}
	return strings.Join(lines, "\n"), nil
}

// GetDeploymentAlerts fetches unresolved alerts for a project from deployment_alerts.
func (p *PlatformDB) GetDeploymentAlerts(ctx context.Context, projectID string, limit int) ([]map[string]interface{}, error) {
	if limit <= 0 {
		limit = 10
	}
	query := `
		SELECT
			id,
			alert_type,
			severity,
			alert_message,
			resolved,
			created_at
		FROM deployment_alerts
		WHERE project_id = $1
		  AND resolved = false
		ORDER BY created_at DESC
		LIMIT $2`

	rows, err := p.db.QueryContext(ctx, query, projectID, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query alerts: %w", err)
	}
	defer rows.Close()

	var alerts []map[string]interface{}
	for rows.Next() {
		var id, alertType, severity, message string
		var resolved bool
		var createdAt time.Time
		if err := rows.Scan(&id, &alertType, &severity, &message, &resolved, &createdAt); err != nil {
			continue
		}
		alerts = append(alerts, map[string]interface{}{
			"id":        id,
			"type":      alertType,
			"severity":  severity,
			"message":   message,
			"resolved":  resolved,
			"createdAt": createdAt,
		})
	}
	return alerts, rows.Err()
}
