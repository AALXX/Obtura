package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinIOStorage struct {
    client     *minio.Client
    bucketName string
}

func NewMinIOStorage(endpoint, accessKey, secretKey, bucketName string, useSSL bool) (*MinIOStorage, error) {
    client, err := minio.New(endpoint, &minio.Options{
        Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
        Secure: useSSL,
    })
    if err != nil {
        return nil, fmt.Errorf("failed to create MinIO client: %w", err)
    }
    
    ctx := context.Background()
    
    // Ensure bucket exists
    exists, err := client.BucketExists(ctx, bucketName)
    if err != nil {
        return nil, fmt.Errorf("failed to check bucket: %w", err)
    }
    
    if !exists {
        err = client.MakeBucket(ctx, bucketName, minio.MakeBucketOptions{})
        if err != nil {
            return nil, fmt.Errorf("failed to create bucket: %w", err)
        }
    }
    
    return &MinIOStorage{
        client:     client,
        bucketName: bucketName,
    }, nil
}

func (m *MinIOStorage) UploadDirectory(ctx context.Context, localPath, objectPrefix string) error {
    // This would recursively upload a directory
    // For now, simplified version
    return nil
}

func (m *MinIOStorage) DownloadDirectory(ctx context.Context, objectPrefix, localPath string) error {
    objectCh := m.client.ListObjects(ctx, m.bucketName, minio.ListObjectsOptions{
        Prefix:    objectPrefix,
        Recursive: true,
    })
    
    for object := range objectCh {
        if object.Err != nil {
            return fmt.Errorf("error listing objects: %w", object.Err)
        }
        
        objectKey := object.Key
        localFile := filepath.Join(localPath, objectKey[len(objectPrefix):])
        
        if err := os.MkdirAll(filepath.Dir(localFile), 0755); err != nil {
            return fmt.Errorf("failed to create directory: %w", err)
        }
        
        err := m.client.FGetObject(ctx, m.bucketName, objectKey, localFile, minio.GetObjectOptions{})
        if err != nil {
            return fmt.Errorf("failed to download %s: %w", objectKey, err)
        }
    }
    
    return nil
}

func (m *MinIOStorage) PutObject(ctx context.Context, objectName string, reader io.Reader, size int64) error {
    _, err := m.client.PutObject(ctx, m.bucketName, objectName, reader, size, minio.PutObjectOptions{
        ContentType: "application/octet-stream",
    })
    return err
}

func (m *MinIOStorage) GetObject(ctx context.Context, objectName string) (*minio.Object, error) {
    return m.client.GetObject(ctx, m.bucketName, objectName, minio.GetObjectOptions{})
}

func (m *MinIOStorage) DeleteObjects(ctx context.Context, prefix string) error {
    objectsCh := make(chan minio.ObjectInfo)
    
    go func() {
        defer close(objectsCh)
        
        for object := range m.client.ListObjects(ctx, m.bucketName, minio.ListObjectsOptions{
            Prefix:    prefix,
            Recursive: true,
        }) {
            if object.Err != nil {
                return
            }
            objectsCh <- object
        }
    }()
    
    errorCh := m.client.RemoveObjects(ctx, m.bucketName, objectsCh, minio.RemoveObjectsOptions{})
    
    for err := range errorCh {
        if err.Err != nil {
            return fmt.Errorf("failed to delete %s: %w", err.ObjectName, err.Err)
        }
    }
    
    return nil
}