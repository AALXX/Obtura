package builder

import (
	"build-service/pkg"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"

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
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	ctx := context.Background()
	_, err = cli.Ping(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot connect to Docker daemon: %w (is Docker running and socket mounted?)", err)
	}
	log.Println("✅ Successfully connected to Docker daemon")

	return &Builder{
		docker:           cli,
		registryUsername: pkg.GetEnv("REGISTRY_USERNAME", ""),
		registryPassword: pkg.GetEnv("REGISTRY_PASSWORD", ""),
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
