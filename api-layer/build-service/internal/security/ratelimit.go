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
	MaxPerMonth   int
}

// CheckAndIncrementBuildLimit checks and increments build limits at COMPANY level
func (rl *RateLimiter) CheckAndIncrementBuildLimit(ctx context.Context, companyID string, limits BuildLimits) error {
	// Check concurrent builds at COMPANY level
	concurrentKey := fmt.Sprintf("builds:concurrent:company:%s", companyID)
	concurrent, err := rl.redis.Get(ctx, concurrentKey).Int()
	if err != nil && err != redis.Nil {
		return fmt.Errorf("failed to check concurrent builds: %w", err)
	}

	if concurrent >= limits.MaxConcurrent {
		return fmt.Errorf("concurrent build limit reached (%d/%d)", concurrent, limits.MaxConcurrent)
	}

	// Check monthly limit at COMPANY level
	monthlyKey := fmt.Sprintf("builds:monthly:company:%s:%s", companyID, time.Now().Format("200601"))
	monthlyCount, err := rl.redis.Get(ctx, monthlyKey).Int()
	if err != nil && err != redis.Nil {
		return fmt.Errorf("failed to check monthly builds: %w", err)
	}

	if monthlyCount >= limits.MaxPerMonth {
		return fmt.Errorf("monthly build limit reached (%d/%d)", monthlyCount, limits.MaxPerMonth)
	}

	// Increment all counters
	pipe := rl.redis.Pipeline()

	pipe.Incr(ctx, concurrentKey)
	pipe.Expire(ctx, concurrentKey, 2*time.Hour) // Give some buffer for build completion

	pipe.Incr(ctx, monthlyKey)
	pipe.Expire(ctx, monthlyKey, 60*24*time.Hour) // ~2 months retention

	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to increment counters: %w", err)
	}

	return nil
}

func (rl *RateLimiter) DecrementConcurrentBuilds(ctx context.Context, companyID string) error {
	concurrentKey := fmt.Sprintf("builds:concurrent:company:%s", companyID)
	return rl.redis.Decr(ctx, concurrentKey).Err()
}

func (rl *RateLimiter) Close() error {
	return rl.redis.Close()
}