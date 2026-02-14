package deployment_logger

import (
	"context"
	"fmt"
	"os"

	"deploy-service/pkg/platformlog"
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
	platformLogger = platformlog.NewClient("deploy-service", consoleTransport, httpTransport)
}

// GetPlatformLogger returns the platform logger instance
func GetPlatformLogger() *platformlog.Client {
	if platformLogger == nil {
		InitPlatformLogger()
	}
	return platformLogger
}

// DeployStart logs a deployment start event
func DeployStart(ctx context.Context, deploymentID, projectID, companyID, environment, strategy string) error {
	fmt.Printf("DEPLOYMENT LOGGER DeployStart called with: deploymentID='%s', projectID='%s', companyID='%s'\n", deploymentID, projectID, companyID)
	err := GetPlatformLogger().DeployStart(ctx, deploymentID, projectID, companyID, environment, strategy)
	if err != nil {
		fmt.Printf("PLATFORM LOGGER ERROR in DeployStart: %v\n", err)
	} else {
		fmt.Printf("PLATFORM LOGGER SUCCESS in DeployStart\n")
	}
	return err
}

// DeployStep logs a deployment step event
func DeployStep(ctx context.Context, deploymentID, stepName, message string) error {
	fmt.Printf("DEPLOYMENT LOGGER DeployStep called with: deploymentID='%s', stepName='%s'\n", deploymentID, stepName)
	err := GetPlatformLogger().DeployStep(ctx, deploymentID, stepName, message)
	if err != nil {
		fmt.Printf("PLATFORM LOGGER ERROR in DeployStep: %v\n", err)
	}
	return err
}

// DeployComplete logs a deployment completion event
func DeployComplete(ctx context.Context, deploymentID, projectID, companyID string, success bool, durationMs int64) error {
	fmt.Printf("DEPLOYMENT LOGGER DeployComplete called with: deploymentID='%s', projectID='%s', companyID='%s', success=%t\n", deploymentID, projectID, companyID, success)
	err := GetPlatformLogger().DeployComplete(ctx, deploymentID, projectID, companyID, success, durationMs)
	if err != nil {
		fmt.Printf("PLATFORM LOGGER ERROR in DeployComplete: %v\n", err)
	}
	return err
}

// HealthCheck logs a health check event
func HealthCheck(ctx context.Context, deploymentID, containerID string, healthy bool, responseTimeMs int) error {
	return GetPlatformLogger().HealthCheck(ctx, deploymentID, containerID, healthy, responseTimeMs)
}

// ContainerLog logs a container log event
func ContainerLog(ctx context.Context, deploymentID, containerID, containerName, message string, severity platformlog.Severity) error {
	return GetPlatformLogger().ContainerLog(ctx, deploymentID, containerID, containerName, message, severity)
}

// ContainerRestart logs a container restart event
func ContainerRestart(ctx context.Context, deploymentID, containerID string, restartCount int, reason string) error {
	return GetPlatformLogger().ContainerRestart(ctx, deploymentID, containerID, restartCount, reason)
}

// Close closes the platform logger
func Close() error {
	if platformLogger != nil {
		return platformLogger.Close()
	}
	return nil
}
