package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinIOStorage struct {
	client *minio.Client
	bucket string
}

type BuildArtifact struct {
	ProjectID string
	BuildID   string
	ImageTag  string
	Manifest  []byte
	CreatedAt time.Time
}

func NewMinIOStorage(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*MinIOStorage, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create MinIO client: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket existence: %w", err)
	}

	if !exists {
		err = client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to create bucket: %w", err)
		}
		log.Printf("✅ Created bucket: %s", bucket)
	}

	return &MinIOStorage{
		client: client,
		bucket: bucket,
	}, nil
}

func (s *MinIOStorage) StoreBuildArtifact(ctx context.Context, artifact *BuildArtifact) error {
	objectName := fmt.Sprintf("builds/%s/%s/manifest.json", artifact.ProjectID, artifact.BuildID)

	_, err := s.client.PutObject(ctx, s.bucket, objectName,
		bytes.NewReader(artifact.Manifest),
		int64(len(artifact.Manifest)),
		minio.PutObjectOptions{
			ContentType: "application/json",
			UserMetadata: map[string]string{
				"project-id": artifact.ProjectID,
				"build-id":   artifact.BuildID,
				"image-tag":  artifact.ImageTag,
				"created-at": artifact.CreatedAt.Format(time.RFC3339),
			},
		})

	if err != nil {
		return fmt.Errorf("failed to store build artifact: %w", err)
	}

	log.Printf("✅ Stored build artifact: %s", objectName)
	return nil
}

func (s *MinIOStorage) GetBuildArtifact(ctx context.Context, projectID, buildID string) (*BuildArtifact, error) {
	objectName := fmt.Sprintf("builds/%s/%s/manifest.json", projectID, buildID)

	obj, err := s.client.GetObject(ctx, s.bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get build artifact: %w", err)
	}
	defer obj.Close()

	manifest, err := io.ReadAll(obj)
	if err != nil {
		return nil, fmt.Errorf("failed to read manifest: %w", err)
	}

	stat, err := obj.Stat()
	if err != nil {
		return nil, fmt.Errorf("failed to get object stats: %w", err)
	}

	createdAt, _ := time.Parse(time.RFC3339, stat.UserMetadata["created-at"])

	return &BuildArtifact{
		ProjectID: stat.UserMetadata["project-id"],
		BuildID:   stat.UserMetadata["build-id"],
		ImageTag:  stat.UserMetadata["image-tag"],
		Manifest:  manifest,
		CreatedAt: createdAt,
	}, nil
}

func (s *MinIOStorage) ListBuildArtifacts(ctx context.Context, projectID string) ([]*BuildArtifact, error) {
	prefix := fmt.Sprintf("builds/%s/", projectID)

	objects := s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	})

	var artifacts []*BuildArtifact
	for obj := range objects {
		if obj.Err != nil {
			return nil, fmt.Errorf("failed to list objects: %w", obj.Err)
		}

		if obj.Size == 0 {
			continue
		}

		artifact, err := s.GetBuildArtifact(ctx, projectID, extractBuildID(obj.Key))
		if err != nil {
			log.Printf("Warning: failed to get artifact for %s: %v", obj.Key, err)
			continue
		}

		artifacts = append(artifacts, artifact)
	}

	return artifacts, nil
}

func (s *MinIOStorage) DeleteBuildArtifact(ctx context.Context, projectID, buildID string) error {
	objectName := fmt.Sprintf("builds/%s/%s/manifest.json", projectID, buildID)

	err := s.client.RemoveObject(ctx, s.bucket, objectName, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete build artifact: %w", err)
	}

	log.Printf("✅ Deleted build artifact: %s", objectName)
	return nil
}

func (s *MinIOStorage) Close() error {
	return nil
}

func extractBuildID(objectKey string) string {
	parts := strings.Split(objectKey, "/")
	if len(parts) >= 4 {
		return parts[2]
	}
	return ""
}
