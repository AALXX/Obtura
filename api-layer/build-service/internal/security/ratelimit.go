package security

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RateLimiter struct {
	redis *redis.Client
}

func NewRateLimiter(redisURL string) (*RateLimiter, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("invalid redis URL: %w", err)
	}

	client := redis.NewClient(opt)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &RateLimiter{redis: client}, nil
}

type BuildLimits struct {
	MaxConcurrent int
	MaxPerHour    int
	MaxPerDay     int
}

func (rl *RateLimiter) CheckAndIncrementBuildLimit(ctx context.Context, projectID string, limits BuildLimits) error {
	// Check concurrent builds
	concurrentKey := fmt.Sprintf("builds:concurrent:%s", projectID)
	concurrent, err := rl.redis.Get(ctx, concurrentKey).Int()
	if err != nil && err != redis.Nil {
		return fmt.Errorf("failed to check concurrent builds: %w", err)
	}

	if concurrent >= limits.MaxConcurrent {
		return fmt.Errorf("concurrent build limit reached (%d/%d)", concurrent, limits.MaxConcurrent)
	}

	// Check hourly limit
	hourlyKey := fmt.Sprintf("builds:hourly:%s:%s", projectID, time.Now().Format("2006010215"))
	hourlyCount, err := rl.redis.Get(ctx, hourlyKey).Int()
	if err != nil && err != redis.Nil {
		return fmt.Errorf("failed to check hourly builds: %w", err)
	}

	if hourlyCount >= limits.MaxPerHour {
		return fmt.Errorf("hourly build limit reached (%d/%d)", hourlyCount, limits.MaxPerHour)
	}

	// Check daily limit
	dailyKey := fmt.Sprintf("builds:daily:%s:%s", projectID, time.Now().Format("20060102"))
	dailyCount, err := rl.redis.Get(ctx, dailyKey).Int()
	if err != nil && err != redis.Nil {
		return fmt.Errorf("failed to check daily builds: %w", err)
	}

	if dailyCount >= limits.MaxPerDay {
		return fmt.Errorf("daily build limit reached (%d/%d)", dailyCount, limits.MaxPerDay)
	}

	// Increment all counters
	pipe := rl.redis.Pipeline()

	pipe.Incr(ctx, concurrentKey)
	pipe.Expire(ctx, concurrentKey, 1*time.Hour)

	pipe.Incr(ctx, hourlyKey)
	pipe.Expire(ctx, hourlyKey, 2*time.Hour)

	pipe.Incr(ctx, dailyKey)
	pipe.Expire(ctx, dailyKey, 48*time.Hour)

	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to increment counters: %w", err)
	}

	return nil
}

func (rl *RateLimiter) DecrementConcurrentBuilds(ctx context.Context, projectID string) error {
	concurrentKey := fmt.Sprintf("builds:concurrent:%s", projectID)
	return rl.redis.Decr(ctx, concurrentKey).Err()
}

func (rl *RateLimiter) Close() error {
	return rl.redis.Close()
}
