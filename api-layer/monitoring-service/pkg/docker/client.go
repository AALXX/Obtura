package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"monitoring-service/pkg/config"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type Client struct {
	cli *client.Client
}

type ContainerStats struct {
	State       string
	CPUStats    CPUStats
	PreCPUStats CPUStats
	MemoryStats MemoryStats
	Networks    map[string]NetworkStats
	SystemUsage uint64
}

type CPUStats struct {
	CPUUsage struct {
		TotalUsage  uint64
		PercpuUsage []uint64
	}
	SystemUsage uint64
}

type MemoryStats struct {
	Usage    int64
	MaxUsage int64
	Limit    int64
}

type NetworkStats struct {
	RxBytes int64
	TxBytes int64
}

func NewClient(cfg *config.Config) (*Client, error) {
	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, err
	}

	return &Client{cli: cli}, nil
}

// GetContainerStats retrieves container statistics
func (c *Client) GetContainerStats(ctx context.Context, containerID string) (*ContainerStats, error) {
	stats, err := c.cli.ContainerStats(ctx, containerID, false)
	if err != nil {
		return nil, err
	}
	defer stats.Body.Close()

	var v container.StatsResponse
	if err := json.NewDecoder(stats.Body).Decode(&v); err != nil {
		return nil, err
	}

	// Get container inspect info
	inspect, err := c.cli.ContainerInspect(ctx, containerID)
	if err != nil {
		return nil, err
	}

	containerStats := &ContainerStats{
		State: inspect.State.Status,
		CPUStats: CPUStats{
			CPUUsage: struct {
				TotalUsage  uint64
				PercpuUsage []uint64
			}{
				TotalUsage:  v.CPUStats.CPUUsage.TotalUsage,
				PercpuUsage: v.CPUStats.CPUUsage.PercpuUsage,
			},
			SystemUsage: v.CPUStats.SystemUsage,
		},
		PreCPUStats: CPUStats{
			CPUUsage: struct {
				TotalUsage  uint64
				PercpuUsage []uint64
			}{
				TotalUsage:  v.PreCPUStats.CPUUsage.TotalUsage,
				PercpuUsage: v.PreCPUStats.CPUUsage.PercpuUsage,
			},
			SystemUsage: v.PreCPUStats.SystemUsage,
		},
		MemoryStats: MemoryStats{
			Usage:    int64(v.MemoryStats.Usage),
			MaxUsage: int64(v.MemoryStats.MaxUsage),
			Limit:    int64(v.MemoryStats.Limit),
		},
		Networks: make(map[string]NetworkStats),
	}

	for name, net := range v.Networks {
		containerStats.Networks[name] = NetworkStats{
			RxBytes: int64(net.RxBytes),
			TxBytes: int64(net.TxBytes),
		}
	}

	return containerStats, nil
}

// GetContainerLogs retrieves container logs
func (c *Client) GetContainerLogs(ctx context.Context, containerID string, lines int, since *time.Time) ([]string, error) {
	options := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       fmt.Sprintf("%d", lines),
	}

	if since != nil {
		options.Since = fmt.Sprintf("%d", since.Unix())
	}

	logs, err := c.cli.ContainerLogs(ctx, containerID, options)
	if err != nil {
		return nil, err
	}
	defer logs.Close()

	// Parse logs
	var logLines []string
	buf := make([]byte, 4096)
	for {
		n, err := logs.Read(buf)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}

		// Docker log format has 8-byte header, skip it
		if n > 8 {
			logLines = append(logLines, string(buf[8:n]))
		}
	}

	return logLines, nil
}

// ListContainers lists all containers
func (c *Client) ListContainers(ctx context.Context) ([]types.Container, error) {
	return c.cli.ContainerList(ctx, container.ListOptions{All: true})
}

// InspectContainer inspects a container
func (c *Client) InspectContainer(ctx context.Context, containerID string) (types.ContainerJSON, error) {
	return c.cli.ContainerInspect(ctx, containerID)
}

func decodeStats(r io.Reader, v interface{}) error {
	return json.NewDecoder(r).Decode(v)
}
