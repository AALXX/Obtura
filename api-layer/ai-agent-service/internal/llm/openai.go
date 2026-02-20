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

type OpenAIProvider struct {
	apiKey string
	client *http.Client
	model  string
}

func NewOpenAIProvider(apiKey string) *OpenAIProvider {
	return NewOpenAIProviderWithModel(apiKey, "")
}

func NewOpenAIProviderWithModel(apiKey, model string) *OpenAIProvider {
	if model == "" {
		model = "gpt-4o"
	}
	return &OpenAIProvider{
		apiKey: apiKey,
		client: &http.Client{},
		model:  model,
	}
}

func (p *OpenAIProvider) Name() string {
	return "openai"
}

func (p *OpenAIProvider) IsAvailable() bool {
	return p.apiKey != ""
}

func (p *OpenAIProvider) Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error) {
	url := "https://api.openai.com/v1/chat/completions"

	messages := make([]map[string]string, len(req.Messages))
	for i, msg := range req.Messages {
		messages[i] = map[string]string{
			"role":    msg.Role,
			"content": msg.Content,
		}
	}

	model := p.model
	if req.Model != "" {
		model = req.Model
	}

	body := map[string]interface{}{
		"model":       model,
		"messages":    messages,
		"max_tokens":  req.MaxTokens,
		"temperature": req.Temperature,
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
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)

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
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("no completion returned")
	}

	return &CompletionResponse{
		Content:      result.Choices[0].Message.Content,
		FinishReason: result.Choices[0].FinishReason,
	}, nil
}

func (p *OpenAIProvider) CompleteStream(ctx context.Context, req CompletionRequest) (<-chan StreamResponse, error) {
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
