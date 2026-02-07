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
    );
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
