CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    
    github_installation_id BIGINT REFERENCES github_installations(installation_id) ON DELETE SET NULL,
    github_repository_id VARCHAR(50),
    github_repository_full_name VARCHAR(255), 
    
    git_repo_url TEXT NOT NULL,
    git_branches JSONB, 
    
    framework_data JSONB,
    
    data_region data_region DEFAULT 'eu-central',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    
    UNIQUE (team_id, slug)
);

CREATE INDEX idx_projects_github_installation ON projects(github_installation_id);
CREATE INDEX idx_projects_github_repository ON projects(github_repository_id);

create table
    project_env_configs (
        id uuid default gen_random_uuid () not null primary key,
        project_id uuid references projects (id) NOT NULL,
        service_name varchar(100) not null,
        env_content text not null,
        folder_location varchar(100) not null,
        created_at timestamp default now (),
        updated_at timestamp default now (),
        unique (project_id, service_name)
    );

CREATE TABLE
    builds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        initiated_by_user_id UUID REFERENCES users (id),
        image_tags JSONB,
        -- Git info
        commit_hash VARCHAR(40) NOT NULL,
        build_time_seconds INTEGER,
        error_message TEXT,
        branch VARCHAR(255),
        -- Status
        status VARCHAR(50) DEFAULT 'queued',
        metadata JSONB DEFAULT '{}',
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW (),
        completed_at TIMESTAMP
    )
CREATE TABLE
    IF NOT EXISTS build_logs (
        id SERIAL PRIMARY KEY,
        build_id UUID NOT NULL REFERENCES builds (id) ON DELETE CASCADE,
        log_type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW ()

CREATE TABLE build_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    build_id UUID NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_build_usage_company_time
ON build_usage (company_id, created_at);
    );

CREATE INDEX idx_build_logs_build_id ON build_logs (build_id);

CREATE INDEX idx_build_logs_created_at ON build_logs (created_at);

CREATE TABLE IF NOT EXISTS github_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id BIGINT UNIQUE NOT NULL,
    company_id UUID REFERENCES companies (id) ON DELETE CASCADE,
    account_login VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) NOT NULL, -- 'User' or 'Organization'
    account_id BIGINT NOT NULL,
    repositories JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_projects_github_installation ON projects(github_installation_id)

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
    
    -- Database connections
    database_connections JSONB DEFAULT '[]', -- Auto-provisioned database details
    
    -- Status and lifecycle
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'deploying', 'active', 'failed', 'rolled_back', 'terminated'
    deployment_strategy VARCHAR(50) DEFAULT 'blue_green', -- 'blue_green', 'rolling', 'canary'
    
    -- Deployment metadata
    deployed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    deployment_trigger VARCHAR(50), -- 'manual', 'auto_push', 'auto_merge', 'scheduled', 'rollback'
    approval_required BOOLEAN DEFAULT false,
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    
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

CREATE UNIQUE INDEX ux_deployments_active_preview
ON deployments (project_id, environment, branch)
WHERE status = 'active' AND environment = 'preview';


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
    alert_type VARCHAR(50) NOT NULL, -- 'high_error_rate', 'high_response_time', 'health_check_failed', 'memory_limit', 'cpu_threshold'
    severity VARCHAR(20) NOT NULL, -- 'warning', 'critical'
    alert_message TEXT NOT NULL,
    alert_data JSONB DEFAULT '{}',
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    notified_users JSONB DEFAULT '[]', -- Array of user IDs notified
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deployment_alerts_deployment ON deployment_alerts(deployment_id);
CREATE INDEX idx_deployment_alerts_unresolved ON deployment_alerts(deployment_id, resolved) WHERE resolved = false;


CREATE TABLE
    audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        user_id UUID REFERENCES users (id) ON DELETE SET NULL,
        team_id UUID REFERENCES teams (id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50),
        resource_id UUID,
        ip_address INET,
        user_agent TEXT,
        success BOOLEAN DEFAULT true,
        error_message TEXT,
        is_gdpr_action BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW ()
    );

CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);

CREATE INDEX idx_audit_logs_gdpr ON audit_logs (is_gdpr_action)
WHERE
    is_gdpr_action = true;

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