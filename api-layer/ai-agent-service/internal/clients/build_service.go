package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type BuildServiceClient struct {
	baseURL    string
	httpClient *http.Client
}

type BuildInfo struct {
	ID          string    `json:"id"`
	ProjectID   string    `json:"projectId"`
	ProjectName string    `json:"projectName"`
	CommitHash  string    `json:"commitHash"`
	Branch      string    `json:"branch"`
	Status      string    `json:"status"`
	Framework   string    `json:"framework"`
	BuildTime   int       `json:"buildTime"`
	ErrorMsg    string    `json:"errorMessage"`
	CreatedAt   time.Time `json:"createdAt"`
	StartedAt   time.Time `json:"startedAt"`
	EndedAt     time.Time `json:"endedAt"`
}

func NewBuildServiceClient(baseURL string) *BuildServiceClient {
	return &BuildServiceClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *BuildServiceClient) GetBuild(ctx context.Context, buildID string) (*BuildInfo, error) {
	url := fmt.Sprintf("%s/api/builds/%s", c.baseURL, buildID)

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
		return nil, fmt.Errorf("build not found: %s", buildID)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("build service error: status %d", resp.StatusCode)
	}

	var build BuildInfo
	if err := json.NewDecoder(resp.Body).Decode(&build); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &build, nil
}

func (c *BuildServiceClient) GetProjectBuilds(ctx context.Context, projectID string, limit int) ([]BuildInfo, error) {
	url := fmt.Sprintf("%s/api/projects/%s/builds?limit=%d", c.baseURL, projectID, limit)

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
		return nil, fmt.Errorf("build service error: status %d", resp.StatusCode)
	}

	var builds struct {
		Builds []BuildInfo `json:"builds"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&builds); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return builds.Builds, nil
}
