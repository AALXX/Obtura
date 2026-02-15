package metrics

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"monitoring-service/pkg/logger"
)

type HTTPMetricsCollector struct {
	db *sql.DB
}

func NewHTTPMetricsCollector(db *sql.DB) *HTTPMetricsCollector {
	return &HTTPMetricsCollector{db: db}
}

func (c *HTTPMetricsCollector) GetHTTPMetricsSummary(ctx context.Context, deploymentID string, interval string) (*HTTPMetricsSummary, error) {
	summary := &HTTPMetricsSummary{}

	query := `
		SELECT 
			COALESCE(SUM(request_count), 0) as total_requests,
			COALESCE(AVG(latency_avg), 0) as avg_latency,
			COALESCE(SUM(error_count)::float / NULLIF(SUM(request_count), 0), 0) as error_rate,
			COALESCE(SUM(bytes_in), 0) as bytes_in,
			COALESCE(SUM(bytes_out), 0) as bytes_out,
			COALESCE(SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN request_count ELSE 0 END), 0) as count_2xx,
			COALESCE(SUM(CASE WHEN status_code >= 300 AND status_code < 400 THEN request_count ELSE 0 END), 0) as count_3xx,
			COALESCE(SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN request_count ELSE 0 END), 0) as count_4xx,
			COALESCE(SUM(CASE WHEN status_code >= 500 THEN request_count ELSE 0 END), 0) as count_5xx
		FROM http_metrics_minute
		WHERE deployment_id = $1 
		  AND timestamp_minute >= NOW() - $2::interval
	`

	var totalRequests int64
	var avgLatency, errorRate float64
	var bytesIn, bytesOut int64
	var count2xx, count3xx, count4xx, count5xx int64

	err := c.db.QueryRowContext(ctx, query, deploymentID, interval).Scan(
		&totalRequests, &avgLatency, &errorRate, &bytesIn, &bytesOut,
		&count2xx, &count3xx, &count4xx, &count5xx,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get HTTP metrics summary: %w", err)
	}

	summary.TotalRequests = totalRequests
	summary.AvgLatency = avgLatency
	summary.ErrorRate = errorRate * 100
	summary.BytesIn = bytesIn
	summary.BytesOut = bytesOut
	summary.Count2xx = count2xx
	summary.Count3xx = count3xx
	summary.Count4xx = count4xx
	summary.Count5xx = count5xx

	// Get latency distribution
	summary.LatencyDistribution, err = c.getLatencyDistribution(ctx, deploymentID, interval)
	if err != nil {
		logger.Error("Failed to get latency distribution", logger.Err(err))
	}

	// Get top endpoints
	summary.TopEndpoints, err = c.getTopEndpoints(ctx, deploymentID, interval)
	if err != nil {
		logger.Error("Failed to get top endpoints", logger.Err(err))
	}

	// Get geographic distribution
	summary.GeographicDistribution, err = c.getGeographicDistribution(ctx, deploymentID, interval)
	if err != nil {
		logger.Error("Failed to get geographic distribution", logger.Err(err))
	}

	// Get time series data for requests
	summary.RequestsTimeSeries, err = c.getRequestsTimeSeries(ctx, deploymentID, interval)
	if err != nil {
		logger.Error("Failed to get requests time series", logger.Err(err))
	}

	return summary, nil
}

func (c *HTTPMetricsCollector) getLatencyDistribution(ctx context.Context, deploymentID string, interval string) ([]LatencyBucket, error) {
	query := `
		SELECT 
			CASE 
				WHEN latency_avg < 50 THEN '0-50ms'
				WHEN latency_avg < 100 THEN '50-100ms'
				WHEN latency_avg < 200 THEN '100-200ms'
				WHEN latency_avg < 500 THEN '200-500ms'
				WHEN latency_avg < 1000 THEN '500ms-1s'
				ELSE '>1s'
			END as bucket,
			SUM(request_count) as count
		FROM http_metrics_minute
		WHERE deployment_id = $1 
		  AND timestamp_minute >= NOW() - $2::interval
		GROUP BY 1
		ORDER BY MIN(latency_avg)
	`

	rows, err := c.db.QueryContext(ctx, query, deploymentID, interval)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var buckets []LatencyBucket
	for rows.Next() {
		var b LatencyBucket
		if err := rows.Scan(&b.Bucket, &b.Count); err != nil {
			continue
		}
		buckets = append(buckets, b)
	}

	return buckets, nil
}

func (c *HTTPMetricsCollector) getTopEndpoints(ctx context.Context, deploymentID string, interval string) ([]EndpointStat, error) {
	query := `
		SELECT 
			path_normalized,
			method,
			request_count,
			latency_avg,
			error_rate
		FROM endpoint_stats
		WHERE deployment_id = $1 
		  AND date >= CURRENT_DATE - INTERVAL '7 days'
		ORDER BY request_count DESC
		LIMIT 10
	`

	rows, err := c.db.QueryContext(ctx, query, deploymentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var endpoints []EndpointStat
	for rows.Next() {
		var e EndpointStat
		var errorRate float64
		if err := rows.Scan(&e.Path, &e.Method, &e.RequestCount, &e.AvgLatency, &errorRate); err != nil {
			continue
		}
		e.ErrorRate = fmt.Sprintf("%.2f", errorRate*100)
		endpoints = append(endpoints, e)
	}

	return endpoints, nil
}

func (c *HTTPMetricsCollector) getGeographicDistribution(ctx context.Context, deploymentID string, interval string) ([]GeoStat, error) {
	query := `
		SELECT 
			country_code,
			region,
			SUM(request_count) as request_count
		FROM geo_distribution
		WHERE deployment_id = $1 
		  AND timestamp_hour >= NOW() - $2::interval
		GROUP BY country_code, region
		ORDER BY request_count DESC
		LIMIT 10
	`

	rows, err := c.db.QueryContext(ctx, query, deploymentID, interval)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var regions []GeoStat
	totalRequests := 0
	for rows.Next() {
		var g GeoStat
		if err := rows.Scan(&g.CountryCode, &g.Region, &g.Requests); err != nil {
			continue
		}
		totalRequests += g.Requests
		regions = append(regions, g)
	}

	// Calculate percentages
	for i := range regions {
		if totalRequests > 0 {
			regions[i].Percentage = (regions[i].Requests * 100) / totalRequests
		}
	}

	return regions, nil
}

func (c *HTTPMetricsCollector) getRequestsTimeSeries(ctx context.Context, deploymentID string, interval string) ([]RequestsDataPoint, error) {
	query := `
		SELECT 
			EXTRACT(EPOCH FROM timestamp_minute) * 1000 as time_ms,
			COALESCE(requests_per_minute, 0) as rpm,
			COALESCE(latency_avg, 0) as latency,
			COALESCE(error_rate, 0) as error_rate
		FROM http_metrics_minute
		WHERE deployment_id = $1 
		  AND timestamp_minute >= NOW() - $2::interval
		ORDER BY timestamp_minute ASC
	`

	rows, err := c.db.QueryContext(ctx, query, deploymentID, interval)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var data []RequestsDataPoint
	for rows.Next() {
		var d RequestsDataPoint
		var timeMs float64
		var errorRate float64
		if err := rows.Scan(&timeMs, &d.RequestsPerMin, &d.AvgLatency, &errorRate); err != nil {
			continue
		}
		d.Time = int64(timeMs)
		d.ErrorRate = errorRate * 100
		data = append(data, d)
	}

	return data, nil
}

func shouldSample() bool {
	// 1% sampling
	return time.Now().UnixNano()%100 == 0
}

func normalizePath(path string) string {
	// Simple normalization - replace numeric IDs with :id
	// In production, use a proper router library
	if len(path) > 100 {
		path = path[:100]
	}
	return path
}

// Types
type HTTPRequest struct {
	Timestamp    time.Time
	Method       string
	Path         string
	StatusCode   int
	LatencyMs    int
	RequestSize  int64
	ResponseSize int64
	ClientIP     string
	CountryCode  string
	Region       string
	City         string
	UserAgent    string
}

type HTTPMetricsSummary struct {
	TotalRequests          int64
	AvgLatency             float64
	ErrorRate              float64
	BytesIn                int64
	BytesOut               int64
	Count2xx               int64
	Count3xx               int64
	Count4xx               int64
	Count5xx               int64
	LatencyDistribution    []LatencyBucket
	TopEndpoints           []EndpointStat
	GeographicDistribution []GeoStat
	RequestsTimeSeries     []RequestsDataPoint
}

type LatencyBucket struct {
	Bucket string `json:"bucket"`
	Count  int64  `json:"count"`
}

type EndpointStat struct {
	Path         string `json:"path"`
	Method       string `json:"method"`
	RequestCount int64  `json:"requestCount"`
	AvgLatency   int64  `json:"avgLatency"`
	ErrorRate    string `json:"errorRate"`
}

type GeoStat struct {
	CountryCode string `json:"countryCode"`
	Region      string `json:"region"`
	Requests    int    `json:"requests"`
	Percentage  int    `json:"percentage"`
}

type RequestsDataPoint struct {
	Time           int64   `json:"time"`
	RequestsPerMin float64 `json:"requestsPerMin"`
	AvgLatency     int     `json:"avgLatency"`
	ErrorRate      float64 `json:"errorRate"`
}
