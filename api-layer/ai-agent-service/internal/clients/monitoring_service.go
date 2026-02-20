package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type MonitoringServiceClient struct {
	baseURL    string
	httpClient *http.Client
}

type DeploymentMetrics struct {
	DeploymentID string            `json:"deploymentId"`
	ProjectID    string            `json:"projectId"`
	Environment  string            `json:"environment"`
	CPUUsage     float64           `json:"cpuUsage"`
	MemoryUsage  float64           `json:"memoryUsage"`
	RequestRate  float64           `json:"requestRate"`
	ErrorRate    float64           `json:"errorRate"`
	P50Latency   float64           `json:"p50Latency"`
	P95Latency   float64           `json:"p95Latency"`
	P99Latency   float64           `json:"p99Latency"`
	Timestamp    time.Time         `json:"timestamp"`
	Labels       map[string]string `json:"labels"`
}

type Alert struct {
	ID         string     `json:"id"`
	ProjectID  string     `json:"projectId"`
	Type       string     `json:"type"`
	Severity   string     `json:"severity"`
	Message    string     `json:"message"`
	Deployment string     `json:"deployment"`
	Metric     string     `json:"metric"`
	Value      float64    `json:"value"`
	Threshold  float64    `json:"threshold"`
	Status     string     `json:"status"`
	CreatedAt  time.Time  `json:"createdAt"`
	ResolvedAt *time.Time `json:"resolvedAt"`
}

func NewMonitoringServiceClient(baseURL string) *MonitoringServiceClient {
	return &MonitoringServiceClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *MonitoringServiceClient) GetDeploymentMetrics(ctx context.Context, deploymentID string, duration time.Duration) ([]DeploymentMetrics, error) {
	url := fmt.Sprintf("%s/api/deployments/%s/metrics?duration=%s", c.baseURL, deploymentID, duration.String())

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("monitoring service error: status %d", resp.StatusCode)
	}

	var metrics struct {
		Metrics []DeploymentMetrics `json:"metrics"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&metrics); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return metrics.Metrics, nil
}

func (c *MonitoringServiceClient) GetAlerts(ctx context.Context, projectID string, severity string, limit int) ([]Alert, error) {
	url := fmt.Sprintf("%s/api/projects/%s/alerts?severity=%s&limit=%d", c.baseURL, projectID, severity, limit)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("monitoring service error: status %d", resp.StatusCode)
	}

	var alerts struct {
		Alerts []Alert `json:"alerts"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&alerts); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return alerts.Alerts, nil
}

func (c *MonitoringServiceClient) GetAnomalies(ctx context.Context, deploymentID string, timeRange time.Duration) ([]map[string]interface{}, error) {
	url := fmt.Sprintf("%s/api/deployments/%s/anomalies?duration=%s", c.baseURL, deploymentID, timeRange.String())

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("monitoring service error: status %d", resp.StatusCode)
	}

	var anomalies struct {
		Anomalies []map[string]interface{} `json:"anomalies"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&anomalies); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return anomalies.Anomalies, nil
}
