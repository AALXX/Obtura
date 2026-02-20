package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"ai-agent-service/internal/analyzer"
	"ai-agent-service/internal/clients"
	"ai-agent-service/internal/llm"
)

// Agent is the AI agent that processes conversations
type Agent struct {
	llmManager    *llm.Manager
	buildAnalyzer *analyzer.BuildAnalyzer
	buildClient   *clients.BuildServiceClient
	minioClient   *clients.MinioClient
	systemPrompt  string
}

// NewAgent creates a new AI agent
func NewAgent(llmManager *llm.Manager) *Agent {
	return &Agent{
		llmManager: llmManager,
		systemPrompt: `You are Obtura AI, an intelligent DevOps assistant for the Obtura platform.

Your role is to help users with:
- Deployments: Help deploy projects to production, staging, or preview environments
- Log Analysis: Analyze build logs, deployment logs, and container logs
- Troubleshooting: Diagnose issues, suggest fixes, and provide debugging help
- Configuration: Manage environment variables, secrets, and deployment settings
- Monitoring: Analyze metrics, alerts, and suggest optimizations
- Scaling: Recommend resource adjustments and auto-scaling configurations

When a user asks about a build (e.g., "what went wrong in build:123-abc"), you should:
1. Extract the build ID from their message (format: build:XXXXX or just the ID)
2. Use the analyze_build tool to get the build details and analysis
3. Present the findings in a clear, actionable way

Guidelines:
- Be concise but informative in your responses
- Use markdown formatting for clarity
- When analyzing logs, highlight key errors and provide actionable solutions
- For deployments, confirm details before making changes
- Always prioritize safety and ask for confirmation before destructive operations
- If you don't know something, say so rather than making assumptions

Respond in a professional but approachable manner.`,
	}
}

// NewAgentWithDeps creates a new AI agent with dependencies
func NewAgentWithDeps(llmManager *llm.Manager, buildAnalyzer *analyzer.BuildAnalyzer, buildClient *clients.BuildServiceClient, minioClient *clients.MinioClient) *Agent {
	agent := NewAgent(llmManager)
	agent.buildAnalyzer = buildAnalyzer
	agent.buildClient = buildClient
	agent.minioClient = minioClient
	return agent
}

// GetSystemPrompt returns the system prompt
func (a *Agent) GetSystemPrompt() string {
	return a.systemPrompt
}

// Process processes a conversation and returns a response
func (a *Agent) Process(messages []llm.Message) (*llm.CompletionResponse, error) {
	// Check if this is a build analysis request
	if len(messages) > 0 {
		lastMsg := messages[len(messages)-1]

		// Try to extract build ID and handle specially
		if buildID, projectID := a.extractBuildInfo(lastMsg.Content); buildID != "" {
			return a.handleBuildAnalysis(lastMsg.Content, buildID, projectID)
		}
	}

	req := llm.CompletionRequest{
		Messages:    messages,
		MaxTokens:   2000,
		Temperature: 0.7,
		Stream:      false,
	}

	return a.llmManager.Complete(context.Background(), req)
}

func (a *Agent) extractBuildInfo(content string) (buildID, projectID string) {
	// Pattern 1: "build:12ad21-213213da2-321321"
	buildPattern := regexp.MustCompile(`build:([a-zA-Z0-9-]+)`)
	matches := buildPattern.FindStringSubmatch(content)
	if len(matches) > 1 {
		return matches[1], ""
	}

	// Pattern 2: "build 12ad21" or "build id 12ad21"
	buildNumPattern := regexp.MustCompile(`(?:build|id)[:\s]+([a-zA-Z0-9-]+)`)
	matches = buildNumPattern.FindStringSubmatch(content)
	if len(matches) > 1 {
		return matches[1], ""
	}

	// Pattern 3: Just a UUID-like string in context of build
	uuidPattern := regexp.MustCompile(`\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b`)
	matches = uuidPattern.FindStringSubmatch(content)
	if len(matches) > 1 {
		return matches[1], ""
	}

	return "", ""
}

func (a *Agent) handleBuildAnalysis(userMessage, buildID, projectID string) (*llm.CompletionResponse, error) {
	if a.buildAnalyzer == nil || a.buildClient == nil {
		return &llm.CompletionResponse{
			Content: "I'm not configured to analyze builds. Please ensure the build analyzer is enabled.",
		}, nil
	}

	// If no projectID, try to get build info first
	if projectID == "" {
		buildInfo, err := a.buildClient.GetBuild(context.Background(), buildID)
		if err != nil {
			return &llm.CompletionResponse{
				Content: fmt.Sprintf("I couldn't find build %s. Error: %v", buildID, err),
			}, nil
		}
		projectID = buildInfo.ProjectID
	}

	// Analyze the build
	result, err := a.buildAnalyzer.AnalyzeBuild(context.Background(), buildID, projectID)
	if err != nil {
		return &llm.CompletionResponse{
			Content: fmt.Sprintf("I couldn't analyze build %s. Error: %v", buildID, err),
		}, nil
	}

	// Format the response
	response := fmt.Sprintf(`## Build Analysis: %s

**Severity:** %s

### Root Cause
%s

### Recommendation
%s

### Context
- Build ID: %s
- Confidence: %.0f%%

%s`,
		buildID,
		result.Severity,
		result.RootCause,
		result.Recommendation,
		result.BuildID,
		result.Confidence*100,
		result.Description,
	)

	return &llm.CompletionResponse{
		Content: response,
	}, nil
}

// ProcessStream processes a conversation and returns a streaming response
func (a *Agent) ProcessStream(messages []llm.Message) (<-chan llm.StreamResponse, error) {
	// Check if this is a build analysis request
	if len(messages) > 0 {
		lastMsg := messages[len(messages)-1]
		if buildID, projectID := a.extractBuildInfo(lastMsg.Content); buildID != "" {
			// For build analysis, we return a non-streaming response as a stream
			result, err := a.handleBuildAnalysis(lastMsg.Content, buildID, projectID)
			if err != nil {
				ch := make(chan llm.StreamResponse)
				ch <- llm.StreamResponse{Content: result.Content, Done: true}
				close(ch)
				return ch, nil
			}

			ch := make(chan llm.StreamResponse)
			go func() {
				defer close(ch)
				// Stream word by word
				words := strings.Fields(result.Content)
				for i, word := range words {
					ch <- llm.StreamResponse{Content: word + " "}
					if i == len(words)-1 {
						ch <- llm.StreamResponse{Done: true}
					}
				}
			}()
			return ch, nil
		}
	}

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
func (a *Agent) ExecuteTool(name string, params map[string]interface{}) (string, error) {
	switch name {
	case "analyze_build":
		return a.toolAnalyzeBuild(params)
	case "get_build_logs":
		return a.toolGetBuildLogs(params)
	case "get_deployments":
		return a.toolGetDeployments(params)
	case "get_metrics":
		return a.toolGetMetrics(params)
	default:
		return "", fmt.Errorf("unknown tool: %s", name)
	}
}

func (a *Agent) toolAnalyzeBuild(params map[string]interface{}) (string, error) {
	buildID, ok := params["buildId"].(string)
	if !ok || buildID == "" {
		return "", fmt.Errorf("buildId is required")
	}

	projectID, _ := params["projectId"].(string)

	if a.buildAnalyzer == nil {
		return "", fmt.Errorf("build analyzer not configured")
	}

	result, err := a.buildAnalyzer.AnalyzeBuild(context.Background(), buildID, projectID)
	if err != nil {
		return "", fmt.Errorf("failed to analyze build: %w", err)
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return string(jsonResult), nil
}

func (a *Agent) toolGetBuildLogs(params map[string]interface{}) (string, error) {
	buildID, ok := params["buildId"].(string)
	if !ok || buildID == "" {
		return "", fmt.Errorf("buildId is required")
	}

	projectID, _ := params["projectId"].(string)
	maxLines := 100
	if lines, ok := params["maxLines"].(float64); ok {
		maxLines = int(lines)
	}

	if a.minioClient == nil {
		return "", fmt.Errorf("minio client not configured")
	}

	logs, err := a.minioClient.GetBuildLogTail(context.Background(), projectID, buildID, maxLines)
	if err != nil {
		return "", fmt.Errorf("failed to get build logs: %w", err)
	}

	return logs, nil
}

func (a *Agent) toolGetDeployments(params map[string]interface{}) (string, error) {
	// This would query the database for deployments
	return `To get deployments, please use the deployments API or ask about a specific deployment.`, nil
}

func (a *Agent) toolGetMetrics(params map[string]interface{}) (string, error) {
	// This would fetch metrics
	return `To get metrics, please use the monitoring service API.`, nil
}

// AvailableTools returns the list of tools available to the AI
func (a *Agent) AvailableTools() []Tool {
	return []Tool{
		{
			Name:        "analyze_build",
			Description: "Analyze a build and provide insights about failures or issues",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"buildId": map[string]interface{}{
						"type":        "string",
						"description": "The build ID to analyze",
					},
					"projectId": map[string]interface{}{
						"type":        "string",
						"description": "The project ID (optional if build ID is unique)",
					},
				},
				"required": []string{"buildId"},
			},
		},
		{
			Name:        "get_build_logs",
			Description: "Get build logs for a specific build",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"buildId": map[string]interface{}{
						"type":        "string",
						"description": "The build ID",
					},
					"projectId": map[string]interface{}{
						"type":        "string",
						"description": "The project ID",
					},
					"maxLines": map[string]interface{}{
						"type":        "integer",
						"description": "Maximum number of lines to return",
						"default":     100,
					},
				},
				"required": []string{"buildId", "projectId"},
			},
		},
		{
			Name:        "get_deployments",
			Description: "Get a list of recent deployments for the project",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"environment": map[string]interface{}{
						"type":        "string",
						"description": "Filter by environment (production, staging, preview)",
						"enum":        []string{"production", "staging", "preview", "all"},
					},
					"limit": map[string]interface{}{
						"type":        "integer",
						"description": "Number of deployments to return",
						"default":     10,
					},
				},
			},
		},
		{
			Name:        "get_metrics",
			Description: "Get current metrics for the project",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"metricType": map[string]interface{}{
						"type":        "string",
						"description": "Type of metrics to retrieve",
						"enum":        []string{"cpu", "memory", "disk", "network", "all"},
						"default":     "all",
					},
				},
			},
		},
	}
}
