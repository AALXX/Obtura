package platformlog

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/streadway/amqp"
)

// RabbitMQTransport sends logs via RabbitMQ
type RabbitMQTransport struct {
	connection *amqp.Connection
	channel    *amqp.Channel
	queueName  string
	exchange   string
}

// NewRabbitMQTransport creates a RabbitMQ transport for logging
func NewRabbitMQTransport(amqpURL, queueName string) (*RabbitMQTransport, error) {
	conn, err := amqp.Dial(amqpURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open channel: %w", err)
	}

	// Declare exchange for fanout to multiple consumers
	exchange := "platform.logs"
	err = ch.ExchangeDeclare(
		exchange,
		"topic", // topic exchange for routing by event type
		true,    // durable
		false,   // auto-deleted
		false,   // internal
		false,   // no-wait
		nil,
	)
	if err != nil {
		ch.Close()
		conn.Close()
		return nil, fmt.Errorf("failed to declare exchange: %w", err)
	}

	return &RabbitMQTransport{
		connection: conn,
		channel:    ch,
		queueName:  queueName,
		exchange:   exchange,
	}, nil
}

// Send publishes log events to RabbitMQ
func (r *RabbitMQTransport) Send(ctx context.Context, events []LogEvent) error {
	for _, event := range events {
		body, err := json.Marshal(event)
		if err != nil {
			return fmt.Errorf("failed to marshal log event: %w", err)
		}

		// Route by event type: platform.logs.build, platform.logs.deployment, etc.
		routingKey := fmt.Sprintf("%s.%s", r.exchange, event.EventType)

		err = r.channel.Publish(
			r.exchange,
			routingKey,
			false, // mandatory
			false, // immediate
			amqp.Publishing{
				ContentType:  "application/json",
				Body:         body,
				Timestamp:    event.EventTimestamp,
				DeliveryMode: amqp.Persistent,
				Headers: amqp.Table{
					"event_type":    string(event.EventType),
					"event_subtype": string(event.EventSubtype),
					"severity":      string(event.Severity),
					"resource_id":   event.ResourceID,
					"project_id":    event.ProjectID,
					"company_id":    event.CompanyID,
				},
			},
		)
		if err != nil {
			return fmt.Errorf("failed to publish log event: %w", err)
		}
	}

	return nil
}

// Close closes the RabbitMQ connection
func (r *RabbitMQTransport) Close() error {
	if r.channel != nil {
		r.channel.Close()
	}
	if r.connection != nil {
		return r.connection.Close()
	}
	return nil
}
