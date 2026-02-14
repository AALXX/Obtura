package config

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/minio/minio-go/v7"
)

type Config struct {
	Port                   string
	Environment            string
	PostgresHost           string
	PostgresPort           string
	PostgresDatabase       string
	PostgresUser           string
	PostgresPassword       string
	RedisURL               string
	RabbitMQURL            string
	MinioEndpoint          string
	MinioAccessKey         string
	MinioSecretKey         string
	MinioUseSSL            bool
	DockerHost             string
	DockerTLSVerify        string
	DockerCertPath         string
	MetricsInterval        time.Duration
	HealthCheckInterval    time.Duration
	LogAggregationInterval time.Duration
	CoreAPIURL             string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:                   getEnv("PORT", "5110"),
		Environment:            getEnv("GO_ENV", "development"),
		PostgresHost:           getEnv("POSTGRESQL_HOST", "postgres"),
		PostgresPort:           getEnv("POSTGRESQL_PORT", "5432"),
		PostgresDatabase:       getEnv("POSTGRESQL_DATABASE", "obtura_db"),
		PostgresUser:           getEnv("POSTGRESQL_USER", "alx"),
		PostgresPassword:       getEnv("POSTGRESQL_PASSWORD", "serbvn"),
		RedisURL:               getEnv("REDIS_URL", "redis://redis:6379"),
		RabbitMQURL:            getEnv("RABBITMQ_URL", "amqp://obtura:obtura123@rabbitmq:5672"),
		MinioEndpoint:          getEnv("MINIO_ENDPOINT", "minio:9000"),
		MinioAccessKey:         getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinioSecretKey:         getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinioUseSSL:            getEnv("MINIO_USE_SSL", "false") == "true",
		DockerHost:             getEnv("DOCKER_HOST", "tcp://docker:2376"),
		DockerTLSVerify:        getEnv("DOCKER_TLS_VERIFY", "1"),
		DockerCertPath:         getEnv("DOCKER_CERT_PATH", "/certs/client/client"),
		MetricsInterval:        30 * time.Second,
		HealthCheckInterval:    60 * time.Second,
		LogAggregationInterval: 10 * time.Second,
		CoreAPIURL:             getEnv("CORE_API_URL", "http://core-api:7070"),
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) Validate() error {
	var missingVars []string

	if c.Port == "" {
		missingVars = append(missingVars, "PORT")
	}
	if c.PostgresHost == "" {
		missingVars = append(missingVars, "POSTGRESQL_HOST")
	}
	if c.PostgresPort == "" {
		missingVars = append(missingVars, "POSTGRESQL_PORT")
	}
	if c.PostgresDatabase == "" {
		missingVars = append(missingVars, "POSTGRESQL_DATABASE")
	}
	if c.PostgresUser == "" {
		missingVars = append(missingVars, "POSTGRESQL_USER")
	}
	if c.PostgresPassword == "" {
		missingVars = append(missingVars, "POSTGRESQL_PASSWORD")
	}
	if c.RedisURL == "" {
		missingVars = append(missingVars, "REDIS_URL")
	}
	if c.MinioEndpoint == "" {
		missingVars = append(missingVars, "MINIO_ENDPOINT")
	}
	if c.MinioAccessKey == "" {
		missingVars = append(missingVars, "MINIO_ACCESS_KEY")
	}
	if c.MinioSecretKey == "" {
		missingVars = append(missingVars, "MINIO_SECRET_KEY")
	}

	if len(missingVars) > 0 {
		return fmt.Errorf("missing required environment variables: %v", missingVars)
	}

	// Validate URL formats
	if _, err := url.Parse(c.RedisURL); err != nil {
		return fmt.Errorf("invalid REDIS_URL format: %w", err)
	}

	return nil
}

func (c *Config) ValidateConnections() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Validate Redis connection
	opt, err := redis.ParseURL(c.RedisURL)
	if err != nil {
		return fmt.Errorf("failed to parse Redis URL: %w", err)
	}
	redisClient := redis.NewClient(opt)
	defer redisClient.Close()

	if err := redisClient.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to connect to Redis: %w", err)
	}

	// Validate MinIO connection
	minioClient, err := minio.New(c.MinioEndpoint, &minio.Options{
		Secure: c.MinioUseSSL,
	})
	if err != nil {
		return fmt.Errorf("failed to create MinIO client: %w", err)
	}

	if _, err := minioClient.ListBuckets(ctx); err != nil {
		return fmt.Errorf("failed to connect to MinIO: %w", err)
	}

	return nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func (c *Config) GetPostgresConnString() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		c.PostgresHost, c.PostgresPort, c.PostgresUser, c.PostgresPassword, c.PostgresDatabase,
	)
}
