CREATE TABLE IF NOT EXISTS platform_log_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event categorization
    event_type VARCHAR(50) NOT NULL, -- 'build', 'deployment', 'container', 'system', 'security'
    event_subtype VARCHAR(50) NOT NULL, -- 'build_start', 'build_step', 'build_complete', 'deploy_start', 'deploy_step', 'deploy_complete', 'container_log', 'health_check', 'alert'
    
    -- Resource identification
    resource_type VARCHAR(50) NOT NULL, -- 'build', 'deployment', 'project', 'company', 'system'
    resource_id UUID NOT NULL, -- The ID of the build, deployment, project, etc.
    
    -- Parent resource for grouping (e.g., project_id for all deployment logs)
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Container identification (for container logs)
    container_id VARCHAR(255),
    container_name VARCHAR(255),
    
    -- Event details
    severity VARCHAR(20) NOT NULL DEFAULT 'info', -- 'debug', 'info', 'warning', 'error', 'fatal'
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}', -- Flexible metadata based on event type
    
    -- Source information
    source_service VARCHAR(100) NOT NULL, -- 'build-service', 'deploy-service', 'monitoring-service', etc.
    source_host VARCHAR(255), -- Hostname/container that generated the log
    
    -- Timestamps
    event_timestamp TIMESTAMP NOT NULL DEFAULT NOW(), -- When the event actually occurred
    ingested_at TIMESTAMP DEFAULT NOW(), -- When it was stored
    
    -- Storage tier tracking
    storage_tier VARCHAR(20) DEFAULT 'hot', -- 'hot' (DB), 'warm' (MinIO), 'cold' (deleted)
    archived_to_minio BOOLEAN DEFAULT false,
    minio_object_path VARCHAR(500),
    
    -- For streaming/acknowledgment
    sequence_number BIGINT GENERATED ALWAYS AS IDENTITY,
    
    -- Indexes
    CONSTRAINT chk_event_type CHECK (event_type IN ('build', 'deployment', 'container', 'system', 'security', 'audit')),
    CONSTRAINT chk_severity CHECK (severity IN ('debug', 'info', 'warning', 'error', 'fatal')),
    CONSTRAINT chk_storage_tier CHECK (storage_tier IN ('hot', 'warm', 'cold'))
);

-- Indexes for common query patterns
CREATE INDEX idx_platform_logs_resource ON platform_log_events(resource_type, resource_id, event_timestamp DESC);
CREATE INDEX idx_platform_logs_project ON platform_log_events(project_id, event_timestamp DESC);
CREATE INDEX idx_platform_logs_company ON platform_log_events(company_id, event_timestamp DESC);
CREATE INDEX idx_platform_logs_type ON platform_log_events(event_type, event_timestamp DESC);
CREATE INDEX idx_platform_logs_severity ON platform_log_events(severity, event_timestamp DESC) WHERE severity IN ('error', 'fatal');
CREATE INDEX idx_platform_logs_timestamp ON platform_log_events(event_timestamp DESC);
CREATE INDEX idx_platform_logs_sequence ON platform_log_events(sequence_number);

-- Partial index for unarchived logs (used by archival worker)
CREATE INDEX idx_platform_logs_not_archived ON platform_log_events(event_timestamp) 
WHERE archived_to_minio = false;

-- Comments
COMMENT ON TABLE platform_log_events IS 'Unified logging table for all client-facing platform events';
COMMENT ON COLUMN platform_log_events.event_type IS 'High-level category: build, deployment, container, system, security';
COMMENT ON COLUMN platform_log_events.event_subtype IS 'Specific event type: build_start, deploy_step, container_log, etc.';
COMMENT ON COLUMN platform_log_events.resource_type IS 'Type of resource this log relates to';
COMMENT ON COLUMN platform_log_events.resource_id IS 'UUID of the resource (build_id, deployment_id, etc.)';
COMMENT ON COLUMN platform_log_events.metadata IS 'JSON metadata specific to the event type';
COMMENT ON COLUMN platform_log_events.storage_tier IS 'Current storage location: hot (DB), warm (MinIO), cold (deleted)';


CREATE OR REPLACE VIEW recent_platform_logs AS
SELECT 
    id,
    event_type,
    event_subtype,
    resource_type,
    resource_id,
    project_id,
    company_id,
    severity,
    message,
    metadata,
    source_service,
    event_timestamp,
    ingested_at,
    storage_tier
FROM platform_log_events
WHERE event_timestamp > NOW() - INTERVAL '24 hours'
ORDER BY event_timestamp DESC;

COMMENT ON VIEW recent_platform_logs IS 'Recent platform logs (last 24h) for fast queries';

CREATE OR REPLACE VIEW platform_log_stats AS
SELECT 
    project_id,
    event_type,
    severity,
    DATE(event_timestamp) as date,
    COUNT(*) as event_count
FROM platform_log_events
WHERE event_timestamp > NOW() - INTERVAL '30 days'
GROUP BY project_id, event_type, severity, DATE(event_timestamp);

CREATE TABLE IF NOT EXISTS log_retention_policies (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    hot_retention_hours INTEGER DEFAULT 24, -- Keep in DB
    warm_retention_days INTEGER DEFAULT 90, -- Keep in MinIO
    cold_retention_days INTEGER DEFAULT 365, -- Keep in cold storage (or delete)
    archive_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE (event_type)
);

-- Insert default policies
INSERT INTO log_retention_policies (event_type, hot_retention_hours, warm_retention_days, cold_retention_days) VALUES
    ('build', 24, 90, 365),
    ('deployment', 24, 90, 365),
    ('container', 6, 30, 90), -- Container logs expire faster
    ('system', 6, 30, 90),
    ('security', 168, 365, 2555) -- Security logs kept longer (7 years)
ON CONFLICT (event_type) DO NOTHING;

-- ============================================================================
-- REAL-TIME LOG STREAMING (Redis channel tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS log_stream_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id VARCHAR(255) NOT NULL UNIQUE, -- Client connection ID
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    started_at TIMESTAMP DEFAULT NOW(),
    last_sequence_number BIGINT,
    client_ip VARCHAR(45),
    user_agent TEXT,
    active BOOLEAN DEFAULT true
);

CREATE INDEX idx_log_streams_resource ON log_stream_subscriptions(resource_type, resource_id, active);
CREATE INDEX idx_log_streams_project ON log_stream_subscriptions(project_id, active);

CREATE TABLE IF NOT EXISTS log_archival_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    event_type VARCHAR(50),
    records_processed INTEGER DEFAULT 0,
    records_archived INTEGER DEFAULT 0,
    records_deleted INTEGER DEFAULT 0,
    minio_objects_created INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'running', -- 'running', 'completed', 'failed'
    error_message TEXT
);

CREATE OR REPLACE FUNCTION archive_logs_to_minio(
    p_event_type VARCHAR(50),
    p_batch_size INTEGER DEFAULT 1000
)
RETURNS TABLE(
    archived_count INTEGER,
    minio_objects INTEGER
) AS $$
DECLARE
    v_archived_count INTEGER := 0;
    v_minio_objects INTEGER := 0;
    v_hot_hours INTEGER;
BEGIN
    -- Get retention policy
    SELECT hot_retention_hours INTO v_hot_hours
    FROM log_retention_policies
    WHERE event_type = p_event_type;
    
    IF v_hot_hours IS NULL THEN
        v_hot_hours := 24;
    END IF;
    
    -- Mark logs as archived (actual MinIO upload done by application)
    UPDATE platform_log_events
    SET 
        archived_to_minio = true,
        storage_tier = 'warm',
        minio_object_path = 'platform-logs/' || event_type || '/' || DATE(event_timestamp) || '/' || id || '.json.gz'
    WHERE 
        event_type = p_event_type
        AND archived_to_minio = false
        AND event_timestamp < NOW() - (v_hot_hours || ' hours')::INTERVAL
        AND id IN (
            SELECT id FROM platform_log_events
            WHERE event_type = p_event_type
            AND archived_to_minio = false
            AND event_timestamp < NOW() - (v_hot_hours || ' hours')::INTERVAL
            LIMIT p_batch_size
        );
    
    GET DIAGNOSTICS v_archived_count = ROW_COUNT;
    
    archived_count := v_archived_count;
    minio_objects := CEIL(v_archived_count::FLOAT / 1000); -- Approximate
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to get logs with pagination
CREATE OR REPLACE FUNCTION get_platform_logs(
    p_resource_type VARCHAR(50),
    p_resource_id UUID,
    p_start_time TIMESTAMP,
    p_end_time TIMESTAMP,
    p_severity VARCHAR(20) DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    id UUID,
    event_type VARCHAR(50),
    event_subtype VARCHAR(50),
    severity VARCHAR(20),
    message TEXT,
    metadata JSONB,
    source_service VARCHAR(100),
    event_timestamp TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ple.id,
        ple.event_type,
        ple.event_subtype,
        ple.severity,
        ple.message,
        ple.metadata,
        ple.source_service,
        ple.event_timestamp
    FROM platform_log_events ple
    WHERE ple.resource_type = p_resource_type
      AND ple.resource_id = p_resource_id
      AND ple.event_timestamp BETWEEN p_start_time AND p_end_time
      AND (p_severity IS NULL OR ple.severity = p_severity)
    ORDER BY ple.event_timestamp DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;
