package monitoring

import (
	"context"
	"database/sql"

	"monitoring-service/internal/httpmetrics"
	"monitoring-service/internal/metrics"
	"monitoring-service/pkg/config"
	"monitoring-service/pkg/db"
	"monitoring-service/pkg/docker"
	"monitoring-service/pkg/logger"

	"github.com/minio/minio-go/v7"
)

type Orchestrator struct {
	config       *config.Config
	db           *sql.DB
	redis        *db.RedisClient
	minio        *minio.Client
	logStorage   *db.LogStorage
	dockerClient *docker.Client

	healthChecker *HealthChecker
	logAggregator *LogAggregator
	alertManager  *AlertManager
	uptimeTracker *UptimeTracker
	metricsCol    *metrics.Collector
	traefikCol    *httpmetrics.TraefikCollector
}

func NewOrchestrator(cfg *config.Config, dbConn *sql.DB, redisClient *db.RedisClient, minioClient *minio.Client) *Orchestrator {
	dockerClient, err := docker.NewClient(cfg)
	if err != nil {
		logger.Fatal("Failed to create Docker client", logger.Err(err))
	}

	// Initialize log storage
	logStorage := db.NewLogStorage(minioClient)

	o := &Orchestrator{
		config:       cfg,
		db:           dbConn,
		redis:        redisClient,
		minio:        minioClient,
		logStorage:   logStorage,
		dockerClient: dockerClient,
	}

	// Initialize components
	o.healthChecker = NewHealthChecker(o)
	o.logAggregator = NewLogAggregator(o, logStorage)
	o.alertManager = NewAlertManager(o)
	o.uptimeTracker = NewUptimeTracker(o)
	o.metricsCol = metrics.NewCollector(o.dockerClient, dbConn, redisClient)

	// Initialize Traefik HTTP metrics collector
	traefikLogPath := "/var/log/traefik"
	o.traefikCol = httpmetrics.NewTraefikCollector(dbConn, redisClient, traefikLogPath)

	return o
}

// GetDB returns database connection
func (o *Orchestrator) GetDB() *sql.DB {
	return o.db
}

// GetRedis returns Redis client
func (o *Orchestrator) GetRedis() *db.RedisClient {
	return o.redis
}

// GetMinio returns MinIO client
func (o *Orchestrator) GetMinio() *minio.Client {
	return o.minio
}

// GetDockerClient returns Docker client
func (o *Orchestrator) GetDockerClient() *docker.Client {
	return o.dockerClient
}

// GetHealthChecker returns health checker
func (o *Orchestrator) GetHealthChecker() *HealthChecker {
	return o.healthChecker
}

// GetLogAggregator returns log aggregator
func (o *Orchestrator) GetLogAggregator() *LogAggregator {
	return o.logAggregator
}

// GetLogStorage returns log storage
func (o *Orchestrator) GetLogStorage() *db.LogStorage {
	return o.logStorage
}

// GetAlertManager returns alert manager
func (o *Orchestrator) GetAlertManager() *AlertManager {
	return o.alertManager
}

// GetUptimeTracker returns uptime tracker
func (o *Orchestrator) GetUptimeTracker() *UptimeTracker {
	return o.uptimeTracker
}

// GetMetricsCollector returns metrics collector
func (o *Orchestrator) GetMetricsCollector() *metrics.Collector {
	return o.metricsCol
}

// GetTraefikCollector returns Traefik collector
func (o *Orchestrator) GetTraefikCollector() *httpmetrics.TraefikCollector {
	return o.traefikCol
}

// GetConfig returns config
func (o *Orchestrator) GetConfig() *config.Config {
	return o.config
}

// RunMetricsCollection performs a single metrics collection cycle
func (o *Orchestrator) RunMetricsCollection(ctx context.Context) error {
	if err := o.metricsCol.CollectAll(ctx); err != nil {
		logger.Error("Error collecting metrics", logger.Err(err))
		return err
	}
	return nil
}

// RunHealthChecks performs health checks for all deployments
func (o *Orchestrator) RunHealthChecks(ctx context.Context) error {
	if err := o.healthChecker.CheckAll(ctx); err != nil {
		logger.Error("Error running health checks", logger.Err(err))
		return err
	}
	return nil
}

// RunLogAggregation performs log aggregation
func (o *Orchestrator) RunLogAggregation(ctx context.Context) error {
	if err := o.logAggregator.AggregateAll(ctx); err != nil {
		logger.Error("Error aggregating logs", logger.Err(err))
		return err
	}
	return nil
}

// RunUptimeTracking performs uptime tracking
func (o *Orchestrator) RunUptimeTracking(ctx context.Context) error {
	if err := o.uptimeTracker.Track(ctx); err != nil {
		logger.Error("Error tracking uptime", logger.Err(err))
		return err
	}
	return nil
}

// RunAlertProcessing processes alerts
func (o *Orchestrator) RunAlertProcessing(ctx context.Context) error {
	if err := o.alertManager.ProcessAlerts(ctx); err != nil {
		logger.Error("Error processing alerts", logger.Err(err))
		return err
	}
	return nil
}

// RunHTTPMetricsCollection collects HTTP metrics from Traefik
func (o *Orchestrator) RunHTTPMetricsCollection(ctx context.Context) error {
	if o.traefikCol == nil {
		return nil
	}
	if err := o.traefikCol.Start(ctx); err != nil {
		logger.Error("Error starting Traefik collector", logger.Err(err))
		return err
	}
	return nil
}
