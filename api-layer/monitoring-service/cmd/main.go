package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"monitoring-service/internal/api"
	"monitoring-service/internal/monitoring"
	"monitoring-service/internal/worker"
	"monitoring-service/pkg/config"
	"monitoring-service/pkg/db"
	"monitoring-service/pkg/logger"
)

func main() {
	if err := logger.Init(os.Getenv("GO_ENV")); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("Failed to load configuration", logger.Err(err))
	}

	logger.Info("Configuration loaded",
		logger.String("environment", cfg.Environment),
		logger.String("port", cfg.Port),
	)

	dbConn, err := db.NewPostgresConnection(cfg)
	if err != nil {
		logger.Fatal("Failed to connect to PostgreSQL", logger.Err(err))
	}
	defer func() {
		if err := dbConn.Close(); err != nil {
			logger.Error("Error closing database connection", logger.Err(err))
		}
	}()
	logger.Info("Connected to PostgreSQL")

	redisClient, err := db.NewRedisConnection(cfg)
	if err != nil {
		logger.Fatal("Failed to connect to Redis", logger.Err(err))
	}
	defer func() {
		if err := redisClient.Close(); err != nil {
			logger.Error("Error closing Redis connection", logger.Err(err))
		}
	}()
	logger.Info("Connected to Redis")

	minioClient, err := db.NewMinioClient(cfg)
	if err != nil {
		logger.Fatal("Failed to connect to MinIO", logger.Err(err))
	}
	defer func() {
		minioClient.Close()
		logger.Info("MinIO connection closed")
	}()
	logger.Info("Connected to MinIO")

	orchestrator := monitoring.NewOrchestrator(cfg, dbConn, redisClient, minioClient.Client)

	workerPool := worker.NewWorkerPool(cfg, orchestrator)
	workerPool.Start()
	defer workerPool.Stop()

	apiServer := api.NewServer(cfg, orchestrator)

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      apiServer.Router(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("Starting monitoring service",
			logger.String("port", cfg.Port),
			logger.String("address", fmt.Sprintf("http://localhost:%s", cfg.Port)),
		)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Failed to start server", logger.Err(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down monitoring service...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", logger.Err(err))
	}

	logger.Info("Monitoring service stopped")
}
