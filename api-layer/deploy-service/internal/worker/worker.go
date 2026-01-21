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

type Worker struct {
	conn              *amqp091.Connection
	deploymentChannel *amqp091.Channel
	db                *sql.DB
	quotaService      *security.QuotaService
	rateLimiter       *security.RateLimiter
	minioStorage      *storage.MinIOStorage
	orchestrator      *deployment.DeploymentOrchestrator
}

type DeploymentJob struct {
	JobID               string                 `json:"job_id"`
	ProjectID           string                 `json:"project_id"`
	BuildID             string                 `json:"build_id"`
	ImageTag            string                 `json:"image_tag"`
	DeploymentID        string                 `json:"deployment_id"`
	Environment         string                 `json:"environment"`
	PreviousContainerID string                 `json:"previous_container_id"`
	RequiresMigration   bool                   `json:"requires_migration"`
	Config              map[string]interface{} `json:"config"`
	CreatedAt           time.Time              `json:"created_at"`
}

// New message format from Core API / Build Service
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

	orchestrator := deployment.NewDeploymentOrchestrator(db, quotaService, rateLimiter)

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

	w.deploymentChannel.Qos(1, 0, false)

	// Start consuming
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
		return fmt.Errorf("failed to register consumer: %w", err)
	}

	log.Println("🚀 Deployment worker started, waiting for deployment messages...")

	for msg := range msgs {
		log.Printf("📥 Received deployment message: %s", msg.Body)

		if err := w.handleDeploymentMessage(msg); err != nil {
			log.Printf("❌ Error processing deployment: %v", err)

			if msg.Headers != nil {
				if xDeath, ok := msg.Headers["x-death"].([]interface{}); ok && len(xDeath) >= 3 {
					log.Printf("❌ Max retries reached, rejecting message")
					msg.Nack(false, false) 
					continue
				}
			}

			msg.Nack(false, true) 

		} else {
			msg.Ack(false)
		}
	}

	return nil
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

	// Create deployment job
	job := deployment.DeploymentJob{
		JobID:               fmt.Sprintf("job_%s", deploymentID),
		ProjectID:           msg.ProjectID,
		BuildID:             msg.BuildID,
		ImageTag:            msg.Build.ImageTags[0],
		DeploymentID:        deploymentID,
		Environment:         environment,
		Strategy:            "", // Will default to blue_green
		ReplicaCount:        1,
		PreviousContainerID: "",
		RequiresMigration:   false,
		Config:              msg.Build.Metadata,
		CreatedAt:           time.Now(),
	}

	log.Printf("📦 Deploying:")
	log.Printf("   Project: %s (%s)", msg.Project.Name, msg.Project.Slug)
	log.Printf("   Build: %s", msg.BuildID)
	log.Printf("   Image: %s", job.ImageTag)
	log.Printf("   Environment: %s", environment)
	if msg.Deployment != nil && msg.Deployment.Domain != "" {
		log.Printf("   Domain: %s", msg.Deployment.Domain)
	}

	// Update deployment status
	w.updateDeploymentStatus(deploymentID, "deploying")
	w.updateDeploymentStartTime(deploymentID, time.Now())

	// Execute deployment
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

func (w *Worker) Close() error {
	if w.deploymentChannel != nil {
		w.deploymentChannel.Close()
	}
	if w.conn != nil {
		w.conn.Close()
	}
	return nil
}
