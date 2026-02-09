package logger

import (
	"context"
	"os"

	"build-service/pkg/platformlog"
)

var platformLogger *platformlog.Client

// InitPlatformLogger initializes the unified platform logger
func InitPlatformLogger() {
	monitoringURL := os.Getenv("MONITORING_SERVICE_URL")
	if monitoringURL == "" {
		monitoringURL = "http://monitoring-service:5090"
	}

	// Use console transport as fallback and HTTP transport for remote logging
	consoleTransport := platformlog.NewConsoleTransport()
	httpTransport := platformlog.NewHTTPTransport(monitoringURL, "")
	platformLogger = platformlog.NewClient("build-service", consoleTransport, httpTransport)
}

// GetPlatformLogger returns the platform logger instance
func GetPlatformLogger() *platformlog.Client {
	if platformLogger == nil {
		InitPlatformLogger()
	}
	return platformLogger
}

// BuildStart logs a build start event
func BuildStart(ctx context.Context, buildID, projectID, companyID string, buildNumber int, commitHash, branch string) error {
	return GetPlatformLogger().BuildStart(ctx, buildID, projectID, companyID, buildNumber, commitHash, branch)
}

// BuildStep logs a build step event
func BuildStep(ctx context.Context, buildID, projectID, companyID string, stepName string, stepNumber, totalSteps int, message string) error {
	return GetPlatformLogger().BuildStep(ctx, buildID, projectID, companyID, stepName, stepNumber, totalSteps, message)
}

// BuildComplete logs a build completion event
func BuildComplete(ctx context.Context, buildID, projectID, companyID string, success bool, durationMs int64) error {
	return GetPlatformLogger().BuildComplete(ctx, buildID, projectID, companyID, success, durationMs)
}

// BuildError logs a build error event
func BuildError(ctx context.Context, buildID, projectID, companyID string, stepName string, err error) error {
	return GetPlatformLogger().BuildError(ctx, buildID, projectID, companyID, stepName, err)
}

// Close closes the platform logger
func Close() error {
	if platformLogger != nil {
		return platformLogger.Close()
	}
	return nil
}
