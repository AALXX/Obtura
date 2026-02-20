package llm

import (
	"context"
	"fmt"
	"math/rand"
	"strings"
	"time"
)

// MockProvider implements a mock LLM provider for development/testing
type MockProvider struct{}

// NewMockProvider creates a new mock provider
func NewMockProvider() *MockProvider {
	return &MockProvider{}
}

func (p *MockProvider) Name() string {
	return "mock"
}

func (p *MockProvider) IsAvailable() bool {
	return true
}

func (p *MockProvider) Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error) {
	// Simulate processing time
	time.Sleep(500 * time.Millisecond)

	// Get the last user message
	var userMessage string
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if req.Messages[i].Role == "user" {
			userMessage = req.Messages[i].Content
			break
		}
	}

	response := p.generateResponse(userMessage)

	return &CompletionResponse{
		Content:      response,
		FinishReason: "stop",
	}, nil
}

func (p *MockProvider) CompleteStream(ctx context.Context, req CompletionRequest) (<-chan StreamResponse, error) {
	streamChan := make(chan StreamResponse)

	go func() {
		defer close(streamChan)

		// Get the last user message
		var userMessage string
		for i := len(req.Messages) - 1; i >= 0; i-- {
			if req.Messages[i].Role == "user" {
				userMessage = req.Messages[i].Content
				break
			}
		}

		response := p.generateResponse(userMessage)
		words := strings.Split(response, " ")

		for i, word := range words {
			select {
			case <-ctx.Done():
				return
			default:
				content := word
				if i < len(words)-1 {
					content += " "
				}
				streamChan <- StreamResponse{Content: content}
				time.Sleep(time.Duration(20+rand.Intn(30)) * time.Millisecond)
			}
		}

		streamChan <- StreamResponse{Done: true}
	}()

	return streamChan, nil
}

func (p *MockProvider) generateResponse(userMessage string) string {
	lowerMsg := strings.ToLower(userMessage)

	if strings.Contains(lowerMsg, "deploy") || strings.Contains(lowerMsg, "deployment") {
		return fmt.Sprintf(`I can help you deploy your project! Here are your recent deployments:

**Recent Deployments:**
- my-app (production) - Last deployed 2 hours ago
- api-service (staging) - Last deployed 5 minutes ago  
- web-client (preview) - Last deployed 1 day ago

Would you like me to deploy a specific project, or would you like to see deployment logs?`)
	}

	if strings.Contains(lowerMsg, "log") || strings.Contains(lowerMsg, "build") {
		return fmt.Sprintf(`Here are the recent logs from your builds:

**Build #%d** - ✅ Success
%s
%s
%s
%s

**Build #%d** - ❌ Failed
%s
%s
`,
			2847,
			"✓ Dependencies installed (12s)",
			"✓ Build completed (45s)",
			"✓ Tests passed (23s)",
			"✓ Deployed to production (8s)",
			2846,
			"✗ Tests failed - 2 test suites failed",
			"Error: Database connection timeout")
	}

	if strings.Contains(lowerMsg, "environment") || strings.Contains(lowerMsg, "env") || strings.Contains(lowerMsg, "variable") {
		return fmt.Sprintf(`I can help you manage your environment variables. Here are the current variables for your active project:

**Production Environment:**
- DATABASE_URL: ******** (encrypted)
- API_KEY: ******** (encrypted)
- NODE_ENV: production

**Staging Environment:**
- DATABASE_URL: ******** (encrypted)
- API_KEY: test-key-123
- NODE_ENV: staging

Would you like to add a new variable or update an existing one?`)
	}

	if strings.Contains(lowerMsg, "scale") || strings.Contains(lowerMsg, "resource") {
		return fmt.Sprintf(`Here's the current resource usage and scaling options:

**Current Usage:**
- CPU: 45%% average
- Memory: 2.3GB / 4GB
- Storage: 12GB / 50GB

**Scaling Recommendations:**
Based on your traffic patterns, I recommend:
- Increase memory to 6GB during peak hours (9 AM - 5 PM)
- Enable auto-scaling for your API service

Would you like me to apply these changes?`)
	}

	if strings.Contains(lowerMsg, "help") || strings.Contains(lowerMsg, "hello") || strings.Contains(lowerMsg, "hi") {
		return fmt.Sprintf(`Hello! I'm Obtura AI, your DevOps assistant. I can help you with:

🚀 **Deployments** - Deploy to production, staging, or preview
📊 **Monitoring** - View logs, metrics, and alerts  
⚙️ **Configuration** - Manage environment variables and settings
📈 **Scaling** - Adjust resources and auto-scaling rules
🔧 **Troubleshooting** - Debug issues and analyze failures

What would you like help with today?`)
	}

	return fmt.Sprintf(`I understand you're asking about "%s". 

As your DevOps assistant, I can help you with:
- Deploying projects and managing releases
- Viewing build logs and troubleshooting failures
- Managing environment variables and secrets
- Scaling services and monitoring resources
- General DevOps tasks and best practices

Could you provide more details about what you'd like to accomplish?`, userMessage)
}
