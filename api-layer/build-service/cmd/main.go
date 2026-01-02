package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"build-service/internal/security"
	"build-service/internal/storage"
	"build-service/internal/worker"
	"build-service/pkg"

	"github.com/gin-gonic/gin"
)

func main() {
	pgHost := pkg.GetEnv("POSTGRESQL_HOST", "localhost")
	pgPort := pkg.GetEnv("POSTGRESQL_PORT", "5432")
	pgDatabase := pkg.GetEnv("POSTGRESQL_DATABASE", "obtura_db")
	pgUser := pkg.GetEnv("POSTGRESQL_USER", "postgres")
	pgPassword := pkg.GetEnv("POSTGRESQL_PASSWORD", "")

	pgConnStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		pgHost, pgPort, pgUser, pgPassword, pgDatabase,
	)

	db, err := pkg.NewDatabase(pgConnStr)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("✅ Successfully connected to PostgreSQL database")

	redisURL := pkg.GetEnv("REDIS_URL", "redis://localhost:6379/0")
	rateLimiter, err := security.NewRateLimiter(redisURL)
	if err != nil {
		log.Fatalf("Failed to create rate limiter: %v", err)
	}
	defer rateLimiter.Close()
	log.Println("✅ Successfully connected to Redis")

	// Initialize MinIO storage
	minioEndpoint := pkg.GetEnv("MINIO_ENDPOINT", "localhost:9000")
	minioAccessKey := pkg.GetEnv("MINIO_ACCESS_KEY", "minioadmin")
	minioSecretKey := pkg.GetEnv("MINIO_SECRET_KEY", "minioadmin")
	minioBucket := pkg.GetEnv("MINIO_BUCKET", "obtura-builds")
	minioUseSSL := pkg.GetEnv("MINIO_USE_SSL", "false") == "true"

	minioStorage, err := storage.NewMinIOStorage(minioEndpoint, minioAccessKey, minioSecretKey, minioBucket, minioUseSSL)
	if err != nil {
		log.Fatalf("Failed to create MinIO storage: %v", err)
	}
	log.Println("✅ Successfully connected to MinIO")

	rabbitMQURL := pkg.GetEnv("RABBITMQ_URL", "amqp://obtura:obtura123@rabbitmq:5672")

	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		if err := db.Ping(); err != nil {
			c.JSON(503, gin.H{
				"status":   "unhealthy",
				"database": "disconnected",
				"error":    err.Error(),
			})
			return
		}

		c.JSON(200, gin.H{
			"status":   "healthy",
			"database": "connected",
		})
	})

	w, err := worker.NewWorker(rabbitMQURL, db, rateLimiter, minioStorage)
	if err != nil {
		log.Fatalf("Failed to create worker: %v", err)
	}
	defer w.Close()

	go func() {
		log.Println("🚀 Starting RabbitMQ worker...")
		if err := w.Start(); err != nil {
			log.Fatalf("Worker failed: %v", err)
		}
	}()

	serverPort := pkg.GetEnv("PORT", "5050")

	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan

		log.Println("🛑 Shutting down gracefully...")
		w.Close()
		db.Close()
		os.Exit(0)
	}()

	log.Printf("🌐 Starting server on port %s...", serverPort)
	if err := r.Run(":" + serverPort); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
