package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type DeployServiceClient struct {
	baseURL    string
	httpClient *http.Client
}

type DeploymentInfo struct {
	ID          string    `json:"id"`
	ProjectID   string    `json:"projectId"`
	ProjectSlug string    `json:"projectSlug"`
	Environment string    `json:"environment"`
	Status      string    `json:"status"`
	BuildID     string    `json:"buildId"`
	ImageTag    string    `json:"imageTag"`
	Domain      string    `json:"domain"`
	Subdomain   string    `json:"subdomain"`
	ContainerID string    `json:"containerId"`
	StartedAt   time.Time `json:"startedAt"`
	EndedAt     time.Time `json:"endedAt"`
	CreatedAt   time.Time `json:"createdAt"`
}

func NewDeployServiceClient(baseURL string) *DeployServiceClient {
	return &DeployServiceClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *DeployServiceClient) GetDeployment(ctx context.Context, deploymentID string) (*DeploymentInfo, error) {
	url := fmt.Sprintf("%s/api/deployments/%s", c.baseURL, deploymentID)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("deployment not found: %s", deploymentID)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("deploy service error: status %d", resp.StatusCode)
	}

	var deployment DeploymentInfo
	if err := json.NewDecoder(resp.Body).Decode(&deployment); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &deployment, nil
}

func (c *DeployServiceClient) GetProjectDeployments(ctx context.Context, projectID string, environment string, limit int) ([]DeploymentInfo, error) {
	url := fmt.Sprintf("%s/api/projects/%s/deployments?environment=%s&limit=%d", c.baseURL, projectID, environment, limit)

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
		return nil, fmt.Errorf("deploy service error: status %d", resp.StatusCode)
	}

	var deployments struct {
		Deployments []DeploymentInfo `json:"deployments"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&deployments); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return deployments.Deployments, nil
}
