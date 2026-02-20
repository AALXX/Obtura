package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// InsightType represents the type of AI insight
type InsightType string

const (
	InsightTypeBuildFailure InsightType = "build_failure"
	InsightTypePerformance  InsightType = "performance"
	InsightTypeSecurity     InsightType = "security"
	InsightTypeCost         InsightType = "cost"
)

// InsightSeverity represents the severity of an insight
type InsightSeverity string

const (
	InsightSeverityInfo     InsightSeverity = "info"
	InsightSeverityWarning  InsightSeverity = "warning"
	InsightSeverityCritical InsightSeverity = "critical"
)

// InsightStatus represents the status of an insight
type InsightStatus string

const (
	InsightStatusActive   InsightStatus = "active"
	InsightStatusResolved InsightStatus = "resolved"
	InsightStatusIgnored  InsightStatus = "ignored"
)

// Insight represents an AI-generated insight
type Insight struct {
	ID              string          `json:"id"`
	ProjectID       string          `json:"projectId"`
	Type            InsightType     `json:"type"`
	Severity        InsightSeverity `json:"severity"`
	Title           string          `json:"title"`
	Description     string          `json:"description"`
	RootCause       *string         `json:"rootCause,omitempty"`
	Recommendation  string          `json:"recommendation"`
	ConfidenceScore *float64        `json:"confidenceScore,omitempty"`
	Context         json.RawMessage `json:"context"`
	Status          InsightStatus   `json:"status"`
	ResolvedAt      *time.Time      `json:"resolvedAt,omitempty"`
	ResolvedBy      *string         `json:"resolvedBy,omitempty"`
	CreatedAt       time.Time       `json:"createdAt"`
}

// InsightsStore handles database operations for AI insights
type InsightsStore struct {
	db *sql.DB
}

// NewInsightsStore creates a new insights store
func NewInsightsStore(db *sql.DB) *InsightsStore {
	return &InsightsStore{db: db}
}

// CreateInsight creates a new AI insight
func (s *InsightsStore) CreateInsight(projectID string, insightType InsightType, severity InsightSeverity,
	title, description, recommendation string, rootCause *string, confidenceScore *float64,
	context map[string]interface{}) (*Insight, error) {

	id := uuid.New().String()
	now := time.Now()

	var contextJSON []byte
	var err error
	if context != nil {
		contextJSON, err = json.Marshal(context)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal context: %w", err)
		}
	}

	query := `
		INSERT INTO ai_insights (
			id, project_id, type, severity, title, description, root_cause,
			recommendation, confidence_score, context, status, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11)
		RETURNING id, project_id, type, severity, title, description, root_cause,
			recommendation, confidence_score, context, status, resolved_at, resolved_by, created_at
	`

	var insight Insight
	var rootCauseStr sql.NullString
	var confidence sql.NullFloat64
	var resolvedAt sql.NullTime
	var resolvedBy sql.NullString

	err = s.db.QueryRow(query, id, projectID, insightType, severity, title, description,
		rootCause, recommendation, confidenceScore, contextJSON, now).Scan(
		&insight.ID, &insight.ProjectID, &insight.Type, &insight.Severity, &insight.Title,
		&insight.Description, &rootCauseStr, &insight.Recommendation, &confidence,
		&insight.Context, &insight.Status, &resolvedAt, &resolvedBy, &insight.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create insight: %w", err)
	}

	if rootCauseStr.Valid {
		insight.RootCause = &rootCauseStr.String
	}
	if confidence.Valid {
		insight.ConfidenceScore = &confidence.Float64
	}
	if resolvedAt.Valid {
		insight.ResolvedAt = &resolvedAt.Time
	}
	if resolvedBy.Valid {
		insight.ResolvedBy = &resolvedBy.String
	}

	return &insight, nil
}

// GetInsight retrieves an insight by ID
func (s *InsightsStore) GetInsight(insightID string) (*Insight, error) {
	query := `
		SELECT id, project_id, type, severity, title, description, root_cause,
			recommendation, confidence_score, context, status, resolved_at, resolved_by, created_at
		FROM ai_insights
		WHERE id = $1
	`

	var insight Insight
	var rootCauseStr sql.NullString
	var confidence sql.NullFloat64
	var resolvedAt sql.NullTime
	var resolvedBy sql.NullString

	err := s.db.QueryRow(query, insightID).Scan(
		&insight.ID, &insight.ProjectID, &insight.Type, &insight.Severity, &insight.Title,
		&insight.Description, &rootCauseStr, &insight.Recommendation, &confidence,
		&insight.Context, &insight.Status, &resolvedAt, &resolvedBy, &insight.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("insight not found")
		}
		return nil, fmt.Errorf("failed to get insight: %w", err)
	}

	if rootCauseStr.Valid {
		insight.RootCause = &rootCauseStr.String
	}
	if confidence.Valid {
		insight.ConfidenceScore = &confidence.Float64
	}
	if resolvedAt.Valid {
		insight.ResolvedAt = &resolvedAt.Time
	}
	if resolvedBy.Valid {
		insight.ResolvedBy = &resolvedBy.String
	}

	return &insight, nil
}

// GetInsightsByProject retrieves insights for a project with optional filters
func (s *InsightsStore) GetInsightsByProject(projectID string, status *InsightStatus, limit, offset int) ([]Insight, error) {
	query := `
		SELECT id, project_id, type, severity, title, description, root_cause,
			recommendation, confidence_score, context, status, resolved_at, resolved_by, created_at
		FROM ai_insights
		WHERE project_id = $1
	`
	args := []interface{}{projectID}
	argCount := 1

	if status != nil {
		argCount++
		query += fmt.Sprintf(" AND status = $%d", argCount)
		args = append(args, *status)
	}

	query += " ORDER BY created_at DESC"

	if limit > 0 {
		argCount++
		query += fmt.Sprintf(" LIMIT $%d", argCount)
		args = append(args, limit)
	}

	if offset > 0 {
		argCount++
		query += fmt.Sprintf(" OFFSET $%d", argCount)
		args = append(args, offset)
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get insights: %w", err)
	}
	defer rows.Close()

	var insights []Insight
	for rows.Next() {
		var insight Insight
		var rootCauseStr sql.NullString
		var confidence sql.NullFloat64
		var resolvedAt sql.NullTime
		var resolvedBy sql.NullString

		err := rows.Scan(
			&insight.ID, &insight.ProjectID, &insight.Type, &insight.Severity, &insight.Title,
			&insight.Description, &rootCauseStr, &insight.Recommendation, &confidence,
			&insight.Context, &insight.Status, &resolvedAt, &resolvedBy, &insight.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan insight: %w", err)
		}

		if rootCauseStr.Valid {
			insight.RootCause = &rootCauseStr.String
		}
		if confidence.Valid {
			insight.ConfidenceScore = &confidence.Float64
		}
		if resolvedAt.Valid {
			insight.ResolvedAt = &resolvedAt.Time
		}
		if resolvedBy.Valid {
			insight.ResolvedBy = &resolvedBy.String
		}

		insights = append(insights, insight)
	}

	return insights, nil
}

// ResolveInsight marks an insight as resolved
func (s *InsightsStore) ResolveInsight(insightID, resolvedBy string) error {
	query := `
		UPDATE ai_insights
		SET status = 'resolved', resolved_at = $1, resolved_by = $2
		WHERE id = $3
	`

	_, err := s.db.Exec(query, time.Now(), resolvedBy, insightID)
	if err != nil {
		return fmt.Errorf("failed to resolve insight: %w", err)
	}

	return nil
}

// IgnoreInsight marks an insight as ignored
func (s *InsightsStore) IgnoreInsight(insightID string) error {
	query := `
		UPDATE ai_insights
		SET status = 'ignored'
		WHERE id = $1
	`

	_, err := s.db.Exec(query, insightID)
	if err != nil {
		return fmt.Errorf("failed to ignore insight: %w", err)
	}

	return nil
}

// GetActiveInsightsCount returns the count of active insights for a project
func (s *InsightsStore) GetActiveInsightsCount(projectID string) (int, error) {
	query := `
		SELECT COUNT(*)
		FROM ai_insights
		WHERE project_id = $1 AND status = 'active'
	`

	var count int
	err := s.db.QueryRow(query, projectID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count insights: %w", err)
	}

	return count, nil
}

// GetInsightsByBuild retrieves insights related to a specific build
func (s *InsightsStore) GetInsightsByBuild(projectID, buildID string) ([]Insight, error) {
	query := `
		SELECT id, project_id, type, severity, title, description, root_cause,
			recommendation, confidence_score, context, status, resolved_at, resolved_by, created_at
		FROM ai_insights
		WHERE project_id = $1 AND context->>'buildId' = $2
		ORDER BY created_at DESC
	`

	rows, err := s.db.Query(query, projectID, buildID)
	if err != nil {
		return nil, fmt.Errorf("failed to get build insights: %w", err)
	}
	defer rows.Close()

	var insights []Insight
	for rows.Next() {
		var insight Insight
		var rootCauseStr sql.NullString
		var confidence sql.NullFloat64
		var resolvedAt sql.NullTime
		var resolvedBy sql.NullString

		err := rows.Scan(
			&insight.ID, &insight.ProjectID, &insight.Type, &insight.Severity, &insight.Title,
			&insight.Description, &rootCauseStr, &insight.Recommendation, &confidence,
			&insight.Context, &insight.Status, &resolvedAt, &resolvedBy, &insight.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan insight: %w", err)
		}

		if rootCauseStr.Valid {
			insight.RootCause = &rootCauseStr.String
		}
		if confidence.Valid {
			insight.ConfidenceScore = &confidence.Float64
		}
		if resolvedAt.Valid {
			insight.ResolvedAt = &resolvedAt.Time
		}
		if resolvedBy.Valid {
			insight.ResolvedBy = &resolvedBy.String
		}

		insights = append(insights, insight)
	}

	return insights, nil
}
