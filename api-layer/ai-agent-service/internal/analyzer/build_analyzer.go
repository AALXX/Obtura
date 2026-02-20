package analyzer

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"ai-agent-service/internal/clients"
	"ai-agent-service/internal/llm"
	"ai-agent-service/internal/storage"
)

type BuildAnalyzer struct {
	db          *sql.DB
	llmManager  *llm.Manager
	minioClient *clients.MinioClient
	buildClient *clients.BuildServiceClient
}

type BuildAnalysisResult struct {
	BuildID        string                 `json:"buildId"`
	ProjectID      string                 `json:"projectId"`
	Type           string                 `json:"type"`
	Severity       string                 `json:"severity"`
	Title          string                 `json:"title"`
	Description    string                 `json:"description"`
	RootCause      string                 `json:"rootCause"`
	Recommendation string                 `json:"recommendation"`
	Confidence     float64                `json:"confidence"`
	Context        map[string]interface{} `json:"context"`
}

func NewBuildAnalyzer(db *sql.DB, llmManager *llm.Manager, minioClient *clients.MinioClient, buildClient *clients.BuildServiceClient) *BuildAnalyzer {
	return &BuildAnalyzer{
		db:          db,
		llmManager:  llmManager,
		minioClient: minioClient,
		buildClient: buildClient,
	}
}

func (a *BuildAnalyzer) AnalyzeBuild(ctx context.Context, buildID, projectID string) (*BuildAnalysisResult, error) {
	log.Printf("🔍 Analyzing build: %s", buildID)

	buildInfo, err := a.buildClient.GetBuild(ctx, buildID)
	if err != nil {
		return nil, fmt.Errorf("failed to get build info: %w", err)
	}

	projectID = buildInfo.ProjectID

	logContent, err := a.minioClient.GetBuildLogTail(ctx, projectID, buildID, 500)
	if err != nil {
		log.Printf("⚠️ Could not fetch build logs: %v", err)
		logContent = "Build logs not available"
	}

	prompt := a.buildAnalysisPrompt(buildInfo, logContent)

	provider, err := a.llmManager.GetProvider(llm.ProviderClaude)
	if err != nil {
		return nil, fmt.Errorf("failed to get LLM provider: %w", err)
	}

	response, err := provider.Complete(ctx, llm.CompletionRequest{
		Messages: []llm.Message{
			{Role: "system", Content: "You are an expert DevOps engineer analyzing build failures. Analyze the build logs and provide actionable insights."},
			{Role: "user", Content: prompt},
		},
		MaxTokens:   2000,
		Temperature: 0.3,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get LLM analysis: %w", err)
	}

	result := a.parseBuildAnalysisResponse(buildID, projectID, buildInfo, response.Content)

	if result.Title == "" {
		result.Title = "Build Analysis"
		result.Description = response.Content
		result.Recommendation = "Please review the build logs manually."
		result.Severity = "info"
	}

	insightID, err := a.storeInsight(ctx, result)
	if err != nil {
		log.Printf("⚠️ Failed to store insight: %v", err)
	} else {
		log.Printf("✅ Stored insight: %s", insightID)
	}

	return result, nil
}

func (a *BuildAnalyzer) buildAnalysisPrompt(build *clients.BuildInfo, logs string) string {
	return fmt.Sprintf(`
Analyze the following failed build:

**Build Information:**
- Build ID: %s
- Project: %s
- Commit: %s
- Branch: %s
- Status: %s
- Framework: %s
- Build Time: %d seconds

**Build Logs (last 500 lines):


%s

**Error Message:**
%s

Please analyze and provide:
1. Root cause of the failure
2. Suggested fix with code examples
3. Confidence score (0.0-1.0)
4. Preventive measures

Format your response as JSON with these fields:
{
  "root_cause": "...",
  "suggested_fix": "...",
  "confidence": 0.95,
  "preventive_measures": ["..."]
}
`, build.ID, build.ProjectName, build.CommitHash, build.Branch, build.Status, build.Framework, build.BuildTime, logs, build.ErrorMsg)
}

func (a *BuildAnalyzer) parseBuildAnalysisResponse(buildID, projectID string, build *clients.BuildInfo, response string) *BuildAnalysisResult {
	result := &BuildAnalysisResult{
		BuildID:   buildID,
		ProjectID: projectID,
		Type:      "build_failure",
		Severity:  "critical",
		Context: map[string]interface{}{
			"buildId":    build.ID,
			"commitHash": build.CommitHash,
			"branch":     build.Branch,
			"framework":  build.Framework,
			"buildTime":  build.BuildTime,
			"status":     build.Status,
		},
	}

	var parsed struct {
		RootCause          string   `json:"root_cause"`
		SuggestedFix       string   `json:"suggested_fix"`
		Confidence         float64  `json:"confidence"`
		PreventiveMeasures []string `json:"preventive_measures"`
	}

	if err := json.Unmarshal([]byte(response), &parsed); err == nil {
		result.RootCause = parsed.RootCause
		result.Recommendation = parsed.SuggestedFix
		result.Confidence = parsed.Confidence

		if len(parsed.PreventiveMeasures) > 0 {
			result.Description = fmt.Sprintf("Root cause: %s. Prevention: %v", parsed.RootCause, parsed.PreventiveMeasures)
		} else {
			result.Description = fmt.Sprintf("Root cause: %s. Suggested fix: %s", parsed.RootCause, parsed.SuggestedFix)
		}
	} else {
		result.Description = response
		result.Recommendation = "Please review the build logs manually."
		result.Confidence = 0.5
	}

	result.Title = fmt.Sprintf("Build %s Failed: %s", buildID[:8], extractErrorSummary(build.ErrorMsg))

	return result
}

func (a *BuildAnalyzer) storeInsight(ctx context.Context, result *BuildAnalysisResult) (string, error) {
	insightStore := storage.NewInsightsStore(a.db)

	insightType := storage.InsightType(result.Type)
	insightSeverity := storage.InsightSeverity(result.Severity)
	var rootCause *string
	if result.RootCause != "" {
		rootCause = &result.RootCause
	}
	var confidence *float64
	if result.Confidence > 0 {
		confidence = &result.Confidence
	}

	insight, err := insightStore.CreateInsight(
		result.ProjectID,
		insightType,
		insightSeverity,
		result.Title,
		result.Description,
		result.Recommendation,
		rootCause,
		confidence,
		result.Context,
	)
	if err != nil {
		return "", err
	}

	return insight.ID, nil
}

func extractErrorSummary(errorMsg string) string {
	if errorMsg == "" {
		return "Unknown error"
	}
	if len(errorMsg) > 50 {
		return errorMsg[:50] + "..."
	}
	return errorMsg
}

func (a *BuildAnalyzer) AnalyzeBuildAuto(projectID, buildID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	result, err := a.AnalyzeBuild(ctx, buildID, projectID)
	if err != nil {
		log.Printf("❌ Failed to analyze build %s: %v", buildID, err)
		return
	}

	log.Printf("✅ Build analysis complete: %s (confidence: %.2f)", result.Title, result.Confidence)
}
