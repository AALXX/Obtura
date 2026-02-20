package llm

import (
	"context"
	"fmt"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type CompletionRequest struct {
	Messages    []Message
	MaxTokens   int
	Temperature float64
	Stream      bool
	Model       string
}

type CompletionResponse struct {
	Content      string
	FinishReason string
	Error        error
}

type StreamResponse struct {
	Content string
	Done    bool
	Error   error
}

type Provider interface {
	Name() string
	Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error)
	CompleteStream(ctx context.Context, req CompletionRequest) (<-chan StreamResponse, error)
	IsAvailable() bool
}

type ProviderType string

const (
	ProviderOpenAI    ProviderType = "openai"
	ProviderClaude    ProviderType = "claude"
	ProviderAnthropic ProviderType = "anthropic"
	ProviderGemini    ProviderType = "gemini"
	ProviderFallback  ProviderType = "fallback"
	ProviderMock      ProviderType = "mock"
)

type Config struct {
	OpenAIAPIKey    string
	ClaudeAPIKey    string
	FallbackAPIKey  string
	DefaultProvider ProviderType
}

type Manager struct {
	providers map[ProviderType]Provider
	config    *Config
}

func NewManager(config *Config) *Manager {
	providers := make(map[ProviderType]Provider)

	if config.OpenAIAPIKey != "" {
		providers[ProviderOpenAI] = NewOpenAIProviderWithModel(config.OpenAIAPIKey, "")
	}

	if config.ClaudeAPIKey != "" {
		providers[ProviderClaude] = NewClaudeProviderWithModel(config.ClaudeAPIKey, "")
	}

	if config.FallbackAPIKey != "" {
		providers[ProviderFallback] = NewClaudeProviderWithModel(config.FallbackAPIKey, "")
	}

	providers[ProviderMock] = NewMockProvider()

	return &Manager{
		providers: providers,
		config:    config,
	}
}

func NewProviderFromConfig(providerType ProviderType, apiKey, model string) Provider {
	switch providerType {
	case ProviderOpenAI:
		return NewOpenAIProviderWithModel(apiKey, model)
	case ProviderClaude, ProviderAnthropic:
		return NewClaudeProviderWithModel(apiKey, model)
	case ProviderGemini:
		return NewMockProvider()
	default:
		return NewMockProvider()
	}
}

func (m *Manager) GetProvider(providerType ProviderType) (Provider, error) {
	if provider, ok := m.providers[providerType]; ok && provider.IsAvailable() {
		return provider, nil
	}

	fallbackOrder := []ProviderType{
		m.config.DefaultProvider,
		ProviderClaude,
		ProviderOpenAI,
		ProviderMock,
	}

	for _, pt := range fallbackOrder {
		if provider, ok := m.providers[pt]; ok && provider.IsAvailable() {
			return provider, nil
		}
	}

	return nil, fmt.Errorf("no LLM provider available")
}

func (m *Manager) Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error) {
	provider, err := m.GetProvider(m.config.DefaultProvider)
	if err != nil {
		return nil, err
	}

	return provider.Complete(ctx, req)
}

func (m *Manager) CompleteStream(ctx context.Context, req CompletionRequest) (<-chan StreamResponse, error) {
	provider, err := m.GetProvider(m.config.DefaultProvider)
	if err != nil {
		return nil, err
	}

	return provider.CompleteStream(ctx, req)
}

func (m *Manager) ListAvailableProviders() []ProviderType {
	var available []ProviderType
	for pt, provider := range m.providers {
		if provider.IsAvailable() {
			available = append(available, pt)
		}
	}
	return available
}

func (m *Manager) AddProvider(providerType ProviderType, provider Provider) {
	m.providers[providerType] = provider
}
