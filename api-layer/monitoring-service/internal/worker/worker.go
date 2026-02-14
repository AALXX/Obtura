package worker

import (
	"context"
	"sync"
	"time"

	"monitoring-service/internal/monitoring"
	"monitoring-service/pkg/config"
	"monitoring-service/pkg/logger"
)

type WorkerPool struct {
	config       *config.Config
	orchestrator *monitoring.Orchestrator
	workers      int
	ctx          context.Context
	cancel       context.CancelFunc
	wg           sync.WaitGroup
}

func NewWorkerPool(cfg *config.Config, orch *monitoring.Orchestrator) *WorkerPool {
	ctx, cancel := context.WithCancel(context.Background())

	return &WorkerPool{
		config:       cfg,
		orchestrator: orch,
		workers:      5,
		ctx:          ctx,
		cancel:       cancel,
	}
}

func (wp *WorkerPool) Start() {
	logger.Info("Starting worker pool", logger.Int("workers", wp.workers))

	// Start background task workers
	for i := 0; i < wp.workers; i++ {
		wp.wg.Add(1)
		go wp.backgroundWorker(i)
	}

	// Start monitoring task schedulers
	wp.wg.Add(1)
	go wp.metricsCollector()

	wp.wg.Add(1)
	go wp.healthChecker()

	wp.wg.Add(1)
	go wp.logAggregator()

	wp.wg.Add(1)
	go wp.uptimeTracker()

	wp.wg.Add(1)
	go wp.alertProcessor()

	// Start log archival worker
	wp.wg.Add(1)
	go wp.logArchivalWorker()
}

func (wp *WorkerPool) Stop() {
	logger.Info("Stopping worker pool...")
	wp.cancel()
	wp.wg.Wait()
	logger.Info("Worker pool stopped")
}

func (wp *WorkerPool) backgroundWorker(id int) {
	defer wp.wg.Done()

	logger.Info("Background worker started", logger.Int("id", id))

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-wp.ctx.Done():
			logger.Info("Background worker stopped", logger.Int("id", id))
			return
		case <-ticker.C:
			wp.processBackgroundTasks()
		}
	}
}

func (wp *WorkerPool) metricsCollector() {
	defer wp.wg.Done()

	logger.Info("Metrics collector started")

	ticker := time.NewTicker(wp.config.MetricsInterval)
	defer ticker.Stop()

	for {
		select {
		case <-wp.ctx.Done():
			logger.Info("Metrics collector stopped")
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(wp.ctx, 30*time.Second)
			if err := wp.orchestrator.RunMetricsCollection(ctx); err != nil {
				logger.Error("Metrics collection failed", logger.Err(err))
			}
			cancel()
		}
	}
}

func (wp *WorkerPool) healthChecker() {
	defer wp.wg.Done()

	logger.Info("Health checker started")

	ticker := time.NewTicker(wp.config.HealthCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-wp.ctx.Done():
			logger.Info("Health checker stopped")
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(wp.ctx, 60*time.Second)
			if err := wp.orchestrator.RunHealthChecks(ctx); err != nil {
				logger.Error("Health checks failed", logger.Err(err))
			}
			cancel()
		}
	}
}

func (wp *WorkerPool) logAggregator() {
	defer wp.wg.Done()

	logger.Info("Log aggregator started")

	ticker := time.NewTicker(wp.config.LogAggregationInterval)
	defer ticker.Stop()

	for {
		select {
		case <-wp.ctx.Done():
			logger.Info("Log aggregator stopped")
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(wp.ctx, 60*time.Second)
			if err := wp.orchestrator.RunLogAggregation(ctx); err != nil {
				logger.Error("Log aggregation failed", logger.Err(err))
			}
			cancel()
		}
	}
}

func (wp *WorkerPool) uptimeTracker() {
	defer wp.wg.Done()

	logger.Info("Uptime tracker started")

	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-wp.ctx.Done():
			logger.Info("Uptime tracker stopped")
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(wp.ctx, 30*time.Second)
			if err := wp.orchestrator.RunUptimeTracking(ctx); err != nil {
				logger.Error("Uptime tracking failed", logger.Err(err))
			}
			cancel()
		}
	}
}

func (wp *WorkerPool) alertProcessor() {
	defer wp.wg.Done()

	logger.Info("Alert processor started")

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-wp.ctx.Done():
			logger.Info("Alert processor stopped")
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(wp.ctx, 30*time.Second)
			if err := wp.orchestrator.RunAlertProcessing(ctx); err != nil {
				logger.Error("Alert processing failed", logger.Err(err))
			}
			cancel()
		}
	}
}

func (wp *WorkerPool) processBackgroundTasks() {
	// Clean up old metrics
	wp.cleanupOldMetrics()

	// Archive old logs
	wp.archiveOldLogs()

	// Update aggregate statistics
	wp.updateAggregateStats()
}

func (wp *WorkerPool) cleanupOldMetrics() {
	ctx, cancel := context.WithTimeout(wp.ctx, 30*time.Second)
	defer cancel()

	query := `DELETE FROM deployments_metrics WHERE timestamp < NOW() - INTERVAL '30 days'`
	_, err := wp.orchestrator.GetDB().ExecContext(ctx, query)
	if err != nil {
		logger.Error("Failed to cleanup old metrics", logger.Err(err))
	}
}

func (wp *WorkerPool) logArchivalWorker() {
	defer wp.wg.Done()

	logger.Info("Log archival worker started")

	// Run every hour
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	// Run immediately on start
	wp.archiveOldLogs()

	for {
		select {
		case <-wp.ctx.Done():
			logger.Info("Log archival worker stopped")
			return
		case <-ticker.C:
			wp.archiveOldLogs()
		}
	}
}

func (wp *WorkerPool) archiveOldLogs() {
	ctx, cancel := context.WithTimeout(wp.ctx, 5*time.Minute)
	defer cancel()

	logger.Info("Starting log archival to MinIO")

	// Use the log aggregator to archive old logs
	if err := wp.orchestrator.GetLogAggregator().ArchiveOldLogs(ctx); err != nil {
		logger.Error("Failed to archive old logs", logger.Err(err))
		return
	}

	logger.Info("Log archival completed")
}

func (wp *WorkerPool) updateAggregateStats() {
	// Update daily/hourly aggregate statistics
	// This could include average uptime, error rates, etc.
}
