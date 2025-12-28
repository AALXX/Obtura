package worker

import (
	"bufio"
	"build-service/internal/builder"
	"build-service/internal/git"
	"build-service/pkg"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	amqp "github.com/rabbitmq/amqp091-go"
)

type Worker struct {
	conn    *amqp.Connection
	channel *amqp.Channel
}

func NewWorker(rabbitmqURL string) (*Worker, error) {
	conn, err := amqp.Dial(rabbitmqURL)
	if err != nil {
		return nil, err
	}

	channel, err := conn.Channel()
	if err != nil {
		return nil, err
	}

	return &Worker{
		conn:    conn,
		channel: channel,
	}, nil
}

func (w *Worker) Start() error {
	err := w.channel.ExchangeDeclare(
		"obtura.builds",
		"topic",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	queue, err := w.channel.QueueDeclare(
		"build-queue",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	err = w.channel.QueueBind(
		queue.Name,
		"build.triggered",
		"obtura.builds",
		false,
		nil,
	)
	if err != nil {
		return err
	}

	messages, err := w.channel.Consume(
		queue.Name,
		"",
		false,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	log.Println("✅ Build Service is now listening for messages...")

	for msg := range messages {
		log.Printf("📨 Received message: %s", string(msg.Body))

		go w.handleBuildJob(msg)
	}

	return nil
}

func (w *Worker) handleBuildJob(msg amqp.Delivery) {
	var job struct {
		GitURL     string `json:"gitUrl"`
		BuildID    string `json:"buildId"`
		ProjectID  string `json:"projectId"`
		CommitHash string `json:"commitHash"`
		Branch     string `json:"branch"`
	}

	err := json.Unmarshal(msg.Body, &job)
	if err != nil {
		log.Printf("❌ Failed to parse message: %v", err)
		msg.Nack(false, false)
		return
	}

	log.Printf("🔨 Building project %d, build %d...", job.ProjectID, job.BuildID)

	workDir := fmt.Sprintf("/tmp/builds/%s", job.BuildID)
	if err := git.CloneRepository(job.GitURL, job.Branch, workDir); err != nil {
		log.Printf("❌ Failed to clone repository: %v", err)
		return
	}
	defer os.RemoveAll(workDir)

	framework, err := builder.DetectFramework(workDir)
	if err != nil {
		fmt.Printf("failed to detect framework: %w", err)
		return
	}
	// w.streamLog(job.BuildID, fmt.Sprintf("Detected framework: %s", framework.Name))
	// w.db.UpdateBuildFramework(job.BuildID, framework.Name)

	dockerfilePath := filepath.Join(workDir, "Dockerfile")
	if !pkg.FileExists(dockerfilePath) {
		dockerfile, err := builder.GenerateDockerfile(framework, workDir)
		if err != nil {
			fmt.Printf("failed to generate Dockerfile: %w", err)
			return
		}
		os.WriteFile(dockerfilePath, []byte(dockerfile), 0644)
		w.streamLog(job.BuildID, "Generated Dockerfile")
	}

	imageTag := fmt.Sprintf("obtura/%s:%s", job.ProjectID, job.BuildID)

	buildOutput, err := builder.BuildImage(ctx, workDir, imageTag)
	if err != nil {
		fmt.Errorf("docker build failed: %w", err)
		return
	}

	scanner := bufio.NewScanner(buildOutput)
	for scanner.Scan() {
		w.streamLog(job.BuildID, scanner.Text())
	}

	w.streamLog(job.BuildID, "Pushing image to registry...")
	if err := w.builder.PushImage(ctx, imageTag); err != nil {
		return fmt.Errorf("image push failed: %w", err)
	}

	w.db.UpdateBuildImageTag(job.BuildID, imageTag)

	return 
}
