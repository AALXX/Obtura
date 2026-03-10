-- AI Provider configurations (API keys, model selections)
CREATE TABLE IF NOT EXISTS ai_provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Provider type: openai, anthropic, gemini, azure_openai, custom
    provider VARCHAR(50) NOT NULL,
    provider_name VARCHAR(255) NOT NULL DEFAULT '',

    -- Encrypted API key storage
    api_key_encrypted TEXT NOT NULL,
    api_key_iv TEXT NOT NULL,

    -- Model configuration
    model VARCHAR(255) NOT NULL DEFAULT '',
    base_url TEXT,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    status_message TEXT,

    -- Budget / usage tracking
    monthly_budget_usd NUMERIC(10, 4),
    monthly_usage_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.00,
    last_usage_reset_at TIMESTAMP NOT NULL DEFAULT NOW(),
    tokens_used_this_month INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP,

    CONSTRAINT uq_ai_provider_configs_project_provider_name UNIQUE (project_id, provider_name)
);

CREATE INDEX idx_ai_provider_configs_project_id ON ai_provider_configs(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ai_provider_configs_active ON ai_provider_configs(project_id, is_active) WHERE deleted_at IS NULL;

-- AI conversations
CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conversations_project_id ON ai_conversations(project_id);

-- AI messages
CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    tokens_used INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conversation_id ON ai_messages(conversation_id);

-- AI insights
CREATE TABLE IF NOT EXISTS ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    build_id UUID,
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL DEFAULT 'info',
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    recommendation TEXT,
    confidence_score NUMERIC(5, 2),
    context JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_insights_project_id ON ai_insights(project_id);

-- AI Agent preferences and multi-agent configuration
CREATE TABLE IF NOT EXISTS agent_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Strategy: single, multi, collaborative
    strategy VARCHAR(50) NOT NULL DEFAULT 'single',
    
    -- Preset: default, crisis, security, optimize, custom
    preset VARCHAR(50) NOT NULL DEFAULT 'default',
    
    -- Selected built-in agents
    selected_agents JSONB DEFAULT '[]',
    
    -- Custom agent definitions
    custom_agents JSONB DEFAULT '[]',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(project_id)
);

CREATE INDEX idx_agent_preferences_project_id ON agent_preferences(project_id);