package builder

import (
	"build-service/internal/security"
	"build-service/pkg"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/registry"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/archive"
)

type Builder struct {
	docker           *client.Client
	registryUsername string
	registryPassword string
	sandboxConfig    security.SandboxConfig
}

var defaultBuilder *Builder

func init() {
	var err error
	defaultBuilder, err = NewBuilder()
	if err != nil {
		log.Printf("⚠️  Warning: Failed to initialize default builder: %v", err)
		log.Println("⚠️  Docker operations will be attempted on first use")
		defaultBuilder = nil
	}
}

func NewBuilder() (*Builder, error) {
	var cli *client.Client
	var err error

	maxRetries := 10
	for i := 0; i < maxRetries; i++ {
		cli, err = client.NewClientWithOpts(
			client.FromEnv,
			client.WithAPIVersionNegotiation(),
		)
		if err == nil {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_, pingErr := cli.Ping(ctx)
			cancel()

			if pingErr == nil {
				break // Success!
			}
			err = pingErr
		}

		if i < maxRetries-1 {
			log.Printf("⏳ Waiting for Docker daemon (attempt %d/%d): %v", i+1, maxRetries, err)
			time.Sleep(2 * time.Second)
		}
	}

	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client after %d attempts: %w", maxRetries, err)
	}

	log.Println("✅ Successfully connected to Docker daemon")

	sandboxConfig := security.SandboxConfig{
		CPUQuota:     200000,
		MemoryLimit:  8589934592,
		PidsLimit:    512,
		NoNewPrivs:   true,
		ReadOnlyRoot: false,
		NetworkMode:  "bridge",
	}

	return &Builder{
		docker:           cli,
		registryUsername: pkg.GetEnv("REGISTRY_USERNAME", ""),
		registryPassword: pkg.GetEnv("REGISTRY_PASSWORD", ""),
		sandboxConfig:    sandboxConfig,
	}, nil
}

func BuildImage(ctx context.Context, projectPath string, imageTag string) (io.ReadCloser, error) {
	if defaultBuilder == nil {
		var err error
		defaultBuilder, err = NewBuilder()
		if err != nil {
			return nil, fmt.Errorf("failed to initialize Docker builder: %w", err)
		}
	}
	return defaultBuilder.BuildImage(ctx, projectPath, imageTag)
}

func (b *Builder) BuildImageWithSandbox(ctx context.Context, projectPath string, imageTag string, sandboxConfig security.SandboxConfig) (io.ReadCloser, error) {
	tar, err := archive.TarWithOptions(projectPath, &archive.TarOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create tar archive: %w", err)
	}

	resp, err := b.docker.ImageBuild(ctx, tar, types.ImageBuildOptions{
		Tags:        []string{imageTag},
		Dockerfile:  "Dockerfile",
		Remove:      true,
		NoCache:     false,
		Platform:    "linux/amd64",
		Memory:      sandboxConfig.MemoryLimit,
		MemorySwap:  sandboxConfig.MemoryLimit,
		CPUQuota:    sandboxConfig.CPUQuota,
		CPUPeriod:   100000,
		NetworkMode: sandboxConfig.NetworkMode,
	})

	if err != nil {
		return nil, fmt.Errorf("Docker build failed: %w", err)
	}

	return resp.Body, nil
}

func PushImage(ctx context.Context, imageTag string) error {
	if defaultBuilder == nil {
		var err error
		defaultBuilder, err = NewBuilder()
		if err != nil {
			return fmt.Errorf("failed to initialize Docker builder: %w", err)
		}
	}
	return defaultBuilder.PushImage(ctx, imageTag)
}

func (b *Builder) BuildImage(ctx context.Context, projectPath string, imageTag string) (io.ReadCloser, error) {
	log.Printf("📦 Creating tar archive from: %s", projectPath)

	tar, err := archive.TarWithOptions(projectPath, &archive.TarOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create tar archive: %w", err)
	}

	log.Printf("🔨 Building Docker image: %s", imageTag)

	resp, err := b.docker.ImageBuild(ctx, tar, types.ImageBuildOptions{
		Tags:       []string{imageTag},
		Dockerfile: "Dockerfile",
		Remove:     true,
		NoCache:    false,
		Platform:   "linux/amd64",
	})
	if err != nil {
		return nil, fmt.Errorf("Docker build failed: %w", err)
	}

	log.Printf("✅ Docker build initiated for: %s", imageTag)
	return resp.Body, nil
}

func (b *Builder) PushImage(ctx context.Context, imageTag string) error {
	log.Printf("📤 Pushing Docker image: %s", imageTag)

	authConfig := registry.AuthConfig{
		Username: b.registryUsername, // You'll need to add these fields to your Builder struct
		Password: b.registryPassword,
	}

	encodedAuth, err := encodeAuthConfig(authConfig)
	if err != nil {
		return fmt.Errorf("failed to encode auth config: %w", err)
	}

	resp, err := b.docker.ImagePush(ctx, imageTag, image.PushOptions{
		RegistryAuth: encodedAuth,
	})
	if err != nil {
		return fmt.Errorf("failed to push image: %w", err)
	}
	defer resp.Close()

	_, err = io.Copy(io.Discard, resp)
	if err != nil {
		return fmt.Errorf("error during image push: %w", err)
	}

	log.Printf("✅ Successfully pushed: %s", imageTag)
	return nil
}

func encodeAuthConfig(authConfig registry.AuthConfig) (string, error) {
	encodedJSON, err := json.Marshal(authConfig)
	if err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(encodedJSON), nil
}

// Close closes the Docker client connection
func (b *Builder) Close() error {
	if b.docker != nil {
		return b.docker.Close()
	}
	return nil
}
