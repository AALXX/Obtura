package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"deploy-service/internal/deployment"
	"deploy-service/internal/security"
	"deploy-service/internal/storage"

	"github.com/rabbitmq/amqp091-go"
)

const (
	MaxDeploymentRetries = 5
)

type Worker struct {
	conn              *amqp091.Connection
	deploymentChannel *amqp091.Channel
	db                *sql.DB
	quotaService      *security.QuotaService
	rateLimiter       *security.RateLimiter
	minioStorage      *storage.MinIOStorage
	orchestrator      *deployment.DeploymentOrchestrator
}

type DeployMessage struct {
	BuildID      string          `json:"buildId"`
	DeploymentID string          `json:"deploymentId,omitempty"`
	ProjectID    string          `json:"projectId"`
	Project      *ProjectData    `json:"project,omitempty"`
	Build        *BuildData      `json:"build,omitempty"`
	Deployment   *DeploymentData `json:"deployment,omitempty"`
}

type ProjectData struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}

type BuildData struct {
	ID         string                 `json:"id"`
	ImageTags  []string               `json:"imageTags"`
	Branch     string                 `json:"branch"`
	CommitHash string                 `json:"commitHash"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

type DeploymentData struct {
	ID          string `json:"id"`
	Environment string `json:"environment"`
	Strategy    string `json:"strategy"`
	Domain      string `json:"domain,omitempty"`
	Subdomain   string `json:"subdomain,omitempty"`
}

func NewWorker(rabbitMQURL string, db *sql.DB, quotaService *security.QuotaService, rateLimiter *security.RateLimiter, minioStorage *storage.MinIOStorage) (*Worker, error) {
	conn, err := amqp091.Dial(rabbitMQURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	deploymentChannel, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open deployment channel: %w", err)
	}

	orchestrator, err := deployment.NewDeploymentOrchestrator(db, quotaService, rateLimiter)

	if err != nil {
		deploymentChannel.Close()
		conn.Close()
		return nil, fmt.Errorf("failed to create deployment orchestrator: %w", err)
	}

	return &Worker{
		conn:              conn,
		deploymentChannel: deploymentChannel,
		db:                db,
		quotaService:      quotaService,
		rateLimiter:       rateLimiter,
		minioStorage:      minioStorage,
		orchestrator:      orchestrator,
	}, nil
}

func (w *Worker) Start() error {
	err := w.deploymentChannel.ExchangeDeclare(
		"obtura.deploys",
		"direct",
		true,  // durable
		false, // auto-delete
		false, // internal
		false, // no-wait
		nil,   // arguments
	)
	if err != nil {
		return fmt.Errorf("failed to declare obtura.deploys exchange: %w", err)
	}

	queue, err := w.deploymentChannel.QueueDeclare(
		"deployment.jobs",
		true,  // durable
		false, // auto-delete
		false, // exclusive
		false, // no-wait
		nil,   // arguments
	)
	if err != nil {
		return fmt.Errorf("failed to declare deployment.jobs queue: %w", err)
	}

	err = w.deploymentChannel.QueueBind(
		queue.Name,
		"deploy.triggered", // routing key
		"obtura.deploys",   // exchange
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to bind deployment queue: %w", err)
	}

	log.Printf("✅ Deployment queue bound: %s -> obtura.deploys (deploy.triggered)", queue.Name)

	// Create and bind cleanup queue
	cleanupQueue, err := w.deploymentChannel.QueueDeclare(
		"project.cleanup.jobs",
		true,  // durable
		false, // auto-delete
		false, // exclusive
		false, // no-wait
		nil,   // arguments
	)
	if err != nil {
		return fmt.Errorf("failed to declare cleanup queue: %w", err)
	}

	err = w.deploymentChannel.QueueBind(
		cleanupQueue.Name,
		"project.cleanup", // routing key
		"obtura.deploys",  // exchange
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to bind cleanup queue: %w", err)
	}

	log.Printf("✅ Cleanup queue bound: %s -> obtura.deploys (project.cleanup)", cleanupQueue.Name)

	w.deploymentChannel.Qos(1, 0, false)

	// Start consuming deployment messages
	msgs, err := w.deploymentChannel.Consume(
		queue.Name,
		"",    // consumer tag
		false, // auto-ack
		false, // exclusive
		false, // no-local
		false, // no-wait
		nil,   // args
	)
	if err != nil {
		return fmt.Errorf("failed to register deployment consumer: %w", err)
	}

	// Start consuming cleanup messages
	cleanupMsgs, err := w.deploymentChannel.Consume(
		cleanupQueue.Name,
		"",    // consumer tag
		false, // auto-ack
		false, // exclusive
		false, // no-local
		false, // no-wait
		nil,   // args
	)
	if err != nil {
		return fmt.Errorf("failed to register cleanup consumer: %w", err)
	}

	log.Println("🚀 Deployment worker started, waiting for messages...")

	// Handle deployment messages in a goroutine
	go func() {
		for msg := range msgs {
			log.Printf("📥 Received deployment message: %s", msg.Body)

			if err := w.handleDeploymentMessage(msg); err != nil {
				log.Printf("❌ Error processing deployment: %v", err)

				// Get retry count from both message headers and database
				retryCount := w.getRetryCount(msg)

				// Also check database retry count
				var deployMsg DeployMessage
				if jsonErr := json.Unmarshal(msg.Body, &deployMsg); jsonErr == nil && deployMsg.DeploymentID != "" {
					dbRetryCount := w.getDeploymentRetryCount(deployMsg.DeploymentID)
					if dbRetryCount > retryCount {
						retryCount = dbRetryCount
					}
				}

				if retryCount >= MaxDeploymentRetries {
					log.Printf("❌ Max retries (%d) reached for deployment, marking as permanently failed", MaxDeploymentRetries)

					// Extract deployment ID and mark as failed
					if jsonErr := json.Unmarshal(msg.Body, &deployMsg); jsonErr == nil && deployMsg.DeploymentID != "" {
						w.markDeploymentAsPermanentlyFailed(deployMsg.DeploymentID, fmt.Sprintf("Failed after %d retry attempts. Last error: %v", MaxDeploymentRetries, err))
					}

					// Acknowledge and discard the message
					msg.Ack(false)
				} else {
					log.Printf("⚠️ Deployment failed, will retry (attempt %d/%d)", retryCount+1, MaxDeploymentRetries)

					// Track retry in database
					if jsonErr := json.Unmarshal(msg.Body, &deployMsg); jsonErr == nil && deployMsg.DeploymentID != "" {
						w.incrementDeploymentRetryCount(deployMsg.DeploymentID, err.Error())
					}

					// Reject and requeue for retry
					msg.Nack(false, true)
				}
			} else {
				log.Printf("✅ Deployment processed successfully")
				msg.Ack(false)
			}
		}
	}()

	// Handle cleanup messages
	for msg := range cleanupMsgs {
		log.Printf("📥 Received cleanup message: %s", msg.Body)

		if err := w.handleCleanupMessage(msg); err != nil {
			log.Printf("❌ Error processing cleanup: %v", err)
			msg.Nack(false, true)
		} else {
			log.Printf("✅ Cleanup processed successfully")
			msg.Ack(false)
		}
	}

	return nil
}

// getRetryCount extracts the retry count from message headers
func (w *Worker) getRetryCount(msg amqp091.Delivery) int {
	if msg.Headers == nil {
		return 0
	}

	// Check for x-death header which RabbitMQ adds on redelivery
	if xDeath, ok := msg.Headers["x-death"].([]interface{}); ok && len(xDeath) > 0 {
		if death, ok := xDeath[0].(amqp091.Table); ok {
			if count, ok := death["count"].(int64); ok {
				return int(count)
			}
		}
	}

	return 0
}

// getDeploymentRetryCount gets the retry count from the database
func (w *Worker) getDeploymentRetryCount(deploymentID string) int {
	var retryCount int
	err := w.db.QueryRow(`
		SELECT COALESCE(retry_count, 0) 
		FROM deployments 
		WHERE id = $1
	`, deploymentID).Scan(&retryCount)

	if err != nil {
		log.Printf("⚠️ Failed to get retry count from database: %v", err)
		return 0
	}

	return retryCount
}

// incrementDeploymentRetryCount increments the retry count in the database
func (w *Worker) incrementDeploymentRetryCount(deploymentID, errorMsg string) {
	_, err := w.db.Exec(`
        UPDATE deployments 
        SET retry_count = COALESCE(retry_count, 0) + 1,
            last_retry_at = NOW(),
            retry_errors = COALESCE(retry_errors, '[]'::jsonb) || jsonb_build_object(
                'attempt', COALESCE(retry_count, 0) + 1,
                'error', $2::text, 
                'timestamp', NOW()
            )::jsonb,
            updated_at = NOW()
        WHERE id = $1
    `, deploymentID, errorMsg)

	if err != nil {
		log.Printf("⚠️ Failed to increment retry count: %v", err)
	}
}

// markDeploymentAsPermanentlyFailed marks a deployment as permanently failed after max retries
func (w *Worker) markDeploymentAsPermanentlyFailed(deploymentID, errorMessage string) {
	log.Printf("🚫 Marking deployment %s as permanently failed", deploymentID)

	// Update deployment status
	_, err := w.db.Exec(`
		UPDATE deployments 
		SET status = 'failed',
			error_message = $1,
			deployment_completed_at = NOW(),
			updated_at = NOW()
		WHERE id = $2
	`, errorMessage, deploymentID)

	if err != nil {
		log.Printf("❌ Failed to mark deployment as permanently failed: %v", err)
	}

	// Update deployment strategy state
	_, err = w.db.Exec(`
		UPDATE deployment_strategy_state
		SET current_phase = 'failed',
			error_message = $1,
			failed_at = NOW(),
			updated_at = NOW()
		WHERE deployment_id = $2
	`, errorMessage, deploymentID)

	if err != nil {
		log.Printf("❌ Failed to update strategy state: %v", err)
	}

	// Log critical event
	_, err = w.db.Exec(`
		INSERT INTO deployment_events
		(deployment_id, event_type, event_message, severity)
		VALUES ($1, 'failed_permanently', $2, 'critical')
	`, deploymentID, errorMessage)

	if err != nil {
		log.Printf("❌ Failed to log deployment event: %v", err)
	}

	// Try to get company ID and decrement concurrent deployments
	var projectID string
	err = w.db.QueryRow(`SELECT project_id FROM deployments WHERE id = $1`, deploymentID).Scan(&projectID)
	if err == nil {
		var companyID string
		err = w.db.QueryRow(`SELECT company_id FROM projects WHERE id = $1`, projectID).Scan(&companyID)
		if err == nil {
			ctx := context.Background()
			w.rateLimiter.DecrementConcurrentDeployments(ctx, companyID)
			log.Printf("✅ Decremented concurrent deployments for company %s", companyID)
		}
	}

	log.Printf("✅ Deployment %s marked as permanently failed", deploymentID)
}

func (w *Worker) handleDeploymentMessage(msg amqp091.Delivery) error {
	var deployMsg DeployMessage

	// Parse incoming message
	if err := json.Unmarshal(msg.Body, &deployMsg); err != nil {
		return fmt.Errorf("failed to parse deployment message: %w", err)
	}

	// Validate required fields
	if deployMsg.BuildID == "" {
		return fmt.Errorf("buildId is required")
	}

	log.Printf("📋 Processing deployment for BuildID: %s", deployMsg.BuildID)

	// Check if we have full deployment data in the message
	if deployMsg.Build != nil && len(deployMsg.Build.ImageTags) > 0 && deployMsg.DeploymentID != "" {
		log.Printf("✅ Using deployment data from message")
		return w.deployFromMessage(&deployMsg)
	}

	// Fallback: fetch from database (shouldn't happen with new flow)
	log.Printf("⚠️ Message missing data, this shouldn't happen")
	return fmt.Errorf("incomplete deployment message")
}

func (w *Worker) deployFromMessage(msg *DeployMessage) error {
	if msg.Build == nil || len(msg.Build.ImageTags) == 0 {
		return fmt.Errorf("no image tags available in build data")
	}

	deploymentID := msg.DeploymentID
	if deploymentID == "" {
		return fmt.Errorf("deployment ID is required")
	}

	// Determine environment
	environment := "production"
	if msg.Deployment != nil && msg.Deployment.Environment != "" {
		environment = msg.Deployment.Environment
	}

	strategy := "blue_green"
	if msg.Deployment.Strategy != "" {
		strategy = msg.Deployment.Strategy
	}

	// Create deployment job
	job := deployment.DeploymentJob{
		JobID:               fmt.Sprintf("job_%s", deploymentID),
		ProjectID:           msg.ProjectID,
		BuildID:             msg.BuildID,
		ImageTag:            msg.Build.ImageTags[0],
		DeploymentID:        deploymentID,
		Environment:         environment,
		Strategy:            strategy,
		ReplicaCount:        1,
		PreviousContainerID: "",
		RequiresMigration:   false,
		Domain:              msg.Deployment.Domain,
		Subdomain:           msg.Deployment.Subdomain,
		Config:              msg.Build.Metadata,
		CreatedAt:           time.Now(),
	}

	log.Printf("📦 Deploying:")
	log.Printf("   Project: %s (%s)", msg.Project.Name, msg.Project.Slug)
	log.Printf("   Build: %s", msg.BuildID)
	log.Printf("   Image: %s", job.ImageTag)
	log.Printf("   Environment: %s", environment)
	log.Printf("   Strategy: %s", strategy)
	if msg.Deployment != nil && msg.Deployment.Domain != "" {
		log.Printf("   Domain: %s", msg.Deployment.Domain)
	}

	w.updateDeploymentStatus(deploymentID, "deploying")
	w.updateDeploymentStartTime(deploymentID, time.Now())

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	err := w.orchestrator.Deploy(ctx, job)
	if err != nil {
		log.Printf("❌ Deployment %s failed: %v", deploymentID, err)
		w.updateDeploymentStatus(deploymentID, "failed")
		w.updateDeploymentError(deploymentID, err.Error())
		w.updateDeploymentEndTime(deploymentID, time.Now())
		return err
	}

	log.Printf("✅ Deployment %s completed successfully", deploymentID)
	w.updateDeploymentStatus(deploymentID, "active")
	w.updateDeploymentEndTime(deploymentID, time.Now())

	// Reset retry count on success
	w.db.Exec(`
		UPDATE deployments 
		SET retry_count = 0,
			retry_errors = '[]'::jsonb
		WHERE id = $1
	`, deploymentID)

	return nil
}

func (w *Worker) updateDeploymentStatus(deploymentID, status string) {
	query := `UPDATE deployments SET status = $1, updated_at = NOW() WHERE id = $2`
	_, err := w.db.Exec(query, status, deploymentID)
	if err != nil {
		log.Printf("Failed to update deployment status: %v", err)
	}
}

func (w *Worker) updateDeploymentStartTime(deploymentID string, startTime time.Time) {
	query := `UPDATE deployments SET deployment_started_at = $1 WHERE id = $2`
	_, err := w.db.Exec(query, startTime, deploymentID)
	if err != nil {
		log.Printf("Failed to update deployment start time: %v", err)
	}
}

func (w *Worker) updateDeploymentEndTime(deploymentID string, endTime time.Time) {
	query := `UPDATE deployments SET deployment_completed_at = $1 WHERE id = $2`
	_, err := w.db.Exec(query, endTime, deploymentID)
	if err != nil {
		log.Printf("Failed to update deployment end time: %v", err)
	}
}

func (w *Worker) updateDeploymentError(deploymentID, errorMsg string) {
	query := `UPDATE deployments SET error_message = $1 WHERE id = $2`
	_, err := w.db.Exec(query, errorMsg, deploymentID)
	if err != nil {
		log.Printf("Failed to update deployment error: %v", err)
	}
}

type CleanupMessage struct {
	ProjectID  string `json:"projectId"`
	Containers []struct {
		ContainerID   string `json:"containerId"`
		ContainerName string `json:"containerName"`
	} `json:"containers"`
	Timestamp int64 `json:"timestamp"`
}

func (w *Worker) handleCleanupMessage(msg amqp091.Delivery) error {
	var cleanupMsg CleanupMessage

	// Parse incoming message
	if err := json.Unmarshal(msg.Body, &cleanupMsg); err != nil {
		return fmt.Errorf("failed to parse cleanup message: %w", err)
	}

	if cleanupMsg.ProjectID == "" {
		return fmt.Errorf("projectId is required")
	}

	log.Printf("🧹 Processing cleanup for ProjectID: %s with %d containers", cleanupMsg.ProjectID, len(cleanupMsg.Containers))

	ctx := context.Background()

	// Cleanup each container
	for _, c := range cleanupMsg.Containers {
		if c.ContainerID == "" {
			log.Printf("⚠️ Skipping container with empty ID")
			continue
		}

		// Remove Traefik config first
		if c.ContainerName != "" {
			log.Printf("🗑️ Removing Traefik config for container: %s", c.ContainerName)
			w.orchestrator.RemoveTraefikConfig(c.ContainerName)
		}

		// Stop and remove the container using orchestrator
		log.Printf("🛑 Stopping and removing container: %s", c.ContainerID[:12])
		w.orchestrator.RemoveContainerWithDocker(ctx, c.ContainerID)
	}

	log.Printf("✅ Cleanup completed for ProjectID: %s", cleanupMsg.ProjectID)
	return nil
}

func (w *Worker) Close() error {
	if w.deploymentChannel != nil {
		w.deploymentChannel.Close()
	}
	if w.conn != nil {
		w.conn.Close()
	}
	return nil
}
