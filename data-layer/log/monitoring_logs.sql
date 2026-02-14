CREATE TABLE IF NOT EXISTS logs_archive (
    id SERIAL PRIMARY KEY,
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    container_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    level VARCHAR(50) NOT NULL DEFAULT 'info', -- 'info', 'warning', 'error', 'fatal', 'debug'
    message TEXT NOT NULL,
    source VARCHAR(100) NOT NULL DEFAULT 'container', -- 'container', 'build', 'system'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    archived_to_minio BOOLEAN DEFAULT false, -- Track if log has been archived
    UNIQUE (container_id, timestamp, message)
);

CREATE INDEX idx_logs_archive_deployment_id ON logs_archive(deployment_id);
CREATE INDEX idx_logs_archive_container_id ON logs_archive(container_id);
CREATE INDEX idx_logs_archive_timestamp ON logs_archive(timestamp DESC);
CREATE INDEX idx_logs_archive_level ON logs_archive(level);
CREATE INDEX idx_logs_archive_deployment_timestamp ON logs_archive(deployment_id, timestamp DESC);
-- Index for archival queries
CREATE INDEX idx_logs_archive_timestamp_not_archived ON logs_archive(timestamp) 
WHERE archived_to_minio = false;

COMMENT ON TABLE logs_archive IS 'Stores aggregated logs from deployment containers for historical viewing. Recent logs (24h) kept in DB, older logs archived to MinIO.';
COMMENT ON COLUMN logs_archive.deployment_id IS 'Foreign key to deployments table';
COMMENT ON COLUMN logs_archive.container_id IS 'Docker/K8s container ID';
COMMENT ON COLUMN logs_archive.level IS 'Log level: info, warning, error, fatal, debug';
COMMENT ON COLUMN logs_archive.message IS 'Log message content';
COMMENT ON COLUMN logs_archive.source IS 'Source of the log: container, build, system';
COMMENT ON COLUMN logs_archive.metadata IS 'Additional JSON metadata about the log entry';
COMMENT ON COLUMN logs_archive.archived_to_minio IS 'Whether this log entry has been archived to MinIO';

-- ============================================================================
-- MINIO BUCKET LIFECYCLE POLICY (run via MinIO CLI or API)
-- ============================================================================
/*
To enable automatic deletion of old logs in MinIO after 90 days:

mc ilm add local/monitoring-logs --expiry-days 90

Or via MinIO Client SDK in the application.

This ensures logs older than 90 days are automatically deleted from MinIO
to control storage costs.
*/

CREATE TABLE IF NOT EXISTS uptime_records (
    id SERIAL PRIMARY KEY,
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    is_up BOOLEAN NOT NULL DEFAULT true,
    uptime_percentage DECIMAL(5, 2) NOT NULL DEFAULT 100.0,
    response_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_uptime_records_deployment_id ON uptime_records(deployment_id);
CREATE INDEX idx_uptime_records_timestamp ON uptime_records(timestamp DESC);
CREATE INDEX idx_uptime_records_deployment_time ON uptime_records(deployment_id, timestamp DESC);

COMMENT ON TABLE uptime_records IS 'Stores uptime tracking data for deployments';
COMMENT ON COLUMN uptime_records.deployment_id IS 'Foreign key to deployments table';
COMMENT ON COLUMN uptime_records.is_up IS 'Whether the deployment was up at this timestamp';
COMMENT ON COLUMN uptime_records.uptime_percentage IS 'Calculated uptime percentage over a period';
COMMENT ON COLUMN uptime_records.response_time_ms IS 'Response time in milliseconds';

CREATE TABLE IF NOT EXISTS health_checks (
    id SERIAL PRIMARY KEY,
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    check_type VARCHAR(50) NOT NULL, -- 'http', 'container', 'database', 'cache'
    status VARCHAR(20) NOT NULL, -- 'healthy', 'unhealthy', 'failed', 'pending'
    response_time_ms INTEGER,
    status_code INTEGER,
    error_message TEXT,
    checked_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_health_checks_deployment_id ON health_checks(deployment_id);
CREATE INDEX idx_health_checks_checked_at ON health_checks(checked_at DESC);
CREATE INDEX idx_health_checks_deployment_checked ON health_checks(deployment_id, checked_at DESC);
CREATE INDEX idx_health_checks_status ON health_checks(status);
CREATE INDEX idx_health_checks_type ON health_checks(check_type);

COMMENT ON TABLE health_checks IS 'Stores health check results for deployments';
COMMENT ON COLUMN health_checks.deployment_id IS 'Foreign key to deployments table';
COMMENT ON COLUMN health_checks.check_type IS 'Type of health check: http, container, database, cache';
COMMENT ON COLUMN health_checks.status IS 'Result status: healthy, unhealthy, failed, pending';
COMMENT ON COLUMN health_checks.response_time_ms IS 'Response time in milliseconds for the check';
COMMENT ON COLUMN health_checks.status_code IS 'HTTP status code for HTTP checks';
COMMENT ON COLUMN health_checks.error_message IS 'Error message if check failed';
COMMENT ON COLUMN health_checks.checked_at IS 'When the check was performed';

CREATE TABLE IF NOT EXISTS deployments_metrics (
    id SERIAL PRIMARY KEY,
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    cpu_usage DECIMAL(5, 2),
    memory_usage BIGINT,
    network_rx BIGINT,
    network_tx BIGINT,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deployments_metrics_deployment_id ON deployments_metrics(deployment_id);
CREATE INDEX idx_deployments_metrics_timestamp ON deployments_metrics(timestamp DESC);
CREATE INDEX idx_deployments_metrics_deployment_time ON deployments_metrics(deployment_id, timestamp DESC);

COMMENT ON TABLE deployments_metrics IS 'Stores performance metrics for deployments';
COMMENT ON COLUMN deployments_metrics.deployment_id IS 'Foreign key to deployments table';
COMMENT ON COLUMN deployments_metrics.cpu_usage IS 'CPU usage percentage';
COMMENT ON COLUMN deployments_metrics.memory_usage IS 'Memory usage in bytes';
COMMENT ON COLUMN deployments_metrics.network_rx IS 'Network bytes received';
COMMENT ON COLUMN deployments_metrics.network_tx IS 'Network bytes transmitted';
COMMENT ON COLUMN deployments_metrics.status IS 'Deployment status at time of metrics collection';

CREATE OR REPLACE VIEW active_deployments_with_containers AS
SELECT 
    d.id as deployment_id,
    d.status as deployment_status,
    d.health_check_path as health_check_endpoint,
    d.database_connections IS NOT NULL AND jsonb_array_length(d.database_connections) > 0 as has_database,
    COALESCE(
        (SELECT EXISTS (
            SELECT 1 FROM deployment_resources dr 
            WHERE dr.deployment_id = d.id AND dr.resource_type = 'redis'
        )),
        false
    ) as has_cache,
    dc.id as container_uuid,
    dc.container_id as container_id,
    dc.container_name,
    dc.deployment_group,
    dc.status as container_status,
    dc.health_status,
    dc.is_active,
    dc.is_primary,
    dc.replica_index,
    dc.internal_ip,
    dc.port,
    dc.host_port
FROM deployments d
LEFT JOIN deployment_containers dc ON dc.deployment_id = d.id AND dc.is_active = true
WHERE d.status IN ('active', 'running', 'starting', 'healthy', 'deploying')
  AND dc.id IS NOT NULL;

COMMENT ON VIEW active_deployments_with_containers IS 'View joining active deployments with their active containers';

CREATE OR REPLACE VIEW monitoring_overview AS
SELECT 
    d.id as deployment_id,
    d.project_id,
    d.environment,
    d.status,
    d.domain,
    d.subdomain,
    d.deployment_strategy,
    d.monitoring_enabled,
    d.health_check_path,
    d.health_check_interval_seconds,
    dc.container_id,
    dc.container_name,
    dc.status as container_status,
    dc.health_status,
    dc.is_active,
    dc.is_primary,
    dc.cpu_usage_percent,
    dc.memory_usage_mb,
    dc.memory_limit_mb,
    dc.started_at as container_started_at,
    dc.became_healthy_at,
    dc.last_health_check_at,
    d.created_at as deployment_created_at,
    d.updated_at as deployment_updated_at
FROM deployments d
LEFT JOIN deployment_containers dc ON dc.deployment_id = d.id AND dc.is_active = true
WHERE d.status NOT IN ('deleted', 'terminated', 'rolled_back');

COMMENT ON VIEW monitoring_overview IS 'Comprehensive view for monitoring dashboard showing all deployments and their containers';

CREATE INDEX IF NOT EXISTS idx_deployment_containers_active_status 
ON deployment_containers(deployment_id, status, is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_deployment_containers_health 
ON deployment_containers(deployment_id, health_status, is_active) 
WHERE is_active = true;
