package deployment_logger

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Message types for different deployment events
type DeploymentLogMessage struct {
	Type         string    `json:"type"` // info, success, error, warning
	Message      string    `json:"message"`
	Timestamp    time.Time `json:"timestamp"`
	DeploymentID string    `json:"deploymentId"`
}

type DeploymentPhaseMessage struct {
	Phase        string                 `json:"phase"` // preparing, deploying_new, health_checking, switching_traffic, etc.
	Message      string                 `json:"message"`
	Timestamp    time.Time              `json:"timestamp"`
	DeploymentID string                 `json:"deploymentId"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

type ContainerEventMessage struct {
	ContainerID   string    `json:"containerId"`
	ContainerName string    `json:"containerName"`
	Status        string    `json:"status"` // starting, running, healthy, stopped
	Health        string    `json:"health"` // healthy, unhealthy, starting
	Message       string    `json:"message"`
	Timestamp     time.Time `json:"timestamp"`
	DeploymentID  string    `json:"deploymentId"`
	Group         string    `json:"group"` // blue, green, canary, stable
}

type TrafficRoutingMessage struct {
	RoutingGroup      string    `json:"routingGroup"` // blue, green, canary
	TrafficPercentage int       `json:"trafficPercentage"`
	ActiveContainers  []string  `json:"activeContainers"`
	Message           string    `json:"message"`
	Timestamp         time.Time `json:"timestamp"`
	DeploymentID      string    `json:"deploymentId"`
}

type DeploymentCompleteMessage struct {
	Status       string    `json:"status"` // active, failed, rolled_back
	Message      string    `json:"message"`
	Timestamp    time.Time `json:"timestamp"`
	DeploymentID string    `json:"deploymentId"`
	Duration     string    `json:"duration,omitempty"`
	ErrorMessage string    `json:"errorMessage,omitempty"`
}

type DeploymentBroker struct {
	clients    map[string]map[chan interface{}]bool
	newClients chan clientSubscription
	closing    chan clientSubscription
	messages   chan interface{}
	mu         sync.RWMutex
	db         *sql.DB
}

type clientSubscription struct {
	deploymentID string
	client       chan interface{}
}

var globalDeploymentBroker *DeploymentBroker

func InitDeploymentBroker(db *sql.DB) {
	globalDeploymentBroker = &DeploymentBroker{
		clients:    make(map[string]map[chan interface{}]bool),
		newClients: make(chan clientSubscription),
		closing:    make(chan clientSubscription),
		messages:   make(chan interface{}, 100),
		db:         db,
	}
	go globalDeploymentBroker.Start()
	log.Println("✅ Deployment broker initialized with database support")
}

func (b *DeploymentBroker) Start() {
	for {
		select {
		case sub := <-b.newClients:
			b.mu.Lock()
			if b.clients[sub.deploymentID] == nil {
				b.clients[sub.deploymentID] = make(map[chan interface{}]bool)
			}
			b.clients[sub.deploymentID][sub.client] = true
			b.mu.Unlock()
			log.Printf("📡 New SSE client connected for deployment %s (total: %d)",
				sub.deploymentID, len(b.clients[sub.deploymentID]))

		case sub := <-b.closing:
			b.mu.Lock()
			if clients, ok := b.clients[sub.deploymentID]; ok {
				delete(clients, sub.client)
				close(sub.client)
				if len(clients) == 0 {
					delete(b.clients, sub.deploymentID)
				}
			}
			b.mu.Unlock()
			log.Printf("📡 SSE client disconnected for deployment %s", sub.deploymentID)

		case msg := <-b.messages:
			var deploymentID string

			// Extract deployment ID from different message types
			switch m := msg.(type) {
			case DeploymentLogMessage:
				deploymentID = m.DeploymentID
			case DeploymentPhaseMessage:
				deploymentID = m.DeploymentID
			case ContainerEventMessage:
				deploymentID = m.DeploymentID
			case TrafficRoutingMessage:
				deploymentID = m.DeploymentID
			case DeploymentCompleteMessage:
				deploymentID = m.DeploymentID
			}

			b.mu.RLock()
			if clients, ok := b.clients[deploymentID]; ok {
				for client := range clients {
					select {
					case client <- msg:
					case <-time.After(100 * time.Millisecond):
						log.Printf("⚠️ Client timeout for deployment %s", deploymentID)
					}
				}
			}
			b.mu.RUnlock()
		}
	}
}

// Helper function to save events to database
func (b *DeploymentBroker) saveEventToDB(deploymentID, eventType, message, severity string) {
	if b.db == nil {
		return
	}

	query := `
		INSERT INTO deployment_events (deployment_id, event_type, event_message, severity)
		VALUES ($1, $2, $3, $4)
	`

	_, err := b.db.Exec(query, deploymentID, eventType, message, severity)
	if err != nil {
		log.Printf("[error] failed to save deployment event to DB: %v", err)
	}
}

// Publish methods for different event types
func (b *DeploymentBroker) PublishLog(deploymentID, logType, message string) {
	msg := DeploymentLogMessage{
		Type:         logType,
		Message:      message,
		Timestamp:    time.Now(),
		DeploymentID: deploymentID,
	}

	select {
	case b.messages <- msg:
	case <-time.After(100 * time.Millisecond):
		log.Printf("⚠️ Failed to publish log for deployment %s: broker busy", deploymentID)
	}

	// Save to database
	b.saveEventToDB(deploymentID, "log", message, logType)
}

func (b *DeploymentBroker) PublishPhase(deploymentID, phase, message string, metadata map[string]interface{}) {
	msg := DeploymentPhaseMessage{
		Phase:        phase,
		Message:      message,
		Timestamp:    time.Now(),
		DeploymentID: deploymentID,
		Metadata:     metadata,
	}

	select {
	case b.messages <- msg:
	case <-time.After(100 * time.Millisecond):
		log.Printf("⚠️ Failed to publish phase for deployment %s: broker busy", deploymentID)
	}

	// Save to database with metadata
	phaseMsg := fmt.Sprintf("Phase: %s - %s", phase, message)
	if metadata != nil {
		metadataJSON, _ := json.Marshal(metadata)
		phaseMsg = fmt.Sprintf("%s (metadata: %s)", phaseMsg, string(metadataJSON))
	}
	b.saveEventToDB(deploymentID, "phase", phaseMsg, "info")
}

func (b *DeploymentBroker) PublishContainerEvent(deploymentID, containerID, containerName, status, health, group, message string) {
	msg := ContainerEventMessage{
		ContainerID:   containerID,
		ContainerName: containerName,
		Status:        status,
		Health:        health,
		Message:       message,
		Timestamp:     time.Now(),
		DeploymentID:  deploymentID,
		Group:         group,
	}

	select {
	case b.messages <- msg:
	case <-time.After(100 * time.Millisecond):
		log.Printf("⚠️ Failed to publish container event for deployment %s: broker busy", deploymentID)
	}

	// Save to database
	containerMsg := fmt.Sprintf("Container %s (%s): %s - health: %s, status: %s",
		containerName, group, message, health, status)
	severity := "info"
	if health == "unhealthy" {
		severity = "error"
	} else if health == "healthy" {
		severity = "success"
	}
	b.saveEventToDB(deploymentID, "container", containerMsg, severity)
}

func (b *DeploymentBroker) PublishTrafficRouting(deploymentID, routingGroup string, trafficPercentage int, activeContainers []string, message string) {
	msg := TrafficRoutingMessage{
		RoutingGroup:      routingGroup,
		TrafficPercentage: trafficPercentage,
		ActiveContainers:  activeContainers,
		Message:           message,
		Timestamp:         time.Now(),
		DeploymentID:      deploymentID,
	}

	select {
	case b.messages <- msg:
	case <-time.After(100 * time.Millisecond):
		log.Printf("⚠️ Failed to publish traffic routing for deployment %s: broker busy", deploymentID)
	}

	// Save to database
	trafficMsg := fmt.Sprintf("Traffic routing: %d%% to %s group (%d containers) - %s",
		trafficPercentage, routingGroup, len(activeContainers), message)
	b.saveEventToDB(deploymentID, "traffic", trafficMsg, "info")
}

func (b *DeploymentBroker) PublishComplete(deploymentID, status, message string, duration string, errorMessage string) {
	msg := DeploymentCompleteMessage{
		Status:       status,
		Message:      message,
		Timestamp:    time.Now(),
		DeploymentID: deploymentID,
		Duration:     duration,
		ErrorMessage: errorMessage,
	}

	select {
	case b.messages <- msg:
	case <-time.After(100 * time.Millisecond):
		log.Printf("⚠️ Failed to publish completion for deployment %s", deploymentID)
	}

	// Save to database
	completeMsg := fmt.Sprintf("Deployment completed: %s - %s (duration: %s)", status, message, duration)
	if errorMessage != "" {
		completeMsg = fmt.Sprintf("%s - error: %s", completeMsg, errorMessage)
	}
	severity := "success"
	if status == "failed" {
		severity = "error"
	}
	b.saveEventToDB(deploymentID, "complete", completeMsg, severity)

	// Close connections after a delay
	time.AfterFunc(1*time.Second, func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		if clients, ok := b.clients[deploymentID]; ok {
			for client := range clients {
				close(client)
			}
			delete(b.clients, deploymentID)
			log.Printf("📡 Closed all SSE connections for completed deployment %s", deploymentID)
		}
	})
}

// SSE Handler
func HandleDeploymentLogsSSE(c *gin.Context) {
	deploymentID := c.Param("deploymentId")

	if deploymentID == "" {
		c.JSON(400, gin.H{"error": "Deployment ID is required"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	client := make(chan interface{}, 10)

	globalDeploymentBroker.newClients <- clientSubscription{
		deploymentID: deploymentID,
		client:       client,
	}

	c.SSEvent("connected", gin.H{"deploymentId": deploymentID, "message": "Connected to deployment logs"})
	c.Writer.Flush()

	ctx := c.Request.Context()
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			globalDeploymentBroker.closing <- clientSubscription{
				deploymentID: deploymentID,
				client:       client,
			}
			return

		case <-heartbeat.C:
			c.SSEvent("heartbeat", gin.H{"time": time.Now().Unix()})
			c.Writer.Flush()

		case msg, ok := <-client:
			if !ok {
				log.Printf("📡 Client channel closed for deployment %s", deploymentID)
				return
			}

			// Handle different message types
			switch m := msg.(type) {
			case DeploymentLogMessage:
				data, _ := json.Marshal(m)
				fmt.Fprintf(c.Writer, "event: log\ndata: %s\n\n", data)
				c.Writer.Flush()

			case DeploymentPhaseMessage:
				data, _ := json.Marshal(m)
				fmt.Fprintf(c.Writer, "event: phase\ndata: %s\n\n", data)
				c.Writer.Flush()

			case ContainerEventMessage:
				data, _ := json.Marshal(m)
				fmt.Fprintf(c.Writer, "event: container\ndata: %s\n\n", data)
				c.Writer.Flush()

			case TrafficRoutingMessage:
				data, _ := json.Marshal(m)
				fmt.Fprintf(c.Writer, "event: traffic\ndata: %s\n\n", data)
				c.Writer.Flush()

			case DeploymentCompleteMessage:
				data, _ := json.Marshal(m)
				fmt.Fprintf(c.Writer, "event: complete\ndata: %s\n\n", data)
				c.Writer.Flush()
				return
			}
		}
	}
}

func GetDeploymentBroker() *DeploymentBroker {
	return globalDeploymentBroker
}