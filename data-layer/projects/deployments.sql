CREATE TABLE deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    build_id UUID NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
    
    deployment_number SERIAL,
    environment VARCHAR(50) NOT NULL, -- 'production', 'staging', 'preview'
    
    -- Git information
    branch VARCHAR(255) NOT NULL,
    commit_hash VARCHAR(40) NOT NULL,
    commit_message TEXT,
    commit_author VARCHAR(255),
    
    -- Deployment configuration
    domain VARCHAR(255), -- e.g., 'yourapp.com', 'staging.yourapp.com', 'feature-123.preview.yourapp.com'
    subdomain VARCHAR(255), -- for preview environments
    
    -- Infrastructure details
    container_image VARCHAR(500),
    instance_type VARCHAR(50), -- 'standard', 'performance', 'compute-optimized'
    replica_count INTEGER DEFAULT 1,
    auto_scaling_enabled BOOLEAN DEFAULT false,
    min_replicas INTEGER DEFAULT 1,
    max_replicas INTEGER DEFAULT 10,
    
    -- Resource limits
    cpu_limit VARCHAR(20), -- e.g., '1000m' (1 CPU core)
    memory_limit VARCHAR(20), -- e.g., '512Mi', '2Gi'
    
    -- Health check configuration
    health_check_path VARCHAR(255) DEFAULT '/health',
    health_check_interval_seconds INTEGER DEFAULT 30,
    health_check_timeout_seconds INTEGER DEFAULT 5,
    
    -- Environment variables and secrets
    env_vars JSONB DEFAULT '{}', -- Non-sensitive environment variables
    secret_refs JSONB DEFAULT '[]', -- References to secrets stored securely
    
    -- retries
    retry_count INTEGER DEFAULT 
    last_retry_at TIMESTAMP
    retry_errors JSONB DEFAULT '[]',

    -- Database connections
    database_connections JSONB DEFAULT '[]', -- Auto-provisioned database details
    
    -- Status and lifecycle
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'deploying', 'active', 'failed', 'rolled_back', 'terminated'
    deployment_strategy VARCHAR(50) DEFAULT 'blue_green', -- 'blue_green', 'rolling', 'canary'
    
    -- Deployment metadata
    deployed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    deployment_trigger VARCHAR(50), -- 'manual', 'auto_push', 'auto_merge', 'scheduled', 'rollback'
    error_message TEXT,
    approval_required BOOLEAN DEFAULT false,
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    detected_dependencies JSONB DEFAULT '{}'
    
    -- Rollback information
    is_rollback BOOLEAN DEFAULT false,
    rolled_back_from_deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
    rollback_reason TEXT,
    
    -- SSL/Security
    ssl_enabled BOOLEAN DEFAULT true,
    ssl_certificate_id UUID, -- Reference to SSL certificate management
    security_headers JSONB DEFAULT '{"hsts": true, "csp": true, "x_frame_options": "DENY"}',
    
    -- Observability & Monitoring (auto-enabled)
    monitoring_enabled BOOLEAN DEFAULT true,
    logging_enabled BOOLEAN DEFAULT true,
    error_tracking_enabled BOOLEAN DEFAULT true,
    performance_monitoring_enabled BOOLEAN DEFAULT true,
    
    -- Traffic & Performance
    traffic_percentage INTEGER DEFAULT 100, -- For canary deployments
    current_requests_per_minute INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER,
    error_rate_percentage DECIMAL(5, 2),
    
    -- Quality gates
    tests_passed BOOLEAN,
    security_scan_passed BOOLEAN,
    performance_benchmark_passed BOOLEAN,
    vulnerability_scan_results JSONB,
    
    -- Preview environment specific
    preview_expires_at TIMESTAMP, -- Auto-cleanup for preview environments
    is_ephemeral BOOLEAN DEFAULT false, -- Preview environments are ephemeral
    
    -- Timestamps
    deployment_started_at TIMESTAMP,
    deployment_completed_at TIMESTAMP,
    last_health_check_at TIMESTAMP,
    terminated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CHECK (environment IN ('production', 'staging', 'preview')),
    CHECK (status IN ('pending', 'deploying', 'active', 'failed', 'rolled_back', 'terminated')),
    CHECK (traffic_percentage >= 0 AND traffic_percentage <= 100)
);

CREATE INDEX IF NOT EXISTS idx_deployments_retry_count 
ON deployments(retry_count) 
WHERE status = 'failed' AND retry_count >= 5;

ALTER TABLE deployments 
ADD CONSTRAINT chk_deployments_retry_count 
CHECK (retry_count >= 0 AND retry_count <= 10);


CREATE UNIQUE INDEX ux_deployments_active_preview
ON deployments (project_id, environment, branch)
WHERE status = 'active' AND environment = 'preview';

CREATE TABLE IF NOT EXISTS deployment_logs (
    id SERIAL PRIMARY KEY,
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    log_type VARCHAR(50) NOT NULL,  -- 'info', 'success', 'error', 'warning'
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_deployment_logs_deployment_id (deployment_id),
    INDEX idx_deployment_logs_created_at (created_at),
    INDEX idx_deployment_logs_log_type (log_type)
);

-- Add comment
COMMENT ON TABLE deployment_logs IS 'Stores all deployment logs for historical viewing and debugging';
COMMENT ON COLUMN deployment_logs.deployment_id IS 'Foreign key to deployments table';
COMMENT ON COLUMN deployment_logs.log_type IS 'Type of log: info, success, error, warning';
COMMENT ON COLUMN deployment_logs.message IS 'Log message content';
COMMENT ON COLUMN deployment_logs.created_at IS 'Timestamp when log was created';

-- Indexes for performance
CREATE INDEX idx_deployments_project_id ON deployments(project_id);
CREATE INDEX idx_deployments_build_id ON deployments(build_id);
CREATE INDEX idx_deployments_environment ON deployments(environment);
CREATE INDEX idx_deployments_status ON deployments(project_id, status);
CREATE INDEX idx_deployments_branch ON deployments(project_id, branch);
CREATE INDEX idx_deployments_created_at ON deployments(created_at DESC);
CREATE INDEX idx_deployments_active ON deployments(project_id, environment) WHERE status = 'active';
CREATE INDEX idx_deployments_preview_expires ON deployments(preview_expires_at) WHERE is_ephemeral = true;

-- Deployment events log (for timeline/activity feed)
CREATE TABLE deployment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'started', 'container_built', 'health_check_passed', 'traffic_routed', 'completed', 'failed', 'rolled_back'
    event_message TEXT,
    event_data JSONB DEFAULT '{}',
    severity VARCHAR(20) DEFAULT 'info', -- 'info', 'warning', 'error', 'critical'
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deployment_events_deployment_id ON deployment_events(deployment_id);
CREATE INDEX idx_deployment_events_created_at ON deployment_events(created_at DESC);

-- Deployment approvals (for production deploys requiring manual approval)
CREATE TABLE deployment_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    approval_notes TEXT,
    requested_at TIMESTAMP DEFAULT NOW(),
    responded_at TIMESTAMP,
    
    UNIQUE (deployment_id)
);

CREATE INDEX idx_deployment_approvals_status ON deployment_approvals(status) WHERE status = 'pending';

-- Deployment rollback history
CREATE TABLE deployment_rollbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    to_deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    initiated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    automatic BOOLEAN DEFAULT false, -- Auto-rollback on health check failure
    rollback_duration_seconds INTEGER,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deployment_rollbacks_from ON deployment_rollbacks(from_deployment_id);

-- Deployment environment variables history (for auditing changes)
CREATE TABLE deployment_env_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    variable_key VARCHAR(255) NOT NULL,
    previous_value_hash VARCHAR(64), -- Hash of previous value for security
    new_value_hash VARCHAR(64), -- Hash of new value
    change_type VARCHAR(20) NOT NULL, -- 'added', 'modified', 'removed'
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deployment_env_history_deployment ON deployment_env_history(deployment_id);

-- Auto-provisioned resources (databases, redis, storage, etc.)
CREATE TABLE deployment_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL, -- 'postgresql', 'mysql', 'redis', 's3_storage', 'smtp'
    resource_name VARCHAR(255) NOT NULL,
    connection_string_encrypted TEXT, -- Encrypted connection details
    resource_config JSONB DEFAULT '{}',
    provisioned_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'active', -- 'provisioning', 'active', 'failed', 'terminated'
    
    UNIQUE (deployment_id, resource_type, resource_name)
);

CREATE INDEX idx_deployment_resources_deployment ON deployment_resources(deployment_id);

-- Deployment alerts and notifications
CREATE TABLE deployment_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- For project-level alerts
    alert_type VARCHAR(50) NOT NULL, -- 'high_error_rate', 'high_response_time', 'health_check_failed', 'memory_limit', 'cpu_threshold', 'disk_space', 'database_connection', 'ssl_expiry'
    severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    alert_message TEXT NOT NULL,
    alert_data JSONB DEFAULT '{}', -- Additional metadata about the alert
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged BOOLEAN DEFAULT false, -- User acknowledged but not resolved
    acknowledged_at TIMESTAMP,
    acknowledged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notified_users JSONB DEFAULT '[]', -- Array of user IDs notified
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deployment_alerts_deployment ON deployment_alerts(deployment_id);
CREATE INDEX idx_deployment_alerts_project ON deployment_alerts(project_id);
CREATE INDEX idx_deployment_alerts_unresolved ON deployment_alerts(deployment_id, resolved) WHERE resolved = false;
CREATE INDEX idx_deployment_alerts_project_unresolved ON deployment_alerts(project_id, resolved) WHERE resolved = false;
CREATE INDEX idx_deployment_alerts_severity ON deployment_alerts(severity);
CREATE INDEX idx_deployment_alerts_type ON deployment_alerts(alert_type);
CREATE INDEX idx_deployment_alerts_created_at ON deployment_alerts(created_at DESC);



CREATE TABLE
    deployment_metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        deployment_id UUID REFERENCES deployments (id) ON DELETE CASCADE,
        metric_date DATE DEFAULT CURRENT_DATE,
        uptime_percentage DECIMAL(5, 2),
        avg_response_time_ms INTEGER,
        total_requests INTEGER,
        total_errors INTEGER,
        created_at TIMESTAMP DEFAULT NOW (),
        UNIQUE (project_id, deployment_id, metric_date)
    );

CREATE INDEX idx_metrics_project_date ON deployment_metrics (project_id, metric_date DESC);

CREATE TABLE deployment_containers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    
    -- Container identification
    container_id VARCHAR(255) UNIQUE NOT NULL, -- Docker/K8s container ID
    container_name VARCHAR(255) NOT NULL,
    image VARCHAR(500) NOT NULL,
    
    -- Deployment strategy tracking
    deployment_group VARCHAR(50), -- 'blue', 'green', 'canary', 'stable', 'batch-1', 'batch-2', etc.
    is_active BOOLEAN DEFAULT true, -- Currently receiving traffic
    is_primary BOOLEAN DEFAULT false, -- Primary group (for blue/green)
    replica_index INTEGER, -- For tracking which replica this is (0, 1, 2, etc.)
    
    -- Container state
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'starting', 'running', 'healthy', 'unhealthy', 'stopping', 'stopped', 'failed'
    health_status VARCHAR(50) DEFAULT 'unknown', -- 'healthy', 'unhealthy', 'starting', 'unknown'
    health_checks_passed INTEGER DEFAULT 0,
    health_checks_failed INTEGER DEFAULT 0,
    consecutive_health_failures INTEGER DEFAULT 0,
    
    -- Network configuration
    internal_ip VARCHAR(45), -- IPv4 or IPv6
    port INTEGER,
    exposed_ports JSONB DEFAULT '[]',
    host_port INTEGER, -- Port on host machine (if applicable)
    
    -- Resource usage (latest snapshot)
    cpu_usage_percent DECIMAL(5,2),
    memory_usage_mb INTEGER,
    memory_limit_mb INTEGER,
    cpu_limit_millicores INTEGER, -- CPU in millicores (1000m = 1 core)
    
    -- Environment and configuration
    env_vars JSONB DEFAULT '{}',
    volumes JSONB DEFAULT '[]',
    
    -- Lifecycle timestamps
    started_at TIMESTAMP,
    became_healthy_at TIMESTAMP,
    last_health_check_at TIMESTAMP,
    stopped_at TIMESTAMP,
    terminated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CHECK (status IN ('pending', 'starting', 'running', 'healthy', 'unhealthy', 'stopping', 'stopped', 'failed')),
    CHECK (health_status IN ('healthy', 'unhealthy', 'starting', 'unknown'))
);

-- Indexes for performance
CREATE INDEX idx_containers_deployment_id ON deployment_containers(deployment_id);
CREATE INDEX idx_containers_deployment_status ON deployment_containers(deployment_id, status);
CREATE INDEX idx_containers_deployment_group ON deployment_containers(deployment_id, deployment_group);
CREATE INDEX idx_containers_active ON deployment_containers(deployment_id, is_active) WHERE is_active = true;
CREATE INDEX idx_containers_health ON deployment_containers(deployment_id, health_status);
CREATE INDEX idx_containers_container_id ON deployment_containers(container_id);
CREATE INDEX idx_containers_created_at ON deployment_containers(created_at DESC);

CREATE TABLE deployment_strategy_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    
    strategy VARCHAR(50) NOT NULL, -- 'blue_green', 'rolling', 'canary', 'recreate'
    current_phase VARCHAR(50) NOT NULL, -- 'preparing', 'deploying_new', 'health_checking', 'switching_traffic', 'draining_old', 'monitoring', 'completed', 'rolling_back', 'failed'
    
    -- Blue/Green specific
    active_group VARCHAR(50), -- 'blue' or 'green'
    standby_group VARCHAR(50), -- 'blue' or 'green'
    
    -- Rolling update specific
    total_batches INTEGER,
    current_batch INTEGER DEFAULT 0,
    batch_size INTEGER,
    completed_batches INTEGER DEFAULT 0,
    failed_batches INTEGER DEFAULT 0,
    
    -- Canary specific
    canary_traffic_percentage INTEGER DEFAULT 10,
    canary_duration_minutes INTEGER DEFAULT 30,
    canary_start_time TIMESTAMP,
    canary_analysis_passed BOOLEAN,
    canary_error_threshold DECIMAL(5,2) DEFAULT 5.0, -- Max error rate percentage
    canary_response_time_threshold_ms INTEGER DEFAULT 1000,
    
    -- State metadata
    state_data JSONB DEFAULT '{}', -- Additional state information
    rollback_target_container_ids JSONB DEFAULT '[]', -- Container IDs to rollback to
    
    -- Progress tracking
    total_replicas INTEGER,
    healthy_replicas INTEGER DEFAULT 0,
    unhealthy_replicas INTEGER DEFAULT 0,
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Timestamps
    phase_started_at TIMESTAMP DEFAULT NOW(),
    phase_updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE (deployment_id)
);

CREATE INDEX idx_strategy_state_deployment ON deployment_strategy_state(deployment_id);
CREATE INDEX idx_strategy_state_phase ON deployment_strategy_state(current_phase);
CREATE INDEX idx_strategy_state_strategy ON deployment_strategy_state(strategy);

CREATE TABLE deployment_traffic_routing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    
    routing_group VARCHAR(50) NOT NULL, -- 'blue', 'green', 'canary', 'stable'
    traffic_percentage INTEGER NOT NULL DEFAULT 0,
    container_ids JSONB DEFAULT '[]', -- Array of container IDs receiving traffic
    
    -- Routing configuration
    routing_rules JSONB DEFAULT '{}', -- Advanced routing rules (header-based, geo-based, etc.)
    load_balancing_algorithm VARCHAR(50) DEFAULT 'round_robin', -- 'round_robin', 'least_connections', 'ip_hash'
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    activated_at TIMESTAMP DEFAULT NOW(),
    deactivated_at TIMESTAMP,
    
    -- Metadata
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CHECK (traffic_percentage >= 0 AND traffic_percentage <= 100)
);

CREATE INDEX idx_traffic_routing_deployment ON deployment_traffic_routing(deployment_id);
CREATE INDEX idx_traffic_routing_active ON deployment_traffic_routing(deployment_id, is_active) WHERE is_active = true;
CREATE INDEX idx_traffic_routing_group ON deployment_traffic_routing(deployment_id, routing_group);

CREATE TABLE container_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    container_id UUID NOT NULL REFERENCES deployment_containers(id) ON DELETE CASCADE,
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    
    check_type VARCHAR(50) NOT NULL, -- 'http', 'tcp', 'exec', 'startup', 'liveness', 'readiness'
    status VARCHAR(20) NOT NULL, -- 'passed', 'failed', 'timeout'
    
    -- Check details
    endpoint VARCHAR(255), -- Health check endpoint
    response_time_ms INTEGER,
    status_code INTEGER, -- For HTTP checks
    response_body TEXT, -- Limited response body for debugging
    error_message TEXT,
    
    -- Timing
    checked_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_health_checks_container ON container_health_checks(container_id, checked_at DESC);
CREATE INDEX idx_health_checks_deployment ON container_health_checks(deployment_id, checked_at DESC);
CREATE INDEX idx_health_checks_failed ON container_health_checks(container_id, status) WHERE status = 'failed';
CREATE INDEX idx_health_checks_type ON container_health_checks(container_id, check_type);

-- Partition by month for better performance (optional, but recommended for high-traffic systems)
-- This is a comment showing how you might partition this table:
-- CREATE TABLE container_health_checks_2024_01 PARTITION OF container_health_checks
-- FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE container_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    container_id UUID NOT NULL REFERENCES deployment_containers(id) ON DELETE CASCADE,
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    
    -- Resource metrics
    cpu_usage_percent DECIMAL(5,2),
    cpu_throttling_percent DECIMAL(5,2), -- Percentage of time CPU was throttled
    memory_usage_mb INTEGER,
    memory_limit_mb INTEGER,
    memory_cache_mb INTEGER,
    
    -- Network metrics
    network_rx_bytes BIGINT, -- Received bytes
    network_tx_bytes BIGINT, -- Transmitted bytes
    network_rx_packets BIGINT,
    network_tx_packets BIGINT,
    network_rx_errors INTEGER,
    network_tx_errors INTEGER,
    
    -- Disk I/O metrics
    disk_read_bytes BIGINT,
    disk_write_bytes BIGINT,
    disk_read_ops INTEGER,
    disk_write_ops INTEGER,
    
    -- Application metrics (if available)
    active_connections INTEGER,
    requests_per_second DECIMAL(10,2),
    avg_response_time_ms INTEGER,
    error_count INTEGER,
    
    recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_container_metrics_container ON container_metrics(container_id, recorded_at DESC);
CREATE INDEX idx_container_metrics_deployment ON container_metrics(deployment_id, recorded_at DESC);
CREATE INDEX idx_container_metrics_recorded_at ON container_metrics(recorded_at DESC);

CREATE TABLE deployment_phase_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    strategy_state_id UUID REFERENCES deployment_strategy_state(id) ON DELETE CASCADE,
    
    from_phase VARCHAR(50),
    to_phase VARCHAR(50) NOT NULL,
    
    transition_reason TEXT,
    transition_metadata JSONB DEFAULT '{}',
    
    -- Timing
    duration_seconds INTEGER, -- Time spent in previous phase
    transitioned_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_phase_transitions_deployment ON deployment_phase_transitions(deployment_id, transitioned_at DESC);
CREATE INDEX idx_phase_transitions_to_phase ON deployment_phase_transitions(to_phase);

CREATE TABLE canary_analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    strategy_state_id UUID REFERENCES deployment_strategy_state(id) ON DELETE CASCADE,
    
    analysis_type VARCHAR(50) NOT NULL, -- 'automatic', 'manual', 'scheduled'
    
    -- Canary metrics
    canary_error_rate DECIMAL(5,2),
    canary_avg_response_time_ms INTEGER,
    canary_p95_response_time_ms INTEGER,
    canary_p99_response_time_ms INTEGER,
    canary_request_count INTEGER,
    
    -- Baseline metrics (for comparison)
    baseline_error_rate DECIMAL(5,2),
    baseline_avg_response_time_ms INTEGER,
    baseline_p95_response_time_ms INTEGER,
    baseline_p99_response_time_ms INTEGER,
    baseline_request_count INTEGER,
    
    -- Analysis results
    passed BOOLEAN NOT NULL,
    score DECIMAL(5,2), -- Overall health score 0-100
    failure_reasons JSONB DEFAULT '[]',
    recommendations TEXT,
    
    -- Decision
    decision VARCHAR(50), -- 'promote', 'continue_monitoring', 'rollback'
    decision_made_by VARCHAR(50), -- 'automatic', 'user'
    decision_made_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    analyzed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_canary_analysis_deployment ON canary_analysis_results(deployment_id, analyzed_at DESC);
CREATE INDEX idx_canary_analysis_passed ON canary_analysis_results(passed);

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- View to get current active containers per deployment
CREATE VIEW deployment_active_containers AS
SELECT 
    d.id as deployment_id,
    d.project_id,
    d.environment,
    dc.id as container_id,
    dc.container_name,
    dc.deployment_group,
    dc.status,
    dc.health_status,
    dc.is_active,
    dc.is_primary
FROM deployments d
JOIN deployment_containers dc ON dc.deployment_id = d.id
WHERE dc.status IN ('running', 'healthy')
  AND dc.is_active = true;

-- View to get deployment strategy summary
CREATE VIEW deployment_strategy_summary AS
SELECT 
    d.id as deployment_id,
    d.project_id,
    d.environment,
    d.status as deployment_status,
    dss.strategy,
    dss.current_phase,
    dss.active_group,
    dss.standby_group,
    dss.healthy_replicas,
    dss.unhealthy_replicas,
    dss.total_replicas,
    dss.phase_started_at,
    EXTRACT(EPOCH FROM (NOW() - dss.phase_started_at))::INTEGER as phase_duration_seconds
FROM deployments d
LEFT JOIN deployment_strategy_state dss ON dss.deployment_id = d.id;

