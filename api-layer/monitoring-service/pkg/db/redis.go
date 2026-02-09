package db

import (
	"context"
	"fmt"
	"time"

	"monitoring-service/pkg/config"

	"github.com/go-redis/redis/v8"
)

type RedisClient struct {
	*redis.Client
}

func NewRedisConnection(cfg *config.Config) (*RedisClient, error) {
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %w", err)
	}

	client := redis.NewClient(opt)

	// Verify connection with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to ping Redis: %w", err)
	}

	return &RedisClient{client}, nil
}

func (r *RedisClient) HealthCheck(ctx context.Context) error {
	return r.Ping(ctx).Err()
}
