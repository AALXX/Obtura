CREATE TABLE
    projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        team_id UUID REFERENCES teams (id) ON DELETE CASCADE,
        -- Git info
        git_repo_url TEXT NOT NULL,
        git_branches JSONB,

        -- Config
        runtime VARCHAR(50), -- 'nodejs', 'python', 'php'
        framework VARCHAR(100),

        -- Environment variables (encrypt in app layer)
        env_variables JSONB,
        -- GDPR Essential
        data_region data_region DEFAULT 'eu-central',
        created_at TIMESTAMP DEFAULT NOW (),
        updated_at TIMESTAMP DEFAULT NOW (),
        deleted_at TIMESTAMP,
        UNIQUE (team_id, slug)
    );

CREATE TABLE builds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    initiated_by_user_id UUID REFERENCES users (id),
    image_tags JSONB,
    
    -- Git info
    commit_hash VARCHAR(40) NOT NULL,
    branch VARCHAR(255),
    -- Status
    status VARCHAR(50) DEFAULT 'queued',

    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW (),
    completed_at TIMESTAMP
)

CREATE TABLE
    deployments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        -- Git info
        commit_hash VARCHAR(40) NOT NULL,
        branch VARCHAR(255),
        -- Status
        status VARCHAR(50) DEFAULT 'queued',
        -- Who triggered
        triggered_by_user_id UUID REFERENCES users (id),
        -- URLs
        deployment_url TEXT,
        build_log_url TEXT, -- S3 URL, auto-expire after 90 days
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW (),
        completed_at TIMESTAMP
    );

CREATE INDEX idx_deployments_project_id ON deployments (project_id);

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