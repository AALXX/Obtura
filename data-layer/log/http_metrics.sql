-- ============================================================================
-- HTTP METRICS TABLES
-- Captures application-level HTTP telemetry from Traefik access logs
-- ============================================================================

-- Minute-level aggregates (primary dashboard source)
-- Used for time-series charts and real-time dashboards
CREATE TABLE IF NOT EXISTS http_metrics_minute (
    id SERIAL PRIMARY KEY,
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    timestamp_minute TIMESTAMP NOT NULL,
    
    -- Request volume
    request_count INTEGER NOT NULL DEFAULT 0,
    request_count_2xx INTEGER DEFAULT 0,
    request_count_3xx INTEGER DEFAULT 0,
    request_count_4xx INTEGER DEFAULT 0,
    request_count_5xx INTEGER DEFAULT 0,
    
    -- Latency (milliseconds)
    latency_min INTEGER,
    latency_max INTEGER,
    latency_avg INTEGER,
    latency_sum BIGINT DEFAULT 0,
    latency_p50 INTEGER,
    latency_p95 INTEGER,
    latency_p99 INTEGER,
    
    -- Computed rates
    requests_per_minute DECIMAL(10,2),
    error_rate DECIMAL(5,4), -- 0.0000 to 1.0000
    
    -- Traffic volume
    bytes_in BIGINT DEFAULT 0,
    bytes_out BIGINT DEFAULT 0,
    
    -- Top region this minute (for quick lookup)
    top_country_code CHAR(2),
    top_region VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_deployment_minute UNIQUE(deployment_id, timestamp_minute)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_http_metrics_deployment_time 
    ON http_metrics_minute(deployment_id, timestamp_minute DESC);

CREATE INDEX IF NOT EXISTS idx_http_metrics_time_range 
    ON http_metrics_minute(timestamp_minute) 
    WHERE timestamp_minute > NOW() - INTERVAL '30 days';

COMMENT ON TABLE http_metrics_minute IS 'Minute-level HTTP metrics aggregates for dashboard visualizations. Retention: 30 days';
COMMENT ON COLUMN http_metrics_minute.deployment_id IS 'Foreign key to deployments table';
COMMENT ON COLUMN http_metrics_minute.timestamp_minute IS 'Start of the minute bucket (e.g., 10:30:00 for 10:30:00-10:30:59)';
COMMENT ON COLUMN http_metrics_minute.request_count IS 'Total number of requests in this minute';
COMMENT ON COLUMN http_metrics_minute.latency_p50 IS '50th percentile latency in milliseconds';
COMMENT ON COLUMN http_metrics_minute.latency_p95 IS '95th percentile latency in milliseconds';
COMMENT ON COLUMN http_metrics_minute.latency_p99 IS '99th percentile latency in milliseconds';
COMMENT ON COLUMN http_metrics_minute.error_rate IS 'Ratio of 5xx responses (0.0 to 1.0)';

-- ============================================================================
-- SAMPLED RAW REQUESTS (1% for debugging/detailed analysis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS http_requests_sampled (
    id SERIAL PRIMARY KEY,
    deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    
    -- Request details
    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,
    path_normalized VARCHAR(200), -- /users/123 -> /users/:id
    query_string VARCHAR(500),
    status_code SMALLINT NOT NULL,
    latency_ms INTEGER NOT NULL,
    
    -- Size
    request_size BIGINT,
    response_size BIGINT,
    
    -- Client info
    client_ip INET,
    country_code CHAR(2),
    region VARCHAR(100),
    city VARCHAR(100),
    user_agent VARCHAR(500),
    
    -- Traefik metadata
    router_name VARCHAR(200),
    service_name VARCHAR(200),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_http_requests_sampled_deployment_time 
    ON http_requests_sampled(deployment_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_http_requests_sampled_status 
    ON http_requests_sampled(deployment_id, status_code) 
    WHERE status_code >= 400;

CREATE INDEX IF NOT EXISTS idx_http_requests_sampled_created 
    ON http_requests_sampled(created_at);

COMMENT ON TABLE http_requests_sampled IS 'Sampled raw HTTP requests (1%) for debugging and detailed analysis. Retention: 7 days';
COMMENT ON COLUMN http_requests_sampled.path_normalized IS 'Path with dynamic segments replaced (e.g., /users/:id)';
COMMENT ON COLUMN http_requests_sampled.client_ip IS 'Client IP address stored as INET type';

-- ============================================================================
-- ENDPOINT STATISTICS (Daily rollup)
-- ============================================================================

CREATE TABLE IF NOT EXISTS endpoint_stats (
    id SERIAL PRIMARY KEY,
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    path_normalized VARCHAR(200) NOT NULL,
    method VARCHAR(10) NOT NULL,
    
    -- Counts
    request_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    
    -- Latency
    latency_min INTEGER,
    latency_max INTEGER,
    latency_avg INTEGER,
    latency_sum BIGINT DEFAULT 0,
    latency_p95 INTEGER,
    latency_p99 INTEGER,
    
    -- Computed
    error_rate DECIMAL(5,4),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_endpoint_day UNIQUE(deployment_id, date, path_normalized, method)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_endpoint_stats_top 
    ON endpoint_stats(deployment_id, date DESC, request_count DESC);

CREATE INDEX IF NOT EXISTS idx_endpoint_stats_errors 
    ON endpoint_stats(deployment_id, date DESC, error_count DESC) 
    WHERE error_count > 0;

CREATE INDEX IF NOT EXISTS idx_endpoint_stats_date 
    ON endpoint_stats(date DESC);

COMMENT ON TABLE endpoint_stats IS 'Daily aggregated statistics per endpoint for top endpoints analysis. Retention: 90 days';
COMMENT ON COLUMN endpoint_stats.path_normalized IS 'Normalized path pattern (e.g., /api/users/:id)';

-- ============================================================================
-- GEOGRAPHIC DISTRIBUTION (Hourly)
-- ============================================================================

CREATE TABLE IF NOT EXISTS geo_distribution (
    id SERIAL PRIMARY KEY,
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    timestamp_hour TIMESTAMP NOT NULL,
    country_code CHAR(2) NOT NULL,
    region VARCHAR(100),
    
    -- Counts
    request_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_geo_hour UNIQUE(deployment_id, timestamp_hour, country_code, region)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_geo_distribution_deployment_time 
    ON geo_distribution(deployment_id, timestamp_hour DESC);

CREATE INDEX IF NOT EXISTS idx_geo_distribution_country 
    ON geo_distribution(deployment_id, country_code, timestamp_hour DESC);

CREATE INDEX IF NOT EXISTS idx_geo_distribution_time 
    ON geo_distribution(timestamp_hour DESC);

COMMENT ON TABLE geo_distribution IS 'Hourly geographic distribution of requests for geo analytics. Retention: 30 days';
COMMENT ON COLUMN geo_distribution.country_code IS 'ISO 3166-1 alpha-2 country code (e.g., US, DE, GB)';
COMMENT ON COLUMN geo_distribution.region IS 'Region/state name (e.g., California, Hesse)';

-- ============================================================================
-- STATUS CODE DISTRIBUTION (Hourly)
-- ============================================================================

CREATE TABLE IF NOT EXISTS status_code_distribution (
    id SERIAL PRIMARY KEY,
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    timestamp_hour TIMESTAMP NOT NULL,
    status_code SMALLINT NOT NULL,
    
    request_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_status_hour UNIQUE(deployment_id, timestamp_hour, status_code)
);

CREATE INDEX IF NOT EXISTS idx_status_code_time 
    ON status_code_distribution(deployment_id, timestamp_hour DESC);

CREATE INDEX IF NOT EXISTS idx_status_code_code 
    ON status_code_distribution(deployment_id, status_code, timestamp_hour DESC);

COMMENT ON TABLE status_code_distribution IS 'Hourly status code distribution for error analysis. Retention: 30 days';

-- ============================================================================
-- LATENCY BUCKETS (for histogram visualization)
-- ============================================================================

CREATE TABLE IF NOT EXISTS latency_buckets (
    id SERIAL PRIMARY KEY,
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    timestamp_hour TIMESTAMP NOT NULL,
    
    -- Pre-defined bucket ranges
    bucket_0_50ms INTEGER DEFAULT 0,
    bucket_50_100ms INTEGER DEFAULT 0,
    bucket_100_200ms INTEGER DEFAULT 0,
    bucket_200_500ms INTEGER DEFAULT 0,
    bucket_500_1000ms INTEGER DEFAULT 0,
    bucket_1000ms_plus INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_latency_bucket_hour UNIQUE(deployment_id, timestamp_hour)
);

CREATE INDEX IF NOT EXISTS idx_latency_buckets_time 
    ON latency_buckets(deployment_id, timestamp_hour DESC);

COMMENT ON TABLE latency_buckets IS 'Hourly latency distribution buckets for histogram visualization. Retention: 30 days';

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Current stats view (last 60 minutes)
CREATE OR REPLACE VIEW current_http_stats AS
SELECT 
    deployment_id,
    SUM(request_count) as total_requests,
    SUM(request_count_2xx) as total_2xx,
    SUM(request_count_4xx) as total_4xx,
    SUM(request_count_5xx) as total_errors,
    ROUND(SUM(request_count_5xx)::DECIMAL / NULLIF(SUM(request_count), 0), 4) as error_rate,
    ROUND(AVG(latency_avg)::NUMERIC, 0)::INTEGER as avg_latency,
    MAX(latency_p95) as max_p95_latency,
    COUNT(*) as minutes_active,
    NOW() as computed_at
FROM http_metrics_minute
WHERE timestamp_minute > NOW() - INTERVAL '60 minutes'
GROUP BY deployment_id;

COMMENT ON VIEW current_http_stats IS 'Real-time HTTP stats computed from last 60 minutes of data';

-- Top endpoints view (last 24 hours)
CREATE OR REPLACE VIEW top_endpoints_24h AS
SELECT 
    deployment_id,
    path_normalized,
    method,
    SUM(request_count) as total_requests,
    SUM(error_count) as total_errors,
    SUM(success_count) as total_success,
    ROUND(SUM(error_count)::DECIMAL / NULLIF(SUM(request_count), 0), 4) as error_rate,
    ROUND(AVG(latency_avg)::NUMERIC, 0)::INTEGER as avg_latency_ms,
    MAX(latency_p95) as p95_latency_ms
FROM endpoint_stats
WHERE date >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY deployment_id, path_normalized, method
ORDER BY total_requests DESC;

COMMENT ON VIEW top_endpoints_24h IS 'Top endpoints by request volume in the last 24 hours';

-- Geographic summary view (last 24 hours)
CREATE OR REPLACE VIEW geo_summary_24h AS
SELECT 
    deployment_id,
    country_code,
    region,
    SUM(request_count) as total_requests,
    SUM(error_count) as total_errors,
    ROUND(100.0 * SUM(request_count) / NULLIF(
        SUM(SUM(request_count)) OVER (PARTITION BY deployment_id), 0
    ), 2) as percentage
FROM geo_distribution
WHERE timestamp_hour > NOW() - INTERVAL '24 hours'
GROUP BY deployment_id, country_code, region
ORDER BY total_requests DESC;

COMMENT ON VIEW geo_summary_24h IS 'Geographic distribution summary for the last 24 hours';

-- Status code summary view (last 24 hours)
CREATE OR REPLACE VIEW status_code_summary_24h AS
SELECT 
    deployment_id,
    status_code,
    SUM(request_count) as total_requests,
    ROUND(100.0 * SUM(request_count) / NULLIF(
        SUM(SUM(request_count)) OVER (PARTITION BY deployment_id), 0
    ), 2) as percentage
FROM status_code_distribution
WHERE timestamp_hour > NOW() - INTERVAL '24 hours'
GROUP BY deployment_id, status_code
ORDER BY total_requests DESC;

COMMENT ON VIEW status_code_summary_24h IS 'Status code distribution summary for the last 24 hours';

-- ============================================================================
-- FUNCTIONS FOR AGGREGATION
-- ============================================================================

-- Function to aggregate minute data into endpoint_stats
CREATE OR REPLACE FUNCTION aggregate_endpoint_stats(p_deployment_id UUID, p_date DATE)
RETURNS void AS $$
BEGIN
    INSERT INTO endpoint_stats (
        deployment_id, date, path_normalized, method,
        request_count, error_count, success_count,
        latency_min, latency_max, latency_avg, latency_sum,
        error_rate
    )
    SELECT 
        deployment_id,
        p_date,
        path_normalized,
        method,
        COUNT(*),
        COUNT(*) FILTER (WHERE status_code >= 500),
        COUNT(*) FILTER (WHERE status_code < 400),
        MIN(latency_ms),
        MAX(latency_ms),
        AVG(latency_ms)::INTEGER,
        SUM(latency_ms),
        COUNT(*) FILTER (WHERE status_code >= 500)::DECIMAL / NULLIF(COUNT(*), 0)
    FROM http_requests_sampled
    WHERE deployment_id = p_deployment_id
      AND DATE(timestamp) = p_date
    GROUP BY deployment_id, path_normalized, method
    ON CONFLICT (deployment_id, date, path_normalized, method) 
    DO UPDATE SET
        request_count = EXCLUDED.request_count,
        error_count = EXCLUDED.error_count,
        success_count = EXCLUDED.success_count,
        latency_min = EXCLUDED.latency_min,
        latency_max = EXCLUDED.latency_max,
        latency_avg = EXCLUDED.latency_avg,
        latency_sum = EXCLUDED.latency_sum,
        error_rate = EXCLUDED.error_rate,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION aggregate_endpoint_stats IS 'Aggregates sampled requests into daily endpoint statistics';

-- Function to compute percentile from array
CREATE OR REPLACE FUNCTION percentile_cont(p_array BIGINT[], p_percentile FLOAT)
RETURNS INTEGER AS $$
DECLARE
    v_sorted BIGINT[];
    v_index INTEGER;
BEGIN
    IF p_array IS NULL OR array_length(p_array, 1) IS NULL THEN
        RETURN NULL;
    END IF;
    
    v_sorted := array_agg(elem ORDER BY elem) FROM unnest(p_array) elem;
    v_index := CEIL(p_percentile * array_length(v_sorted, 1))::INTEGER;
    
    RETURN v_sorted[v_index];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION percentile_cont IS 'Computes percentile value from an integer array';

-- ============================================================================
-- CLEANUP HELPER FUNCTIONS
-- These functions can be used to manually run cleanup tasks
-- ============================================================================

-- Function to count old records that would be deleted by cleanup
CREATE OR REPLACE FUNCTION count_old_records_to_clean()
RETURNS TABLE (
    table_name TEXT,
    retention_days INTEGER,
    records_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'http_metrics_minute'::TEXT, 30, COUNT(*)::BIGINT
    FROM http_metrics_minute 
    WHERE timestamp_minute < NOW() - INTERVAL '30 days'
    UNION ALL
    SELECT 'http_requests_sampled'::TEXT, 7, COUNT(*)::BIGINT
    FROM http_requests_sampled 
    WHERE created_at < NOW() - INTERVAL '7 days'
    UNION ALL
    SELECT 'geo_distribution'::TEXT, 30, COUNT(*)::BIGINT
    FROM geo_distribution 
    WHERE timestamp_hour < NOW() - INTERVAL '30 days'
    UNION ALL
    SELECT 'status_code_distribution'::TEXT, 30, COUNT(*)::BIGINT
    FROM status_code_distribution 
    WHERE timestamp_hour < NOW() - INTERVAL '30 days'
    UNION ALL
    SELECT 'latency_buckets'::TEXT, 30, COUNT(*)::BIGINT
    FROM latency_buckets 
    WHERE timestamp_hour < NOW() - INTERVAL '30 days'
    UNION ALL
    SELECT 'endpoint_stats'::TEXT, 90, COUNT(*)::BIGINT
    FROM endpoint_stats 
    WHERE date < CURRENT_DATE - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION count_old_records_to_clean IS 'Counts records that would be deleted by cleanup tasks';

-- Function to get table sizes for monitoring
CREATE OR REPLACE FUNCTION get_metrics_table_sizes()
RETURNS TABLE (
    table_name TEXT,
    row_count BIGINT,
    table_size TEXT,
    total_size TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.relname::TEXT,
        c.reltuples::BIGINT,
        pg_size_pretty(pg_relation_size(c.oid)),
        pg_size_pretty(pg_total_relation_size(c.oid))
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relname IN (
        'http_metrics_minute',
        'http_requests_sampled',
        'endpoint_stats',
        'geo_distribution',
        'status_code_distribution',
        'latency_buckets'
    )
    ORDER BY pg_total_relation_size(c.oid) DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_metrics_table_sizes IS 'Shows sizes of HTTP metrics tables';

-- ============================================================================
-- INITIAL GRANTS
-- ============================================================================

-- Grant permissions to monitoring service user
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO monitoring_service;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO monitoring_service;
-- GRANT EXECUTE ON FUNCTION count_old_records_to_clean() TO monitoring_service;
-- GRANT EXECUTE ON FUNCTION get_metrics_table_sizes() TO monitoring_service;