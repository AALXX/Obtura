package pkg

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"deploy-service/internal/security"
	"deploy-service/internal/storage"

	"github.com/rabbitmq/amqp091-go"
)

type Worker struct {
	conn        *amqp091.Connection
	channel     *amqp091.Channel
	db          *Database
	rateLimiter *security.RateLimiter
	storage     *storage.MinIOStorage
	queue       string
	exchange    string
	routingKey  string
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

type JobResult struct {
	JobID       string    `json:"job_id"`
	Status      string    `json:"status"`
	Message     string    `json:"message"`
	ContainerID string    `json:"container_id,omitempty"`
	CompletedAt time.Time `json:"completed_at"`
	Error       string    `json:"error,omitempty"`
}

func NewWorker(rabbitMQURL string, db *Database, rateLimiter *security.RateLimiter, storage *storage.MinIOStorage) (*Worker, error) {
	conn, err := amqp091.Dial(rabbitMQURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		return nil, fmt.Errorf("failed to open channel: %w", err)
	}

	queue := "deployments"
	exchange := "deployments"
	routingKey := "deployment.job"

	err = ch.ExchangeDeclare(
		exchange, // name
		"direct", // type
		true,     // durable
		false,    // auto-deleted
		false,    // internal
		false,    // no-wait
		nil,      // arguments
	)
	if err != nil {
		return nil, fmt.Errorf("failed to declare exchange: %w", err)
	}

	_, err = ch.QueueDeclare(
		queue, // name
		true,  // durable
		false, // auto-deleted
		false, // exclusive
		false, // no-wait
		nil,   // arguments
	)
	if err != nil {
		return nil, fmt.Errorf("failed to declare queue: %w", err)
	}

	err = ch.QueueBind(
		queue,      // queue name
		routingKey, // routing key
		exchange,   // exchange
		false,      // no-wait
		nil,        // arguments
	)
	if err != nil {
		return nil, fmt.Errorf("failed to bind queue: %w", err)
	}

	return &Worker{
		conn:        conn,
		channel:     ch,
		db:          db,
		rateLimiter: rateLimiter,
		storage:     storage,
		queue:       queue,
		exchange:    exchange,
		routingKey:  routingKey,
	}, nil
}

func (w *Worker) Start() error {
	msgs, err := w.channel.Consume(
		w.queue, // queue
		"",      // consumer
		false,   // auto-ack
		false,   // exclusive
		false,   // no-local
		false,   // no-wait
		nil,     // args
	)
	if err != nil {
		return fmt.Errorf("failed to register consumer: %w", err)
	}

	log.Printf("🚀 Worker started, waiting for deployment jobs...")

	for msg := range msgs {
		if err := w.processJob(msg); err != nil {
			log.Printf("Error processing job: %v", err)
			msg.Nack(false, false) // Reject and don't requeue
		} else {
			msg.Ack(false) // Acknowledge successful processing
		}
	}

	return fmt.Errorf("consumer channel closed")
}

func (w *Worker) processJob(msg amqp091.Delivery) error {
	var job DeploymentJob
	if err := json.Unmarshal(msg.Body, &job); err != nil {
		return fmt.Errorf("failed to unmarshal job: %w", err)
	}

	log.Printf("📋 Processing deployment job: %s for project: %s", job.JobID, job.ProjectID)

	// Check rate limits
	limits := security.BuildLimits{
		MaxConcurrent: 5,
		MaxPerMonth:    20,
	}

	if err := w.rateLimiter.CheckAndIncrementBuildLimit(context.Background(), job.ProjectID, limits); err != nil {
		return w.publishResult(JobResult{
			JobID:       job.JobID,
			Status:      "failed",
			Message:     "Rate limit exceeded",
			Error:       err.Error(),
			CompletedAt: time.Now(),
		})
	}

	// Update job status in database
	if err := w.updateJobStatus(job.JobID, "processing"); err != nil {
		log.Printf("Failed to update job status: %v", err)
	}

	// Get build artifact from storage
	artifact, err := w.storage.GetBuildArtifact(context.Background(), job.ProjectID, job.BuildID)
	if err != nil {
		return w.publishResult(JobResult{
			JobID:       job.JobID,
			Status:      "failed",
			Message:     "Failed to get build artifact",
			Error:       err.Error(),
			CompletedAt: time.Now(),
		})
	}

	// Simulate deployment process (replace with actual deployment logic)
	result := w.simulateDeployment(job, artifact)

	// Publish result
	return w.publishResult(result)
}

func (w *Worker) simulateDeployment(job DeploymentJob, artifact *storage.BuildArtifact) JobResult {
	log.Printf("🚀 Starting deployment for job: %s", job.JobID)

	// Simulate deployment phases
	phases := []string{"validating", "building", "deploying", "health_checking", "switching_traffic"}

	for _, phase := range phases {
		w.updateJobStatus(job.JobID, phase)
		log.Printf("📊 Deployment phase: %s", phase)
		time.Sleep(2 * time.Second) // Simulate work
	}

	// Simulate success (in real implementation, this would be actual deployment logic)
	containerID := fmt.Sprintf("container_%s_%d", job.JobID, time.Now().Unix())

	return JobResult{
		JobID:       job.JobID,
		Status:      "success",
		Message:     "Deployment completed successfully",
		ContainerID: containerID,
		CompletedAt: time.Now(),
	}
}

func (w *Worker) publishResult(result JobResult) error {
	body, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal result: %w", err)
	}

	err = w.channel.Publish(
		w.exchange,          // exchange
		"deployment.result", // routing key
		false,               // mandatory
		false,               // immediate
		amqp091.Publishing{
			ContentType: "application/json",
			Body:        body,
			Timestamp:   time.Now(),
		})
	if err != nil {
		return fmt.Errorf("failed to publish result: %w", err)
	}

	log.Printf("📤 Published deployment result: %s - %s", result.JobID, result.Status)
	return nil
}

func (w *Worker) updateJobStatus(jobID, status string) error {
	query := `
		UPDATE deployment_jobs 
		SET status = $1, updated_at = $2 
		WHERE job_id = $3
	`

	_, err := w.db.Exec(query, status, time.Now(), jobID)
	if err != nil {
		log.Printf("Failed to update job status in database: %v", err)
		return err
	}

	return nil
}

func (w *Worker) Close() error {
	if w.channel != nil {
		w.channel.Close()
	}
	if w.conn != nil {
		w.conn.Close()
	}
	return nil
}
