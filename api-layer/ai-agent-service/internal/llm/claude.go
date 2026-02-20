package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type ClaudeProvider struct {
	apiKey string
	client *http.Client
	model  string
}

func NewClaudeProvider(apiKey string) *ClaudeProvider {
	return NewClaudeProviderWithModel(apiKey, "")
}

func NewClaudeProviderWithModel(apiKey, model string) *ClaudeProvider {
	if model == "" {
		model = "claude-sonnet-4-20250514"
	}
	return &ClaudeProvider{
		apiKey: apiKey,
		client: &http.Client{},
		model:  model,
	}
}

func (p *ClaudeProvider) Name() string {
	return "claude"
}

func (p *ClaudeProvider) IsAvailable() bool {
	return p.apiKey != ""
}

func (p *ClaudeProvider) Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error) {
	url := "https://api.anthropic.com/v1/messages"

	var system string
	var messages []map[string]string

	for _, msg := range req.Messages {
		if msg.Role == "system" {
			system = msg.Content
		} else {
			role := msg.Role
			if role == "assistant" {
				role = "assistant"
			}
			messages = append(messages, map[string]string{
				"role":    role,
				"content": msg.Content,
			})
		}
	}

	model := p.model
	if req.Model != "" {
		model = req.Model
	}

	body := map[string]interface{}{
		"model":      model,
		"max_tokens": req.MaxTokens,
		"messages":   messages,
	}

	if system != "" {
		body["system"] = system
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error: %s - %s", resp.Status, string(body))
	}

	var result struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		StopReason string `json:"stop_reason"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(result.Content) == 0 {
		return nil, fmt.Errorf("no completion returned")
	}

	return &CompletionResponse{
		Content:      result.Content[0].Text,
		FinishReason: result.StopReason,
	}, nil
}

func (p *ClaudeProvider) CompleteStream(ctx context.Context, req CompletionRequest) (<-chan StreamResponse, error) {
	streamChan := make(chan StreamResponse)

	go func() {
		defer close(streamChan)

		resp, err := p.Complete(ctx, req)
		if err != nil {
			streamChan <- StreamResponse{Error: err}
			return
		}

		words := strings.Split(resp.Content, " ")
		for i, word := range words {
			content := word
			if i < len(words)-1 {
				content += " "
			}
			streamChan <- StreamResponse{Content: content}
		}

		streamChan <- StreamResponse{Done: true}
	}()

	return streamChan, nil
}
