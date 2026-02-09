package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"monitoring-service/pkg/config"

	_ "github.com/lib/pq"
)

func NewPostgresConnection(cfg *config.Config) (*sql.DB, error) {
	db, err := sql.Open("postgres", cfg.GetPostgresConnString())
	if err != nil {
		return nil, fmt.Errorf("failed to open postgres connection: %w", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(1 * time.Minute)

	// Verify connection with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping postgres: %w", err)
	}

	return db, nil
}
