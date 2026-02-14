package platformlog

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// HTTPTransport sends logs via HTTP POST to logging service
type HTTPTransport struct {
	endpoint   string
	httpClient *http.Client
	apiKey     string
}

// NewHTTPTransport creates an HTTP transport
func NewHTTPTransport(endpoint, apiKey string) *HTTPTransport {
	return &HTTPTransport{
		endpoint: endpoint,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		apiKey: apiKey,
	}
}

// Send publishes log events via HTTP
func (h *HTTPTransport) Send(ctx context.Context, events []LogEvent) error {
	if len(events) == 0 {
		return nil
	}

	// Wrap events in the expected format for monitoring service
	requestBody := map[string]interface{}{
		"events": events,
	}

	body, err := json.Marshal(requestBody)
	if err != nil {
		return fmt.Errorf("failed to marshal log events: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", h.endpoint+"/api/platform-logs/ingest", bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if h.apiKey != "" {
		req.Header.Set("X-API-Key", h.apiKey)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send logs: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		// Read response body for more detailed error information
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("logging service returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// Close is a no-op for HTTP transport
func (h *HTTPTransport) Close() error {
	return nil
}

// ConsoleTransport logs to stdout/stderr for development
type ConsoleTransport struct{}

// NewConsoleTransport creates a console transport
func NewConsoleTransport() *ConsoleTransport {
	return &ConsoleTransport{}
}

// Send prints log events to console
func (c *ConsoleTransport) Send(ctx context.Context, events []LogEvent) error {
	for _, event := range events {
		data, err := json.Marshal(event)
		if err != nil {
			fmt.Printf("[PLATFORM-LOG] ERROR marshaling: %v\n", err)
			continue
		}
		fmt.Printf("[PLATFORM-LOG] %s\n", string(data))
	}
	return nil
}

// Close is a no-op for console transport
func (c *ConsoleTransport) Close() error {
	return nil
}
