package clients

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// MinioClient wraps the MinIO client for build log operations
type MinioClient struct {
	client   *minio.Client
	bucket   string
	endpoint string
	useSSL   bool
}

// BuildLogMetadata contains information about a stored build log
type BuildLogMetadata struct {
	BuildID   string    `json:"buildId"`
	ProjectID string    `json:"projectId"`
	Branch    string    `json:"branch"`
	Commit    string    `json:"commit"`
	CreatedAt time.Time `json:"createdAt"`
	Size      int64     `json:"size"`
}

// NewMinioClient creates a new MinIO client for fetching build logs
func NewMinioClient(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*MinioClient, error) {
	minioClient, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create MinIO client: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	exists, err := minioClient.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("bucket %s does not exist", bucket)
	}

	log.Printf("✅ Connected to MinIO at %s, bucket: %s", endpoint, bucket)

	return &MinioClient{
		client:   minioClient,
		bucket:   bucket,
		endpoint: endpoint,
		useSSL:   useSSL,
	}, nil
}

// GetBuildLog fetches build logs from MinIO
func (m *MinioClient) GetBuildLog(ctx context.Context, projectID, buildID string) (string, error) {
	objectName := fmt.Sprintf("builds/%s/%s.log", projectID, buildID)

	obj, err := m.client.GetObject(ctx, m.bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to get object %s: %w", objectName, err)
	}
	defer obj.Close()

	var buf bytes.Buffer
	if _, err := io.Copy(&buf, obj); err != nil {
		return "", fmt.Errorf("failed to read log content: %w", err)
	}

	return buf.String(), nil
}

// GetBuildLogWithSizeLimit fetches build logs with a maximum size limit (last N bytes)
func (m *MinioClient) GetBuildLogWithSizeLimit(ctx context.Context, projectID, buildID string, maxBytes int64) (string, error) {
	objectName := fmt.Sprintf("builds/%s/%s.log", projectID, buildID)

	// Get object info first to check size
	objInfo, err := m.client.StatObject(ctx, m.bucket, objectName, minio.StatObjectOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to stat object %s: %w", objectName, err)
	}

	if objInfo.Size == 0 {
		return "", fmt.Errorf("build log is empty")
	}

	// Calculate offset to read last maxBytes
	offset := int64(0)
	if objInfo.Size > maxBytes {
		offset = objInfo.Size - maxBytes
	}

	obj, err := m.client.GetObject(ctx, m.bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to get object %s: %w", objectName, err)
	}
	defer obj.Close()

	// Seek to offset if needed
	if offset > 0 {
		_, err = obj.Seek(offset, 0)
		if err != nil {
			return "", fmt.Errorf("failed to seek in object: %w", err)
		}
	}

	// Read up to maxBytes
	limitReader := io.LimitReader(obj, maxBytes)
	var buf bytes.Buffer
	if _, err := io.Copy(&buf, limitReader); err != nil {
		return "", fmt.Errorf("failed to read log content: %w", err)
	}

	content := buf.String()
	if objInfo.Size > maxBytes {
		content = fmt.Sprintf("[LOG TRUNCATED - Showing last %s of %s total]\n\n%s",
			formatBytes(maxBytes), formatBytes(objInfo.Size), content)
	}

	return content, nil
}

// GetBuildLogTail fetches the last N lines of a build log
func (m *MinioClient) GetBuildLogTail(ctx context.Context, projectID, buildID string, maxLines int) (string, error) {
	// First get the full log (limited size), then extract last N lines
	content, err := m.GetBuildLogWithSizeLimit(ctx, projectID, buildID, 1024*1024) // 1MB limit
	if err != nil {
		return "", err
	}

	return extractLastNLines(content, maxLines), nil
}

// BuildLogExists checks if a build log exists in MinIO
func (m *MinioClient) BuildLogExists(ctx context.Context, projectID, buildID string) (bool, error) {
	objectName := fmt.Sprintf("builds/%s/%s.log", projectID, buildID)
	_, err := m.client.StatObject(ctx, m.bucket, objectName, minio.StatObjectOptions{})
	if err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return false, nil
		}
		return false, fmt.Errorf("failed to check object: %w", err)
	}
	return true, nil
}

// Close closes the MinIO client connection
func (m *MinioClient) Close() error {
	return nil
}

// formatBytes formats bytes to human readable string
func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// extractLastNLines extracts the last N lines from a string
func extractLastNLines(content string, n int) string {
	if n <= 0 {
		return content
	}

	lines := splitLines(content)
	if len(lines) <= n {
		return content
	}

	start := len(lines) - n
	result := ""
	for i := start; i < len(lines); i++ {
		if i > start {
			result += "\n"
		}
		result += lines[i]
	}
	return result
}

// splitLines splits a string into lines
func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}
