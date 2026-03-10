package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"ai-agent-service/internal/analyzer"
	"ai-agent-service/internal/clients"
	"ai-agent-service/internal/llm"
)

// Agent is the AI agent that processes conversations
type Agent struct {
	llmManager       *llm.Manager
	buildAnalyzer    *analyzer.BuildAnalyzer
	platformDB       *clients.PlatformDB
	minioClient      *clients.MinioClient
	monitoringClient *clients.MonitoringServiceClient
	systemPrompt     string
}

// NewAgent creates a new AI agent
func NewAgent(llmManager *llm.Manager) *Agent {
	return &Agent{
		llmManager:   llmManager,
		systemPrompt: buildSystemPrompt(),
	}
}

func buildSystemPrompt() string {
	return `You are Obtura AI, an intelligent DevOps assistant for the Obtura platform.

You have REAL-TIME access to the following platform data:
- **Builds**: List all builds for a project, get build details, and analyze build failures with full logs
- **Deployments**: List and inspect deployments across production, staging, and preview environments
- **Deployment Logs**: Full deployment logs stored in the database
- **Alerts**: Active unresolved alerts from the platform
- **Build Logs**: Raw build output logs (from MinIO when available, from DB otherwise)

When the user asks about builds, deployments, logs, or alerts, the real data is automatically fetched and included in this context. Use it directly — do NOT say you lack access to this information.

Guidelines:
- Be concise but informative
- Use markdown formatting for clarity
- When analyzing logs or errors, highlight the root cause and provide actionable solutions
- For deployments, confirm details before suggesting destructive actions
- Always prioritize safety
- If data is unavailable (fetch error), say so explicitly — do not fabricate data

Respond in a professional but approachable manner.`
}

// NewAgentWithDeps creates a new AI agent with all service dependencies
func NewAgentWithDeps(
	llmManager *llm.Manager,
	buildAnalyzer *analyzer.BuildAnalyzer,
	platformDB *clients.PlatformDB,
	minioClient *clients.MinioClient,
	monitoringClient *clients.MonitoringServiceClient,
) *Agent {
	agent := NewAgent(llmManager)
	agent.buildAnalyzer = buildAnalyzer
	agent.platformDB = platformDB
	agent.minioClient = minioClient
	agent.monitoringClient = monitoringClient
	return agent
}

// GetSystemPrompt returns the system prompt
func (a *Agent) GetSystemPrompt() string {
	return a.systemPrompt
}

// EnrichContext inspects the user message, fetches relevant platform data,
// and returns an enriched system context block to inject before the LLM call.
// projectID is always known from the request.
func (a *Agent) EnrichContext(ctx context.Context, userMessage, projectID string) string {
	var parts []string

	// --- Build ID detected → fetch build details + logs ---
	if buildID := a.extractBuildID(userMessage); buildID != "" {
		section := a.fetchBuildContext(ctx, buildID, projectID)
		if section != "" {
			parts = append(parts, section)
		}
	}

	// --- "list builds" / "all builds" / "recent builds" intent ---
	if a.isListBuildsIntent(userMessage) && projectID != "" {
		section := a.fetchBuildsListContext(ctx, projectID)
		if section != "" {
			parts = append(parts, section)
		}
	}

	// --- Deployment intent ---
	if a.isDeploymentIntent(userMessage) && projectID != "" {
		section := a.fetchDeploymentsContext(ctx, projectID, userMessage)
		if section != "" {
			parts = append(parts, section)
		}
	}

	// --- Metrics / alerts intent ---
	if a.isMetricsIntent(userMessage) && projectID != "" {
		section := a.fetchAlertsContext(ctx, projectID)
		if section != "" {
			parts = append(parts, section)
		}
	}

	if len(parts) == 0 {
		return ""
	}

	return "## Live Platform Data\n\n" + strings.Join(parts, "\n\n---\n\n")
}

// extractBuildID attempts to find a build ID in the user message.
func (a *Agent) extractBuildID(content string) string {
	// "build:12ad21" or "build: 12ad21"
	if m := regexp.MustCompile(`build\s*:\s*([a-zA-Z0-9-]+)`).FindStringSubmatch(content); len(m) > 1 {
		return m[1]
	}
	// full UUID
	if m := regexp.MustCompile(`\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b`).FindStringSubmatch(content); len(m) > 1 {
		return m[1]
	}
	// short hex ID (8+ chars) when message is clearly about a build/log/error
	lower := strings.ToLower(content)
	if strings.Contains(lower, "build") || strings.Contains(lower, "log") || strings.Contains(lower, "fail") || strings.Contains(lower, "error") || strings.Contains(lower, "check") || strings.Contains(lower, "analyze") {
		if m := regexp.MustCompile(`\b([a-f0-9]{8,})\b`).FindStringSubmatch(content); len(m) > 1 {
			return m[1]
		}
	}
	return ""
}

func (a *Agent) isListBuildsIntent(msg string) bool {
	lower := strings.ToLower(msg)
	keywords := []string{
		"list builds", "all builds", "recent builds", "show builds",
		"show me the builds", "get builds", "my builds", "project builds",
		"build history", "builds for", "latest builds", "builds list",
	}
	for _, kw := range keywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

func (a *Agent) isDeploymentIntent(msg string) bool {
	lower := strings.ToLower(msg)
	keywords := []string{
		"deployment", "deployments", "deployed", "deploy", "production",
		"staging", "preview", "list deploys", "show deploys", "current deploy",
		"deployment logs", "deploy logs",
	}
	for _, kw := range keywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

func (a *Agent) isMetricsIntent(msg string) bool {
	lower := strings.ToLower(msg)
	keywords := []string{
		"metrics", "cpu", "memory", "latency", "error rate", "request rate",
		"performance", "p95", "p99", "throughput", "alerts", "anomaly",
		"warnings", "issues",
	}
	for _, kw := range keywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

// fetchBuildContext fetches build metadata and logs and returns a formatted string.
func (a *Agent) fetchBuildContext(ctx context.Context, buildID, projectID string) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### Build: `%s`\n", buildID))

	if a.platformDB == nil {
		sb.WriteString("_Database client not configured._\n")
		return sb.String()
	}

	build, err := a.platformDB.GetBuild(ctx, buildID)
	if err != nil {
		sb.WriteString(fmt.Sprintf("_Could not fetch build metadata: %v_\n", err))
	} else {
		if projectID == "" {
			projectID = build.ProjectID
		}
		duration := "-"
		if build.BuildTime > 0 {
			duration = fmt.Sprintf("%ds", build.BuildTime)
		}
		sb.WriteString(fmt.Sprintf("- **Status**: %s %s\n", statusEmoji(build.Status), build.Status))
		sb.WriteString(fmt.Sprintf("- **Project**: %s\n", build.ProjectName))
		sb.WriteString(fmt.Sprintf("- **Branch**: %s\n", build.Branch))
		sb.WriteString(fmt.Sprintf("- **Commit**: `%s`\n", build.CommitHash))
		sb.WriteString(fmt.Sprintf("- **Framework**: %s\n", build.Framework))
		sb.WriteString(fmt.Sprintf("- **Duration**: %s\n", duration))
		if build.ErrorMsg != "" {
			sb.WriteString(fmt.Sprintf("- **Error**: %s\n", build.ErrorMsg))
		}
		sb.WriteString(fmt.Sprintf("- **Created**: %s\n", build.CreatedAt.Format(time.RFC3339)))
	}

	// Try MinIO logs first (richer, full output)
	if a.minioClient != nil && projectID != "" {
		logs, err := a.minioClient.GetBuildLogTail(ctx, projectID, buildID, 300)
		if err == nil && strings.TrimSpace(logs) != "" {
			sb.WriteString("\n**Build Logs (last 300 lines from MinIO):**\n```\n")
			sb.WriteString(logs)
			sb.WriteString("\n```\n")
			return sb.String()
		}
	}

	// Fall back to DB build_logs table
	if a.platformDB != nil {
		logs, err := a.platformDB.GetBuildLogs(ctx, buildID, 300)
		if err == nil && strings.TrimSpace(logs) != "" {
			sb.WriteString("\n**Build Logs (last 300 lines from DB):**\n```\n")
			sb.WriteString(logs)
			sb.WriteString("\n```\n")
		} else if err != nil {
			sb.WriteString(fmt.Sprintf("\n_Could not fetch build logs: %v_\n", err))
		}
	}

	return sb.String()
}

// fetchBuildsListContext fetches recent builds for a project.
func (a *Agent) fetchBuildsListContext(ctx context.Context, projectID string) string {
	if a.platformDB == nil {
		return "_Database client not configured._"
	}

	builds, err := a.platformDB.GetProjectBuilds(ctx, projectID, 20)
	if err != nil {
		return fmt.Sprintf("_Could not fetch builds: %v_", err)
	}

	if len(builds) == 0 {
		return "### Builds\nNo builds found for this project."
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### Recent Builds (%d)\n\n", len(builds)))
	sb.WriteString("| # | Build ID | Status | Branch | Commit | Duration | Created |\n")
	sb.WriteString("|---|----------|--------|--------|--------|----------|---------|\n")

	for i, b := range builds {
		duration := "-"
		if b.BuildTime > 0 {
			duration = fmt.Sprintf("%ds", b.BuildTime)
		}
		commit := b.CommitHash
		if len(commit) > 8 {
			commit = commit[:8]
		}
		sb.WriteString(fmt.Sprintf("| %d | `%s` | %s %s | %s | `%s` | %s | %s |\n",
			i+1,
			b.ID,
			statusEmoji(b.Status), b.Status,
			b.Branch,
			commit,
			duration,
			b.CreatedAt.Format("2006-01-02 15:04"),
		))
	}

	return sb.String()
}

// fetchDeploymentsContext fetches deployments for a project.
func (a *Agent) fetchDeploymentsContext(ctx context.Context, projectID, userMessage string) string {
	if a.platformDB == nil {
		return "_Database client not configured._"
	}

	// Detect environment filter from message
	env := "all"
	lower := strings.ToLower(userMessage)
	if strings.Contains(lower, "production") || strings.Contains(lower, "prod") {
		env = "production"
	} else if strings.Contains(lower, "staging") {
		env = "staging"
	} else if strings.Contains(lower, "preview") {
		env = "preview"
	}

	deployments, err := a.platformDB.GetProjectDeployments(ctx, projectID, env, 10)
	if err != nil {
		return fmt.Sprintf("_Could not fetch deployments: %v_", err)
	}

	if len(deployments) == 0 {
		return fmt.Sprintf("### Deployments\nNo deployments found (environment: %s).", env)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### Recent Deployments (env: %s, count: %d)\n\n", env, len(deployments)))
	sb.WriteString("| # | Deployment ID | Environment | Status | Branch | Strategy | Created |\n")
	sb.WriteString("|---|---------------|-------------|--------|--------|----------|---------|\n")

	for i, d := range deployments {
		sb.WriteString(fmt.Sprintf("| %d | `%s` | %s | %s %s | %s | %s | %s |\n",
			i+1,
			d.ID,
			d.Environment,
			statusEmoji(d.Status), d.Status,
			d.Branch,
			d.Strategy,
			d.CreatedAt.Format("2006-01-02 15:04"),
		))
		if d.ErrorMsg != "" {
			sb.WriteString(fmt.Sprintf("  - Error: %s\n", d.ErrorMsg))
		}
	}

	// If asking about deployment logs, fetch logs for most recent deployment
	if strings.Contains(lower, "log") && len(deployments) > 0 {
		depLogs, err := a.platformDB.GetDeploymentLogs(ctx, deployments[0].ID, 100)
		if err == nil && strings.TrimSpace(depLogs) != "" {
			sb.WriteString(fmt.Sprintf("\n**Deployment Logs for `%s` (last 100 lines):**\n```\n", deployments[0].ID))
			sb.WriteString(depLogs)
			sb.WriteString("\n```\n")
		}
	}

	return sb.String()
}

// fetchAlertsContext fetches active alerts for a project.
func (a *Agent) fetchAlertsContext(ctx context.Context, projectID string) string {
	if a.platformDB == nil {
		return "_Database client not configured._"
	}

	alerts, err := a.platformDB.GetDeploymentAlerts(ctx, projectID, 10)
	if err != nil {
		return fmt.Sprintf("_Could not fetch alerts: %v_", err)
	}

	if len(alerts) == 0 {
		return "### Alerts\nNo active unresolved alerts for this project."
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### Active Alerts (%d unresolved)\n\n", len(alerts)))
	for _, al := range alerts {
		sb.WriteString(fmt.Sprintf("- [**%s**] `%s` — %s _(created: %s)_\n",
			strings.ToUpper(fmt.Sprintf("%v", al["severity"])),
			al["type"],
			al["message"],
			fmt.Sprintf("%v", al["createdAt"]),
		))
	}
	return sb.String()
}

func statusEmoji(status string) string {
	switch strings.ToLower(status) {
	case "completed", "success", "active":
		return "✅"
	case "failed":
		return "❌"
	case "queued", "pending":
		return "⏳"
	case "building", "cloning", "installing", "deploying", "running":
		return "🔄"
	case "cancelled":
		return "🚫"
	case "timeout":
		return "⏱️"
	default:
		return "•"
	}
}

// Process processes a conversation and returns a response
func (a *Agent) Process(messages []llm.Message) (*llm.CompletionResponse, error) {
	req := llm.CompletionRequest{
		Messages:    messages,
		MaxTokens:   2000,
		Temperature: 0.7,
		Stream:      false,
	}
	return a.llmManager.Complete(context.Background(), req)
}

// ProcessStream processes a conversation and returns a streaming response
func (a *Agent) ProcessStream(messages []llm.Message) (<-chan llm.StreamResponse, error) {
	req := llm.CompletionRequest{
		Messages:    messages,
		MaxTokens:   2000,
		Temperature: 0.7,
		Stream:      true,
	}
	return a.llmManager.CompleteStream(context.Background(), req)
}

// SetSystemPrompt allows setting a custom system prompt
func (a *Agent) SetSystemPrompt(prompt string) {
	a.systemPrompt = prompt
}

// GetAvailableProviders returns a list of available LLM providers
func (a *Agent) GetAvailableProviders() []string {
	providers := a.llmManager.ListAvailableProviders()
	names := make([]string, len(providers))
	for i, p := range providers {
		names[i] = string(p)
	}
	return names
}

// Tool represents a tool the AI can use
type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

// ExecuteTool executes a tool by name with given parameters
func (a *Agent) ExecuteTool(ctx context.Context, name string, params map[string]interface{}, projectID string) (string, error) {
	switch name {
	case "analyze_build":
		return a.toolAnalyzeBuild(ctx, params, projectID)
	case "get_build_logs":
		return a.toolGetBuildLogs(ctx, params, projectID)
	case "list_builds":
		return a.toolListBuilds(ctx, params, projectID)
	case "get_deployments":
		return a.toolGetDeployments(ctx, params, projectID)
	case "get_deployment_logs":
		return a.toolGetDeploymentLogs(ctx, params, projectID)
	case "get_alerts":
		return a.toolGetAlerts(ctx, params, projectID)
	default:
		return "", fmt.Errorf("unknown tool: %s", name)
	}
}

func (a *Agent) toolAnalyzeBuild(ctx context.Context, params map[string]interface{}, projectID string) (string, error) {
	buildID, ok := params["buildId"].(string)
	if !ok || buildID == "" {
		return "", fmt.Errorf("buildId is required")
	}
	if pid, ok := params["projectId"].(string); ok && pid != "" {
		projectID = pid
	}
	if a.buildAnalyzer == nil {
		return "", fmt.Errorf("build analyzer not configured")
	}
	result, err := a.buildAnalyzer.AnalyzeBuild(ctx, buildID, projectID)
	if err != nil {
		return "", fmt.Errorf("failed to analyze build: %w", err)
	}
	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return string(jsonResult), nil
}

func (a *Agent) toolGetBuildLogs(ctx context.Context, params map[string]interface{}, projectID string) (string, error) {
	buildID, ok := params["buildId"].(string)
	if !ok || buildID == "" {
		return "", fmt.Errorf("buildId is required")
	}
	if pid, ok := params["projectId"].(string); ok && pid != "" {
		projectID = pid
	}
	maxLines := 200
	if lines, ok := params["maxLines"].(float64); ok {
		maxLines = int(lines)
	}

	// Try MinIO first
	if a.minioClient != nil && projectID != "" {
		logs, err := a.minioClient.GetBuildLogTail(ctx, projectID, buildID, maxLines)
		if err == nil && strings.TrimSpace(logs) != "" {
			return logs, nil
		}
	}

	// Fall back to DB
	if a.platformDB != nil {
		logs, err := a.platformDB.GetBuildLogs(ctx, buildID, maxLines)
		if err != nil {
			return "", fmt.Errorf("failed to get build logs: %w", err)
		}
		return logs, nil
	}

	return "", fmt.Errorf("no log source configured")
}

func (a *Agent) toolListBuilds(ctx context.Context, params map[string]interface{}, projectID string) (string, error) {
	if pid, ok := params["projectId"].(string); ok && pid != "" {
		projectID = pid
	}
	if projectID == "" {
		return "", fmt.Errorf("projectId is required")
	}
	limit := 20
	if l, ok := params["limit"].(float64); ok {
		limit = int(l)
	}
	if a.platformDB == nil {
		return "", fmt.Errorf("database client not configured")
	}
	builds, err := a.platformDB.GetProjectBuilds(ctx, projectID, limit)
	if err != nil {
		return "", fmt.Errorf("failed to list builds: %w", err)
	}
	jsonResult, _ := json.MarshalIndent(builds, "", "  ")
	return string(jsonResult), nil
}

func (a *Agent) toolGetDeployments(ctx context.Context, params map[string]interface{}, projectID string) (string, error) {
	if pid, ok := params["projectId"].(string); ok && pid != "" {
		projectID = pid
	}
	if projectID == "" {
		return "", fmt.Errorf("projectId is required")
	}
	env := "all"
	if e, ok := params["environment"].(string); ok && e != "" {
		env = e
	}
	limit := 10
	if l, ok := params["limit"].(float64); ok {
		limit = int(l)
	}
	if a.platformDB == nil {
		return "", fmt.Errorf("database client not configured")
	}
	deployments, err := a.platformDB.GetProjectDeployments(ctx, projectID, env, limit)
	if err != nil {
		return "", fmt.Errorf("failed to get deployments: %w", err)
	}
	jsonResult, _ := json.MarshalIndent(deployments, "", "  ")
	return string(jsonResult), nil
}

func (a *Agent) toolGetDeploymentLogs(ctx context.Context, params map[string]interface{}, projectID string) (string, error) {
	deploymentID, ok := params["deploymentId"].(string)
	if !ok || deploymentID == "" {
		return "", fmt.Errorf("deploymentId is required")
	}
	maxLines := 200
	if l, ok := params["maxLines"].(float64); ok {
		maxLines = int(l)
	}
	if a.platformDB == nil {
		return "", fmt.Errorf("database client not configured")
	}
	logs, err := a.platformDB.GetDeploymentLogs(ctx, deploymentID, maxLines)
	if err != nil {
		return "", fmt.Errorf("failed to get deployment logs: %w", err)
	}
	return logs, nil
}

func (a *Agent) toolGetAlerts(ctx context.Context, params map[string]interface{}, projectID string) (string, error) {
	if pid, ok := params["projectId"].(string); ok && pid != "" {
		projectID = pid
	}
	if projectID == "" {
		return "", fmt.Errorf("projectId is required")
	}
	limit := 10
	if l, ok := params["limit"].(float64); ok {
		limit = int(l)
	}
	if a.platformDB == nil {
		return "", fmt.Errorf("database client not configured")
	}
	alerts, err := a.platformDB.GetDeploymentAlerts(ctx, projectID, limit)
	if err != nil {
		return "", fmt.Errorf("failed to get alerts: %w", err)
	}
	jsonResult, _ := json.MarshalIndent(alerts, "", "  ")
	return string(jsonResult), nil
}

// AvailableTools returns the list of tools available to the AI
func (a *Agent) AvailableTools() []Tool {
	return []Tool{
		{
			Name:        "list_builds",
			Description: "List all recent builds for a project with their status, branch, commit, and duration",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"projectId": map[string]interface{}{
						"type":        "string",
						"description": "The project ID (auto-resolved from context)",
					},
					"limit": map[string]interface{}{
						"type":    "integer",
						"default": 20,
					},
				},
			},
		},
		{
			Name:        "analyze_build",
			Description: "Analyze a specific build for failures or issues using build metadata and logs",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"buildId": map[string]interface{}{
						"type":        "string",
						"description": "The build ID to analyze",
					},
					"projectId": map[string]interface{}{
						"type":        "string",
						"description": "The project ID (auto-resolved from context if not provided)",
					},
				},
				"required": []string{"buildId"},
			},
		},
		{
			Name:        "get_build_logs",
			Description: "Get raw build logs for a specific build",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"buildId": map[string]interface{}{
						"type": "string",
					},
					"projectId": map[string]interface{}{
						"type": "string",
					},
					"maxLines": map[string]interface{}{
						"type":    "integer",
						"default": 200,
					},
				},
				"required": []string{"buildId"},
			},
		},
		{
			Name:        "get_deployments",
			Description: "List recent deployments for the project, optionally filtered by environment",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"environment": map[string]interface{}{
						"type": "string",
						"enum": []string{"production", "staging", "preview", "all"},
					},
					"limit": map[string]interface{}{
						"type":    "integer",
						"default": 10,
					},
				},
			},
		},
		{
			Name:        "get_deployment_logs",
			Description: "Get logs for a specific deployment",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"deploymentId": map[string]interface{}{
						"type": "string",
					},
					"maxLines": map[string]interface{}{
						"type":    "integer",
						"default": 200,
					},
				},
				"required": []string{"deploymentId"},
			},
		},
		{
			Name:        "get_alerts",
			Description: "Get active unresolved alerts for the project",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"limit": map[string]interface{}{
						"type":    "integer",
						"default": 10,
					},
				},
			},
		},
	}
}
