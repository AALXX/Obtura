package rabbitmq

import (
	"fmt"

	"github.com/rabbitmq/amqp091-go"
)

type Client struct {
	conn    *amqp091.Connection
	channel *amqp091.Channel
}

func NewClient(url string) (*Client, error) {
	conn, err := amqp091.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open channel: %w", err)
	}

	// Declare exchanges and queues
	err = declareDeploymentExchanges(ch)
	if err != nil {
		ch.Close()
		conn.Close()
		return nil, fmt.Errorf("failed to declare exchanges: %w", err)
	}

	return &Client{
		conn:    conn,
		channel: ch,
	}, nil
}

func declareDeploymentExchanges(ch *amqp091.Channel) error {
	// Declare deployment exchange
	err := ch.ExchangeDeclare(
		"obtura.deployments", // name
		"topic",              // type
		true,                 // durable
		false,                // auto-deleted
		false,                // internal
		false,                // no-wait
		nil,                  // arguments
	)
	if err != nil {
		return fmt.Errorf("failed to declare deployment exchange: %w", err)
	}

	// Declare deployment queue
	_, err = ch.QueueDeclare(
		"deployments.pending", // name
		true,                  // durable
		false,                 // delete when unused
		false,                 // exclusive
		false,                 // no-wait
		nil,                   // arguments
	)
	if err != nil {
		return fmt.Errorf("failed to declare deployment queue: %w", err)
	}

	// Bind queue to exchange
	err = ch.QueueBind(
		"deployments.pending", // queue name
		"deployment.job",      // routing key
		"obtura.deployments",  // exchange
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to bind deployment queue: %w", err)
	}

	// Declare deployment DLQ
	_, err = ch.QueueDeclare(
		"deployments.dlq", // name
		true,              // durable
		false,             // delete when unused
		false,             // exclusive
		false,             // no-wait
		amqp091.Table{
			"x-message-ttl": 604800000, // 7 days in milliseconds
		},
	)
	if err != nil {
		return fmt.Errorf("failed to declare deployment DLQ: %w", err)
	}

	return nil
}

func (c *Client) Channel() (*amqp091.Channel, error) {
	return c.channel, nil
}

func (c *Client) Close() error {
	if c.channel != nil {
		c.channel.Close()
	}
	if c.conn != nil {
		c.conn.Close()
	}
	return nil
}

func (c *Client) PublishDeploymentJob(job interface{}) error {
	// This would be implemented to publish deployment jobs
	return nil
}
