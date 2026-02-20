package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"ai-agent-service/internal/analyzer"

	amqp "github.com/streadway/amqp"
)

type BuildWorker struct {
	conn      *amqp.Connection
	channel   *amqp.Channel
	analyzer  *analyzer.BuildAnalyzer
	queueName string
}

type BuildEvent struct {
	BuildID    string `json:"buildId"`
	ProjectID  string `json:"projectId"`
	Status     string `json:"status"`
	CommitHash string `json:"commitHash"`
	Branch     string `json:"branch"`
}

func NewBuildWorker(rabbitmqURL string, buildAnalyzer *analyzer.BuildAnalyzer) (*BuildWorker, error) {
	conn, err := amqp.Dial(rabbitmqURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open channel: %w", err)
	}

	return &BuildWorker{
		conn:      conn,
		channel:   ch,
		analyzer:  buildAnalyzer,
		queueName: "ai-build-analysis",
	}, nil
}

func (w *BuildWorker) Setup() error {
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
		return fmt.Errorf("failed to declare exchange: %w", err)
	}

	_, err = w.channel.QueueDeclare(
		w.queueName,
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to declare queue: %w", err)
	}

	err = w.channel.QueueBind(
		w.queueName,
		"build.completed",
		"obtura.builds",
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to bind queue: %w", err)
	}

	return nil
}

func (w *BuildWorker) Start(ctx context.Context) error {
	msgs, err := w.channel.Consume(
		w.queueName,
		"",
		false,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to start consuming: %w", err)
	}

	log.Printf("✅ Build worker listening for messages on queue: %s", w.queueName)

	for {
		select {
		case <-ctx.Done():
			log.Println("🛑 Build worker shutting down...")
			return nil
		case msg, ok := <-msgs:
			if !ok {
				return fmt.Errorf("channel closed")
			}
			w.handleMessage(msg)
		}
	}
}

func (w *BuildWorker) handleMessage(msg amqp.Delivery) {
	var event BuildEvent
	if err := json.Unmarshal(msg.Body, &event); err != nil {
		log.Printf("❌ Failed to parse build event: %v", err)
		msg.Nack(false, false)
		return
	}

	log.Printf("📥 Received build event: %s (status: %s)", event.BuildID, event.Status)

	// Only analyze failed builds or builds with warnings
	if event.Status != "failed" && event.Status != "completed_with_warnings" {
		log.Printf("⏭️ Skipping analysis for build %s (status: %s)", event.BuildID, event.Status)
		msg.Ack(false)
		return
	}

	// Run analysis asynchronously
	go w.analyzer.AnalyzeBuildAuto(event.ProjectID, event.BuildID)

	msg.Ack(false)
}

func (w *BuildWorker) Close() error {
	if w.channel != nil {
		w.channel.Close()
	}
	if w.conn != nil {
		w.conn.Close()
	}
	return nil
}
