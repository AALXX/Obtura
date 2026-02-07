package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	deployment_logger "deploy-service/internal/logger"
	"deploy-service/internal/security"
	"deploy-service/internal/storage"
	"deploy-service/internal/worker"
	"deploy-service/pkg"

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

	// Initialize deployment broker with database support
	deployment_logger.InitDeploymentBroker(db.DB)

	redisURL := pkg.GetEnv("REDIS_URL", "redis://localhost:6379/0")
	rateLimiter, err := security.NewRateLimiter(redisURL)
	if err != nil {
		log.Fatalf("Failed to create rate limiter: %v", err)
	}
	defer rateLimiter.Close()
	log.Println("✅ Successfully connected to Redis")

	quotaService := security.NewQuotaService(db.DB)

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

	// CORS middleware for SSE
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

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

	// SSE endpoint for live deployment logs
	r.GET("/api/deployments/:deploymentId/logs/stream", deployment_logger.HandleDeploymentLogsSSE)

	// SSE endpoint for live container logs
	r.GET("/api/deployments/:deploymentId/containers/:containerId/logs/stream", deployment_logger.HandleContainerLogsSSE)

	// REST endpoint for historical deployment logs (from deployment_events table)
	r.GET("/api/deployments/:deploymentId/logs", func(c *gin.Context) {
		deploymentID := c.Param("deploymentId")

		rows, err := db.Query(`
			SELECT event_type, event_message, severity, created_at 
			FROM deployment_events 
			WHERE deployment_id = $1 
			ORDER BY created_at ASC
		`, deploymentID)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to fetch deployment logs"})
			return
		}
		defer rows.Close()

		var logs []gin.H
		for rows.Next() {
			var eventType, message, severity string
			var createdAt interface{}
			rows.Scan(&eventType, &message, &severity, &createdAt)
			logs = append(logs, gin.H{
				"log_type":   severity, // Maps to type in frontend
				"message":    message,
				"event_type": eventType,
				"created_at": createdAt,
			})
		}

		c.JSON(200, gin.H{"logs": logs})
	})

	w, err := worker.NewWorker(rabbitMQURL, db.DB, quotaService, rateLimiter, minioStorage)
	if err != nil {
		log.Fatalf("Failed to create worker: %v", err)
	}
	defer w.Close()

	go func() {
		log.Println("🚀 Starting RabbitMQ deployment worker...")
		if err := w.Start(); err != nil {
			log.Fatalf("Deployment worker failed: %v", err)
		}
	}()

	serverPort := pkg.GetEnv("PORT", "5070")

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
	log.Printf("📡 SSE endpoint: http://localhost:%s/api/deployments/{deploymentId}/logs/stream", serverPort)
	log.Printf("📡 Container logs SSE: http://localhost:%s/api/deployments/{deploymentId}/containers/{containerId}/logs/stream", serverPort)
	log.Printf("📊 REST endpoint: http://localhost:%s/api/deployments/{deploymentId}/logs", serverPort)
	if err := r.Run(":" + serverPort); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
