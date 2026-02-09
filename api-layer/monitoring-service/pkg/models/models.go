package models

import "time"

// Deployment represents a deployed application
type Deployment struct {
	ID                  string
	ProjectID           string
	ContainerID         string // Docker/K8s container ID from deployment_containers table
	ContainerUUID       string // UUID of the container record in deployment_containers table
	Status              string
	ContainerStatus     string
	HealthCheckEndpoint string
	HasDatabase         bool
	HasCache            bool
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// Alert represents a monitoring alert
type Alert struct {
	ID             string
	DeploymentID   string
	Severity       string
	Title          string
	Description    string
	MetricType     string
	ThresholdValue float64
	CurrentValue   float64
	Status         string
	TriggeredAt    time.Time
	ResolvedAt     *time.Time
	AcknowledgedBy *string
	AcknowledgedAt *time.Time
	Metadata       map[string]interface{}
}

// Metric represents deployment metrics
type Metric struct {
	ID           string
	DeploymentID string
	Timestamp    time.Time
	CPUUsage     float64
	MemoryUsage  int64
	NetworkRx    int64
	NetworkTx    int64
	DiskUsage    int64
	RequestCount int
	ErrorCount   int
	ResponseTime float64
	Status       string
}

// LogEntry represents a log entry
type LogEntry struct {
	ID           string
	DeploymentID string
	ContainerID  string
	Timestamp    time.Time
	Level        string
	Message      string
	Source       string
	Metadata     map[string]interface{}
}

// Incident represents a deployment incident
type Incident struct {
	ID            string
	DeploymentID  string
	Title         string
	Description   string
	Severity      string
	Status        string
	StartedAt     time.Time
	DetectedAt    *time.Time
	ResolvedAt    *time.Time
	AssignedTo    *string
	RootCause     string
	Resolution    string
	ImpactSummary string
	Timeline      []IncidentEvent
}

// IncidentEvent represents an event in an incident timeline
type IncidentEvent struct {
	Timestamp   time.Time
	EventType   string
	Description string
	User        string
}

// HealthCheck represents a health check result
type HealthCheck struct {
	ID           string
	DeploymentID string
	CheckType    string
	Endpoint     string
	Status       string
	ResponseTime int
	StatusCode   int
	ErrorMessage string
	CheckedAt    time.Time
}
