package db

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"monitoring-service/pkg/config"
	"monitoring-service/pkg/models"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const (
	LogsBucketName    = "monitoring-logs"
	LogRetentionDB    = 24 * time.Hour      // Keep recent logs in DB
	LogRetentionMinIO = 90 * 24 * time.Hour // Keep logs in MinIO for 90 days
	MaxLogsPerBatch   = 1000
	CompressionLevel  = gzip.BestSpeed
)

type MinioClient struct {
	*minio.Client
}

func NewMinioClient(cfg *config.Config) (*MinioClient, error) {
	client, err := minio.New(cfg.MinioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
		Secure: cfg.MinioUseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create MinIO client: %w", err)
	}

	// Verify connection with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if _, err := client.ListBuckets(ctx); err != nil {
		return nil, fmt.Errorf("failed to list MinIO buckets: %w", err)
	}

	// Ensure logs bucket exists
	if err := client.MakeBucket(ctx, LogsBucketName, minio.MakeBucketOptions{}); err != nil {
		// Bucket might already exist, which is fine
		exists, errBucketExists := client.BucketExists(ctx, LogsBucketName)
		if errBucketExists != nil || !exists {
			return nil, fmt.Errorf("failed to create logs bucket: %w", err)
		}
	}

	return &MinioClient{client}, nil
}

func (m *MinioClient) HealthCheck(ctx context.Context) error {
	_, err := m.ListBuckets(ctx)
	return err
}

func (m *MinioClient) Close() {
	// MinIO client doesn't require explicit close
}

// LogStorage handles log storage in MinIO
type LogStorage struct {
	client *minio.Client
}

func NewLogStorage(client *minio.Client) *LogStorage {
	return &LogStorage{client: client}
}

// StoreLogs stores compressed logs to MinIO
func (ls *LogStorage) StoreLogs(ctx context.Context, deploymentID string, date time.Time, logs []models.LogEntry) error {
	if len(logs) == 0 {
		return nil
	}

	// Format: deployment-logs/{deployment_id}/{year}/{month}/{day}.json.gz
	objectName := fmt.Sprintf("deployment-logs/%s/%s.json.gz",
		deploymentID,
		date.Format("2006/01/02"),
	)

	// Compress logs
	var buf bytes.Buffer
	gzipWriter, err := gzip.NewWriterLevel(&buf, CompressionLevel)
	if err != nil {
		return fmt.Errorf("failed to create gzip writer: %w", err)
	}

	// Write logs as JSON lines
	for _, log := range logs {
		// Build log entry with metadata
		logEntry := map[string]interface{}{
			"timestamp":    log.Timestamp.Format(time.RFC3339),
			"level":        log.Level,
			"message":      log.Message,
			"source":       log.Source,
			"container_id": log.ContainerID,
		}

		// Add metadata if present
		if len(log.Metadata) > 0 {
			logEntry["metadata"] = log.Metadata
		}

		// Marshal to JSON
		jsonLine, err := json.Marshal(logEntry)
		if err != nil {
			gzipWriter.Close()
			return fmt.Errorf("failed to marshal log entry: %w", err)
		}

		if _, err := gzipWriter.Write(append(jsonLine, '\n')); err != nil {
			gzipWriter.Close()
			return fmt.Errorf("failed to write log entry: %w", err)
		}
	}

	if err := gzipWriter.Close(); err != nil {
		return fmt.Errorf("failed to close gzip writer: %w", err)
	}

	// Upload to MinIO
	_, err = ls.client.PutObject(ctx, LogsBucketName, objectName, &buf, int64(buf.Len()),
		minio.PutObjectOptions{
			ContentType:     "application/gzip",
			ContentEncoding: "gzip",
		})

	if err != nil {
		return fmt.Errorf("failed to upload logs to MinIO: %w", err)
	}

	return nil
}

// GetLogs retrieves logs from MinIO for a date range
func (ls *LogStorage) GetLogs(ctx context.Context, deploymentID string, startDate, endDate time.Time) ([]models.LogEntry, error) {
	var allLogs []models.LogEntry

	prefix := fmt.Sprintf("deployment-logs/%s/", deploymentID)

	for current := startDate; !current.After(endDate); current = current.AddDate(0, 0, 1) {
		objectName := fmt.Sprintf("%s%s.json.gz", prefix, current.Format("2006/01/02"))

		logs, err := ls.getLogsFromObject(ctx, objectName)
		if err != nil {
			// Object might not exist, continue
			continue
		}

		allLogs = append(allLogs, logs...)
	}

	return allLogs, nil
}

func (ls *LogStorage) getLogsFromObject(ctx context.Context, objectName string) ([]models.LogEntry, error) {
	obj, err := ls.client.GetObject(ctx, LogsBucketName, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()

	gzipReader, err := gzip.NewReader(obj)
	if err != nil {
		return nil, err
	}
	defer gzipReader.Close()

	var logs []models.LogEntry
	decoder := json.NewDecoder(gzipReader)

	for {
		var entry models.LogEntry
		if err := decoder.Decode(&entry); err == io.EOF {
			break
		} else if err != nil {
			continue // Skip malformed lines
		}
		logs = append(logs, entry)
	}

	return logs, nil
}

// DeleteLogs deletes logs from MinIO
func (ls *LogStorage) DeleteLogs(ctx context.Context, deploymentID string, before time.Time) error {
	prefix := fmt.Sprintf("deployment-logs/%s/", deploymentID)

	objectsCh := make(chan minio.ObjectInfo)
	go func() {
		defer close(objectsCh)
		for object := range ls.client.ListObjects(ctx, LogsBucketName, minio.ListObjectsOptions{
			Prefix:    prefix,
			Recursive: true,
		}) {
			if object.Err != nil {
				continue
			}
			// Parse date from object key
			if isLogOlderThan(object.Key, before) {
				objectsCh <- object
			}
		}
	}()

	errorsCh := ls.client.RemoveObjects(ctx, LogsBucketName, objectsCh, minio.RemoveObjectsOptions{})
	for err := range errorsCh {
		if err.Err != nil {
			return fmt.Errorf("failed to delete log object %s: %w", err.ObjectName, err.Err)
		}
	}

	return nil
}

func isLogOlderThan(objectKey string, before time.Time) bool {
	// Extract date from path like: deployment-logs/{id}/2024/01/15.json.gz
	parts := strings.Split(objectKey, "/")
	if len(parts) < 5 {
		return false
	}

	dateStr := parts[len(parts)-3] + "-" + parts[len(parts)-2] + "-" + strings.TrimSuffix(parts[len(parts)-1], ".json.gz")
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return false
	}

	return date.Before(before)
}

// GetLogStats returns statistics about stored logs
func (ls *LogStorage) GetLogStats(ctx context.Context, deploymentID string) (map[string]interface{}, error) {
	prefix := fmt.Sprintf("deployment-logs/%s/", deploymentID)

	var totalSize int64
	var fileCount int
	oldestDate := time.Now()
	newestDate := time.Time{}

	for object := range ls.client.ListObjects(ctx, LogsBucketName, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}) {
		if object.Err != nil {
			continue
		}

		totalSize += object.Size
		fileCount++

		// Parse date from object key
		parts := strings.Split(object.Key, "/")
		if len(parts) >= 5 {
			dateStr := parts[len(parts)-3] + "-" + parts[len(parts)-2] + "-" + strings.TrimSuffix(parts[len(parts)-1], ".json.gz")
			if date, err := time.Parse("2006-01-02", dateStr); err == nil {
				if date.Before(oldestDate) {
					oldestDate = date
				}
				if date.After(newestDate) {
					newestDate = date
				}
			}
		}
	}

	return map[string]interface{}{
		"total_size_bytes": totalSize,
		"file_count":       fileCount,
		"oldest_log_date":  oldestDate,
		"newest_log_date":  newestDate,
	}, nil
}
