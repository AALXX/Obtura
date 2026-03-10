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

type GeminiProvider struct {
	apiKey string
	client *http.Client
	model  string
}

func NewGeminiProvider(apiKey string) *GeminiProvider {
	return NewGeminiProviderWithModel(apiKey, "")
}

func NewGeminiProviderWithModel(apiKey, model string) *GeminiProvider {
	if model == "" {
		model = "gemini-2.5-flash-preview"
	}
	return &GeminiProvider{
		apiKey: apiKey,
		client: &http.Client{},
		model:  model,
	}
}

func (p *GeminiProvider) Name() string {
	return "gemini"
}

func (p *GeminiProvider) IsAvailable() bool {
	return p.apiKey != ""
}

func (p *GeminiProvider) Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error) {
	model := p.model
	if req.Model != "" {
		model = req.Model
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, p.apiKey)

	// Separate system instructions from conversation messages
	var systemInstruction string
	var contents []map[string]interface{}

	for _, msg := range req.Messages {
		if msg.Role == "system" {
			// Gemini uses systemInstruction for system prompts
			if systemInstruction != "" {
				systemInstruction += "\n\n"
			}
			systemInstruction += msg.Content
		} else {
			// Map OpenAI-style roles to Gemini roles
			role := msg.Role
			if role == "assistant" {
				role = "model"
			} else if role == "user" {
				role = "user"
			}
			contents = append(contents, map[string]interface{}{
				"role": role,
				"parts": []map[string]string{
					{"text": msg.Content},
				},
			})
		}
	}

	body := map[string]interface{}{
		"contents": contents,
		"generationConfig": map[string]interface{}{
			"maxOutputTokens": req.MaxTokens,
			"temperature":     req.Temperature,
		},
	}

	if systemInstruction != "" {
		body["systemInstruction"] = map[string]interface{}{
			"parts": []map[string]string{
				{"text": systemInstruction},
			},
		}
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

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Gemini API error: %s - %s", resp.Status, string(body))
	}

	var result struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
			FinishReason string `json:"finishReason"`
		} `json:"candidates"`
		UsageMetadata struct {
			PromptTokenCount     int `json:"promptTokenCount"`
			CandidatesTokenCount int `json:"candidatesTokenCount"`
		} `json:"usageMetadata"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("no completion returned from Gemini")
	}

	return &CompletionResponse{
		Content:      result.Candidates[0].Content.Parts[0].Text,
		FinishReason: result.Candidates[0].FinishReason,
		InputTokens:  result.UsageMetadata.PromptTokenCount,
		OutputTokens: result.UsageMetadata.CandidatesTokenCount,
	}, nil
}

func (p *GeminiProvider) CompleteStream(ctx context.Context, req CompletionRequest) (<-chan StreamResponse, error) {
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
