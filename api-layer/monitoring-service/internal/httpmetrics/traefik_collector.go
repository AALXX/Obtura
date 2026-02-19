package httpmetrics

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"monitoring-service/pkg/db"
	"monitoring-service/pkg/logger"

	"go.uber.org/zap"
)

type TraefikCollector struct {
	db            *sql.DB
	redis         *db.RedisClient
	logPath       string
	deploymentMap map[string]string
	mapMu         sync.RWMutex
	stopCh        chan struct{}
}

func NewTraefikCollector(db *sql.DB, redis *db.RedisClient, logPath string) *TraefikCollector {
	return &TraefikCollector{
		db:            db,
		redis:         redis,
		logPath:       logPath,
		deploymentMap: make(map[string]string),
		stopCh:        make(chan struct{}),
	}
}

func (c *TraefikCollector) Start(ctx context.Context) error {
	if err := c.loadDeploymentMapping(ctx); err != nil {
		logger.Warn("Failed to load deployment mapping", zap.Error(err))
	}

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-c.stopCh:
				return
			case <-ticker.C:
				if err := c.loadDeploymentMapping(ctx); err != nil {
					logger.Warn("Failed to reload deployment mapping", zap.Error(err))
				}
				if err := c.processLogs(ctx); err != nil {
					logger.Error("Failed to process traefik logs", zap.Error(err))
				}
			}
		}
	}()

	logger.Info("Traefik collector started", zap.String("log_path", c.logPath))
	return nil
}

func (c *TraefikCollector) Stop() {
	close(c.stopCh)
}

func (c *TraefikCollector) loadDeploymentMapping(ctx context.Context) error {
	query := `
		SELECT d.id, COALESCE(d.domain, ''), dc.container_name
		FROM deployments d
		LEFT JOIN deployment_containers dc ON dc.deployment_id = d.id AND dc.is_active = true
		WHERE d.status IN ('active', 'running', 'healthy')
		  AND (d.domain IS NOT NULL AND d.domain != '')
	`

	rows, err := c.db.QueryContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to query deployments: %w", err)
	}
	defer rows.Close()

	newMap := make(map[string]string)
	for rows.Next() {
		var deploymentID, domain, containerName string
		if err := rows.Scan(&deploymentID, &domain, &containerName); err != nil {
			continue
		}
		if domain != "" {
			newMap[domain] = deploymentID
			if containerName != "" {
				newMap[containerName] = deploymentID
			}
		}
	}

	c.mapMu.Lock()
	c.deploymentMap = newMap
	c.mapMu.Unlock()

	if len(newMap) > 0 {
		doms := []string{}
		for k := range newMap {
			doms = append(doms, k)
		}
		logger.Info("Loaded deployment mapping", zap.Int("count", len(newMap)), zap.Strings("domains", doms))
	} else {
		logger.Warn("No deployments with domains found")
	}

	return nil
}

type TraefikLogEntry struct {
	ClientAddr       string `json:"ClientAddr"`
	RequestAddr      string `json:"RequestAddr"`
	RequestHost      string `json:"RequestHost"`
	RequestMethod    string `json:"RequestMethod"`
	RequestPath      string `json:"RequestPath"`
	DownstreamStatus int    `json:"DownstreamStatus"`
	Duration         int64  `json:"Duration"`
	StartLocal       string `json:"StartLocal"`
}

func (c *TraefikCollector) processLogs(ctx context.Context) error {
	accessLogPath := filepath.Join(c.logPath, "access.log")

	file, err := os.Open(accessLogPath)
	if err != nil {
		if os.IsNotExist(err) {
			logger.Warn("Traefik access log not found", zap.String("path", accessLogPath))
			return nil
		}
		return fmt.Errorf("failed to open access log: %w", err)
	}
	defer file.Close()

	logger.Info("Opened Traefik access log", zap.String("path", accessLogPath))

	lastPosKey := "traefik_log_last_pos"
	lastPos, _ := c.redis.Get(ctx, lastPosKey).Int64()
	if lastPos < 0 {
		lastPos = 0
	}

	file.Seek(lastPos, 0)

	scanner := bufio.NewScanner(file)
	entries := make([]LogEntry, 0, 100)
	lineCount := 0

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		lineCount++

		var traefikEntry TraefikLogEntry
		if err := json.Unmarshal([]byte(line), &traefikEntry); err != nil {
			continue
		}

		host := traefikEntry.RequestAddr
		if host == "" {
			host = traefikEntry.RequestHost
		}
		if host == "" {
			continue
		}

		ts, _ := time.Parse(time.RFC3339, traefikEntry.StartLocal)
		if ts.IsZero() {
			ts = time.Now()
		}

		entry := LogEntry{
			Host:         host,
			Method:       traefikEntry.RequestMethod,
			Path:         traefikEntry.RequestPath,
			StatusCode:   traefikEntry.DownstreamStatus,
			ResponseTime: traefikEntry.Duration,
			Timestamp:    ts,
			ClientIP:     traefikEntry.ClientAddr,
		}

		// Match domain to deployment
		var deploymentID string
		var ok bool

		c.mapMu.RLock()
		deploymentID, ok = c.deploymentMap[entry.Host]
		if !ok {
			// Only match exact domain or subdomains
			for domain, id := range c.deploymentMap {
				// Exact match
				if entry.Host == domain {
					deploymentID = id
					ok = true
					break
				}
				// Subdomain match: entry.Host ends with .domain
				if strings.HasSuffix(entry.Host, "."+domain) {
					deploymentID = id
					ok = true
					break
				}
			}
		}
		c.mapMu.RUnlock()

		// Skip requests that don't match any deployment
		if !ok || deploymentID == "" {
			continue
		}

		entry.DeploymentID = deploymentID
		entries = append(entries, entry)

		if len(entries) >= 100 {
			if err := c.storeEntries(ctx, entries); err != nil {
				logger.Error("Failed to store log entries", zap.Error(err))
			}
			logger.Info("Stored HTTP metrics entries", zap.Int("count", len(entries)))
			entries = entries[:0]
		}
	}

	logger.Info("Processed Traefik log lines", zap.Int("lines", lineCount), zap.Int("matched_entries", len(entries)))

	if len(entries) > 0 {
		if err := c.storeEntries(ctx, entries); err != nil {
			logger.Error("Failed to store log entries", zap.Error(err))
		}
		logger.Info("Stored remaining HTTP metrics entries", zap.Int("count", len(entries)))

		// Store sampled requests for geographic data
		if err := c.storeSampledRequests(ctx, entries); err != nil {
			logger.Error("Failed to store sampled requests", zap.Error(err))
		}
	}

	newPos, _ := file.Seek(0, 1)
	c.redis.Set(ctx, lastPosKey, newPos, 24*time.Hour)

	return nil
}

type LogEntry struct {
	Timestamp    time.Time
	Host         string
	Path         string
	Method       string
	StatusCode   int
	ResponseTime int64
	RequestSize  int64
	ResponseSize int64
	ClientIP     string
	DeploymentID string
}

func (c *TraefikCollector) storeEntries(ctx context.Context, entries []LogEntry) error {
	if len(entries) == 0 {
		return nil
	}

	aggregates := make(map[string]*MinuteAggregate)

	for _, e := range entries {
		minute := e.Timestamp.Truncate(time.Minute)
		key := fmt.Sprintf("%s_%d", e.DeploymentID, minute.Unix())

		if agg, ok := aggregates[key]; ok {
			agg.RequestCount++
			agg.TotalResponseTime += e.ResponseTime
			if e.StatusCode >= 500 {
				agg.ErrorCount++
			}
			if e.ResponseTime > agg.MaxResponseTime {
				agg.MaxResponseTime = e.ResponseTime
			}
			if e.ResponseTime < agg.MinResponseTime || agg.MinResponseTime == 0 {
				agg.MinResponseTime = e.ResponseTime
			}
			agg.TotalResponseSize += e.ResponseSize
			agg.StatusCodes = append(agg.StatusCodes, e.StatusCode)
		} else {
			agg = &MinuteAggregate{
				DeploymentID:      e.DeploymentID,
				Timestamp:         minute,
				RequestCount:      1,
				TotalResponseTime: e.ResponseTime,
				MinResponseTime:   e.ResponseTime,
				MaxResponseTime:   e.ResponseTime,
				TotalResponseSize: e.ResponseSize,
			}
			if e.StatusCode >= 500 {
				agg.ErrorCount = 1
			}
			agg.StatusCodes = []int{e.StatusCode}
			aggregates[key] = agg
		}
	}

	for _, agg := range aggregates {
		errorRate := 0.0
		if agg.RequestCount > 0 {
			errorRate = float64(agg.ErrorCount) / float64(agg.RequestCount)
		}

		avgLatency := int64(0)
		if agg.RequestCount > 0 {
			avgLatency = agg.TotalResponseTime / int64(agg.RequestCount)
		}

		var count2xx, count3xx, count4xx, count5xx int64
		var mostCommonStatus int
		statusCounts := make(map[int]int)
		for _, sc := range agg.StatusCodes {
			statusCounts[sc]++
			switch {
			case sc >= 200 && sc < 300:
				count2xx++
			case sc >= 300 && sc < 400:
				count3xx++
			case sc >= 400 && sc < 500:
				count4xx++
			case sc >= 500:
				count5xx++
			}
		}
		maxCount := 0
		for sc, cnt := range statusCounts {
			if cnt > maxCount {
				maxCount = cnt
				mostCommonStatus = sc
			}
		}

		query := `
		INSERT INTO http_metrics_minute (
			deployment_id, timestamp_minute, request_count,
			request_count_2xx, request_count_3xx, request_count_4xx, request_count_5xx,
			latency_avg, latency_min, latency_max,
			latency_p50, latency_p95, latency_p99,
			error_count, error_rate, bytes_in, bytes_out,
			requests_per_minute, status_code
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
		ON CONFLICT (deployment_id, timestamp_minute) DO UPDATE SET
			request_count = http_metrics_minute.request_count + EXCLUDED.request_count,
			request_count_2xx = http_metrics_minute.request_count_2xx + EXCLUDED.request_count_2xx,
			request_count_3xx = http_metrics_minute.request_count_3xx + EXCLUDED.request_count_3xx,
			request_count_4xx = http_metrics_minute.request_count_4xx + EXCLUDED.request_count_4xx,
			request_count_5xx = http_metrics_minute.request_count_5xx + EXCLUDED.request_count_5xx,
			error_count = http_metrics_minute.error_count + EXCLUDED.error_count,
			bytes_out = http_metrics_minute.bytes_out + EXCLUDED.bytes_out,
			latency_sum = http_metrics_minute.latency_sum + EXCLUDED.latency_sum,
			latency_max = GREATEST(http_metrics_minute.latency_max, EXCLUDED.latency_max)
	`

		_, err := c.db.ExecContext(ctx, query,
			agg.DeploymentID,
			agg.Timestamp,
			agg.RequestCount,
			count2xx, count3xx, count4xx, count5xx,
			avgLatency/1000000,
			agg.MinResponseTime/1000000,
			agg.MaxResponseTime/1000000,
			avgLatency/1000000,
			avgLatency/1000000,
			avgLatency/1000000,
			agg.ErrorCount,
			errorRate,
			0,
			agg.TotalResponseSize,
			float64(agg.RequestCount),
			mostCommonStatus,
		)
		if err != nil {
			log.Printf("Failed to store HTTP metric: %v", err)
		}
	}

	return nil
}

func (c *TraefikCollector) storeSampledRequests(ctx context.Context, entries []LogEntry) error {
	if len(entries) == 0 {
		return nil
	}

	// Sample 1% of requests to store with client IP for geo data
	sampleQuery := `
		INSERT INTO http_requests_sampled 
			(deployment_id, timestamp, method, path, path_normalized, status_code, latency_ms, 
			 request_size, response_size, client_ip, country_code, region, city, router_name, service_name)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		ON CONFLICT DO NOTHING
	`

	for _, e := range entries {
		// Only store 1% of requests to avoid too much data
		if time.Now().UnixNano()%100 != 0 {
			continue
		}

		// Parse client IP (remove port if present)
		clientIP := e.ClientIP
		if idx := strings.LastIndex(clientIP, ":"); idx > 0 {
			clientIP = clientIP[:idx]
		}

		// Skip internal IPs
		if strings.HasPrefix(clientIP, "172.20.") || strings.HasPrefix(clientIP, "172.21.") ||
			strings.HasPrefix(clientIP, "192.168.") || strings.HasPrefix(clientIP, "10.") ||
			strings.HasPrefix(clientIP, "127.") {
			continue
		}

		// Simple path normalization
		pathNormalized := e.Path
		if idx := strings.Index(pathNormalized, "?"); idx > 0 {
			pathNormalized = pathNormalized[:idx]
		}

		_, err := c.db.ExecContext(ctx, sampleQuery,
			e.DeploymentID,
			e.Timestamp,
			e.Method,
			e.Path,
			pathNormalized,
			e.StatusCode,
			e.ResponseTime/1000000,
			e.RequestSize,
			e.ResponseSize,
			clientIP,
			"", // country_code - would need GeoIP lookup
			"", // region
			"", // city
			"", // router_name
			"", // service_name
		)
		if err != nil {
			logger.Error("Failed to store sampled request", zap.Error(err))
		}
	}

	return nil
}

type MinuteAggregate struct {
	DeploymentID      string
	Timestamp         time.Time
	RequestCount      int64
	TotalResponseTime int64
	MinResponseTime   int64
	MaxResponseTime   int64
	TotalResponseSize int64
	ErrorCount        int64
	StatusCodes       []int
}
