// Package platformlog provides a unified logging SDK for all platform services
// to publish client-facing logs (builds, deployments, container logs, etc.)
package platformlog

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
)

// LogEventType represents the high-level category of log events
type LogEventType string

const (
	EventTypeBuild      LogEventType = "build"
	EventTypeDeployment LogEventType = "deployment"
	EventTypeContainer  LogEventType = "container"
	EventTypeSystem     LogEventType = "system"
	EventTypeSecurity   LogEventType = "security"
	EventTypeAudit      LogEventType = "audit"
)

// LogEventSubtype represents specific event types
type LogEventSubtype string

const (
	// Build events
	SubtypeBuildStart    LogEventSubtype = "build_start"
	SubtypeBuildStep     LogEventSubtype = "build_step"
	SubtypeBuildComplete LogEventSubtype = "build_complete"
	SubtypeBuildError    LogEventSubtype = "build_error"
	SubtypeBuildCancel   LogEventSubtype = "build_cancel"

	// Deployment events
	SubtypeDeployStart    LogEventSubtype = "deploy_start"
	SubtypeDeployStep     LogEventSubtype = "deploy_step"
	SubtypeDeployComplete LogEventSubtype = "deploy_complete"
	SubtypeDeployError    LogEventSubtype = "deploy_error"
	SubtypeDeployRollback LogEventSubtype = "deploy_rollback"
	SubtypeHealthCheck    LogEventSubtype = "health_check"
	SubtypeTrafficSwitch  LogEventSubtype = "traffic_switch"

	// Container events
	SubtypeContainerStart   LogEventSubtype = "container_start"
	SubtypeContainerLog     LogEventSubtype = "container_log"
	SubtypeContainerHealth  LogEventSubtype = "container_health"
	SubtypeContainerRestart LogEventSubtype = "container_restart"
	SubtypeContainerStop    LogEventSubtype = "container_stop"

	// System events
	SubtypeSystemStartup  LogEventSubtype = "system_startup"
	SubtypeSystemShutdown LogEventSubtype = "system_shutdown"
	SubtypeQueueJob       LogEventSubtype = "queue_job"
	SubtypeConfigChange   LogEventSubtype = "config_change"

	// Security events
	SubtypeLogin      LogEventSubtype = "login"
	SubtypeLogout     LogEventSubtype = "logout"
	SubtypePermission LogEventSubtype = "permission_change"
	SubtypeApiKey     LogEventSubtype = "api_key_action"
)

// Severity represents log severity levels
type Severity string

const (
	SeverityDebug   Severity = "debug"
	SeverityInfo    Severity = "info"
	SeverityWarning Severity = "warning"
	SeverityError   Severity = "error"
	SeverityFatal   Severity = "fatal"
)

// ResourceType represents the type of resource being logged
type ResourceType string

const (
	ResourceTypeBuild      ResourceType = "build"
	ResourceTypeDeployment ResourceType = "deployment"
	ResourceTypeProject    ResourceType = "project"
	ResourceTypeCompany    ResourceType = "company"
	ResourceTypeSystem     ResourceType = "system"
)

// LogEvent represents a unified platform log event
type LogEvent struct {
	ID             string          `json:"id"`
	EventType      LogEventType    `json:"event_type"`
	EventSubtype   LogEventSubtype `json:"event_subtype"`
	ResourceType   ResourceType    `json:"resource_type"`
	ResourceID     string          `json:"resource_id"`
	ProjectID      string          `json:"project_id,omitempty"`
	CompanyID      string          `json:"company_id,omitempty"`
	ContainerID    string          `json:"container_id,omitempty"`
	ContainerName  string          `json:"container_name,omitempty"`
	Severity       Severity        `json:"severity"`
	Message        string          `json:"message"`
	Metadata       Metadata        `json:"metadata,omitempty"`
	SourceService  string          `json:"source_service"`
	SourceHost     string          `json:"source_host,omitempty"`
	EventTimestamp time.Time       `json:"event_timestamp"`
	IngestedAt     time.Time       `json:"ingested_at,omitempty"`
}

// Metadata holds type-specific metadata
type Metadata struct {
	// Build metadata
	BuildID     string `json:"build_id,omitempty"`
	BuildNumber int    `json:"build_number,omitempty"`
	CommitHash  string `json:"commit_hash,omitempty"`
	Branch      string `json:"branch,omitempty"`
	StepName    string `json:"step_name,omitempty"`
	StepNumber  int    `json:"step_number,omitempty"`
	TotalSteps  int    `json:"total_steps,omitempty"`
	DurationMs  int64  `json:"duration_ms,omitempty"`
	ExitCode    int    `json:"exit_code,omitempty"`

	// Deployment metadata
	DeploymentID     string `json:"deployment_id,omitempty"`
	Environment      string `json:"environment,omitempty"`
	Strategy         string `json:"strategy,omitempty"`
	HealthCheckURL   string `json:"health_check_url,omitempty"`
	TrafficPercent   int    `json:"traffic_percentage,omitempty"`
	PreviousDeployID string `json:"previous_deployment_id,omitempty"`
	Image            string `json:"image,omitempty"`
	Port             int    `json:"port,omitempty"`

	// Container metadata
	ContainerID     string  `json:"container_id,omitempty"`
	ContainerName   string  `json:"container_name,omitempty"`
	CPUUsagePercent float64 `json:"cpu_usage_percent,omitempty"`
	MemoryUsageMB   int     `json:"memory_usage_mb,omitempty"`
	RestartCount    int     `json:"restart_count,omitempty"`

	// System metadata
	Component string `json:"component,omitempty"`
	Operation string `json:"operation,omitempty"`
	QueueName string `json:"queue_name,omitempty"`
	JobID     string `json:"job_id,omitempty"`

	// Security metadata
	UserID    string `json:"user_id,omitempty"`
	Action    string `json:"action,omitempty"`
	IPAddress string `json:"ip_address,omitempty"`
	UserAgent string `json:"user_agent,omitempty"`
	Success   bool   `json:"success,omitempty"`

	// Generic extra fields
	Extra map[string]interface{} `json:"extra,omitempty"`
}

// Client represents a platform logging client
type Client struct {
	serviceName string
	hostname    string
	transports  []Transport
	buffer      chan LogEvent
}

// Transport interface for different log delivery methods
type Transport interface {
	Send(ctx context.Context, events []LogEvent) error
	Close() error
}

// generateID creates a UUID-based unique ID
func generateID() string {
	id, err := uuid.NewRandom()
	if err != nil {
		// Fallback to timestamp-based ID if UUID generation fails
		return fmt.Sprintf("%d-%d", time.Now().UnixNano(), os.Getpid())
	}
	return id.String()
}

// isValidUUID checks if a string is a valid UUID
func isValidUUID(s string) bool {
	// Remove any whitespace and convert to lowercase
	s = strings.TrimSpace(strings.ToLower(s))

	// Parse the UUID
	_, err := uuid.Parse(s)
	return err == nil
}

// NewClient creates a new logging client
func NewClient(serviceName string, transports ...Transport) *Client {
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "unknown"
	}

	c := &Client{
		serviceName: serviceName,
		hostname:    hostname,
		transports:  transports,
		buffer:      make(chan LogEvent, 1000),
	}

	// Start background sender
	go c.backgroundSender()

	return c
}

// Log creates and sends a log event
func (c *Client) Log(ctx context.Context, eventType LogEventType, subtype LogEventSubtype,
	resourceType ResourceType, resourceID string, severity Severity, message string, meta Metadata) error {

	// Validate and sanitize resource ID to be a valid UUID
	validResourceID := resourceID
	if resourceID == "" {
		// Generate a placeholder UUID if resource ID is empty
		validResourceID = generateID()
	} else if !isValidUUID(resourceID) {
		// If resourceID is not a valid UUID, log a warning and use placeholder
		fmt.Fprintf(os.Stderr, "Warning: Invalid resource ID '%s' for %s event, using placeholder UUID\n", resourceID, string(eventType))
		validResourceID = generateID()
	}

	event := LogEvent{
		ID:             generateID(),
		EventType:      eventType,
		EventSubtype:   subtype,
		ResourceType:   resourceType,
		ResourceID:     validResourceID,
		Severity:       severity,
		Message:        message,
		Metadata:       meta,
		SourceService:  c.serviceName,
		SourceHost:     c.hostname,
		EventTimestamp: time.Now().UTC(),
	}

	select {
	case c.buffer <- event:
		return nil
	default:
		return fmt.Errorf("log buffer full, dropping event")
	}
}

// Build logging helpers
func (c *Client) BuildStart(ctx context.Context, buildID, projectID, companyID string, buildNumber int, commitHash, branch string) error {
	return c.Log(ctx, EventTypeBuild, SubtypeBuildStart, ResourceTypeBuild, buildID,
		SeverityInfo, fmt.Sprintf("Build #%d started for branch %s", buildNumber, branch),
		Metadata{
			BuildID:     buildID,
			BuildNumber: buildNumber,
			CommitHash:  commitHash,
			Branch:      branch,
		})
}

func (c *Client) BuildStep(ctx context.Context, buildID string, stepName string, stepNumber, totalSteps int, message string) error {
	return c.Log(ctx, EventTypeBuild, SubtypeBuildStep, ResourceTypeBuild, buildID,
		SeverityInfo, message,
		Metadata{
			BuildID:    buildID,
			StepName:   stepName,
			StepNumber: stepNumber,
			TotalSteps: totalSteps,
		})
}

func (c *Client) BuildComplete(ctx context.Context, buildID string, success bool, durationMs int64) error {
	severity := SeverityInfo
	message := fmt.Sprintf("Build completed successfully in %v", time.Duration(durationMs)*time.Millisecond)

	if !success {
		severity = SeverityError
		message = fmt.Sprintf("Build failed after %v", time.Duration(durationMs)*time.Millisecond)
	}

	return c.Log(ctx, EventTypeBuild, SubtypeBuildComplete, ResourceTypeBuild, buildID,
		severity, message,
		Metadata{
			BuildID:    buildID,
			DurationMs: durationMs,
		})
}

func (c *Client) BuildError(ctx context.Context, buildID string, stepName string, err error) error {
	return c.Log(ctx, EventTypeBuild, SubtypeBuildError, ResourceTypeBuild, buildID,
		SeverityError, fmt.Sprintf("Build error in step '%s': %v", stepName, err),
		Metadata{
			BuildID:  buildID,
			StepName: stepName,
		})
}

// Deployment logging helpers
func (c *Client) DeployStart(ctx context.Context, deploymentID, projectID, companyID, environment, strategy string) error {
	return c.Log(ctx, EventTypeDeployment, SubtypeDeployStart, ResourceTypeDeployment, deploymentID,
		SeverityInfo, fmt.Sprintf("Deployment to %s started using %s strategy", environment, strategy),
		Metadata{
			DeploymentID: deploymentID,
			Environment:  environment,
			Strategy:     strategy,
		})
}

func (c *Client) DeployStep(ctx context.Context, deploymentID, stepName string, message string) error {
	return c.Log(ctx, EventTypeDeployment, SubtypeDeployStep, ResourceTypeDeployment, deploymentID,
		SeverityInfo, message,
		Metadata{
			DeploymentID: deploymentID,
		})
}

func (c *Client) DeployComplete(ctx context.Context, deploymentID string, success bool, durationMs int64) error {
	severity := SeverityInfo
	message := fmt.Sprintf("Deployment completed successfully in %v", time.Duration(durationMs)*time.Millisecond)

	if !success {
		severity = SeverityError
		message = fmt.Sprintf("Deployment failed after %v", time.Duration(durationMs)*time.Millisecond)
	}

	return c.Log(ctx, EventTypeDeployment, SubtypeDeployComplete, ResourceTypeDeployment, deploymentID,
		severity, message,
		Metadata{
			DeploymentID: deploymentID,
			DurationMs:   durationMs,
		})
}

func (c *Client) HealthCheck(ctx context.Context, deploymentID, containerID string, healthy bool, responseTimeMs int) error {
	severity := SeverityInfo
	if !healthy {
		severity = SeverityWarning
	}

	status := "passed"
	if !healthy {
		status = "failed"
	}

	return c.Log(ctx, EventTypeDeployment, SubtypeHealthCheck, ResourceTypeDeployment, deploymentID,
		severity, fmt.Sprintf("Health check %s (response time: %dms)", status, responseTimeMs),
		Metadata{
			DeploymentID: deploymentID,
			ContainerID:  containerID,
		})
}

// Container logging helpers
func (c *Client) ContainerLog(ctx context.Context, deploymentID, containerID, containerName, message string, severity Severity) error {
	return c.Log(ctx, EventTypeContainer, SubtypeContainerLog, ResourceTypeDeployment, deploymentID,
		severity, message,
		Metadata{
			DeploymentID:  deploymentID,
			ContainerID:   containerID,
			ContainerName: containerName,
		})
}

func (c *Client) ContainerRestart(ctx context.Context, deploymentID, containerID string, restartCount int, reason string) error {
	return c.Log(ctx, EventTypeContainer, SubtypeContainerRestart, ResourceTypeDeployment, deploymentID,
		SeverityWarning, fmt.Sprintf("Container restarted (count: %d): %s", restartCount, reason),
		Metadata{
			DeploymentID: deploymentID,
			ContainerID:  containerID,
			RestartCount: restartCount,
		})
}

// System logging helpers
func (c *Client) SystemEvent(ctx context.Context, component, operation string, message string) error {
	return c.Log(ctx, EventTypeSystem, SubtypeSystemStartup, ResourceTypeSystem, component,
		SeverityInfo, message,
		Metadata{
			Component: component,
			Operation: operation,
		})
}

// backgroundSender processes the log buffer asynchronously
func (c *Client) backgroundSender() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	batch := make([]LogEvent, 0, 100)

	for {
		select {
		case event, ok := <-c.buffer:
			if !ok {
				// Channel closed, send remaining batch
				if len(batch) > 0 {
					c.sendBatch(batch)
				}
				return
			}
			batch = append(batch, event)

			if len(batch) >= 100 {
				c.sendBatch(batch)
				batch = make([]LogEvent, 0, 100)
			}

		case <-ticker.C:
			if len(batch) > 0 {
				c.sendBatch(batch)
				batch = make([]LogEvent, 0, 100)
			}
		}
	}
}

func (c *Client) sendBatch(batch []LogEvent) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	for _, transport := range c.transports {
		if err := transport.Send(ctx, batch); err != nil {
			// Log to stderr as fallback
			fmt.Fprintf(os.Stderr, "Failed to send logs via %T: %v\n", transport, err)
		}
	}
}

// Close gracefully shuts down the client
func (c *Client) Close() error {
	close(c.buffer)

	for _, transport := range c.transports {
		if err := transport.Close(); err != nil {
			return err
		}
	}

	return nil
}
