-- AI Agent Service Database Schema
-- Created: February 2026

-- AI Provider Types
CREATE TYPE ai_provider_type AS ENUM ('openai', 'anthropic', 'gemini', 'azure_openai', 'custom', 'mock');
CREATE TYPE ai_token_status AS ENUM ('active', 'expired', 'revoked', 'rate_limited');

-- User-provided AI provider configurations (encrypted storage)
CREATE TABLE ai_provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Provider configuration
    provider ai_provider_type NOT NULL,
    provider_name VARCHAR(100) NOT NULL,
    
    -- Encrypted API key
    api_key_encrypted TEXT NOT NULL,
    api_key_iv VARCHAR(255) NOT NULL,
    
    -- Model configuration
    model VARCHAR(100) NOT NULL,
    base_url TEXT,
    
    -- Usage tracking and controls
    is_active BOOLEAN DEFAULT true,
    status ai_token_status DEFAULT 'active',
    status_message TEXT,
    monthly_budget_usd DECIMAL(10,2),
    monthly_usage_usd DECIMAL(10,2) DEFAULT 0.00,
    last_usage_reset_at TIMESTAMP DEFAULT NOW(),
    tokens_used_this_month INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    
    UNIQUE(project_id, provider_name)
);

-- Platform default AI configuration
CREATE TABLE ai_platform_defaults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider ai_provider_type NOT NULL,
    model VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- AI token usage audit log
CREATE TABLE ai_token_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_config_id UUID REFERENCES ai_provider_configs(id) ON DELETE SET NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    request_type VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    tokens_input INTEGER NOT NULL,
    tokens_output INTEGER NOT NULL,
    tokens_total INTEGER NOT NULL,
    estimated_cost_usd DECIMAL(10,6),
    latency_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Conversations and chat history
CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual messages
CREATE TABLE ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    tokens_used INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- AI-generated insights
CREATE TABLE ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    root_cause TEXT,
    recommendation TEXT NOT NULL,
    confidence_score DECIMAL(3,2),
    context JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'ignored')),
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Detected patterns
CREATE TABLE ai_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_type VARCHAR(50) NOT NULL,
    pattern_hash VARCHAR(64) NOT NULL UNIQUE,
    pattern_signature JSONB NOT NULL,
    occurrences INTEGER DEFAULT 1,
    first_seen TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP DEFAULT NOW(),
    resolved_count INTEGER DEFAULT 0,
    avg_resolution_time_minutes INTEGER,
    common_solutions JSONB DEFAULT '[]'
);

-- Knowledge base for solutions
CREATE TABLE ai_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    tags TEXT[],
    problem_pattern TEXT NOT NULL,
    solution TEXT NOT NULL,
    code_example TEXT,
    source VARCHAR(100),
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_ai_insights_project ON ai_insights(project_id, created_at DESC);
CREATE INDEX idx_ai_insights_status ON ai_insights(status) WHERE status = 'active';
CREATE INDEX idx_ai_insights_type ON ai_insights(type, severity);
CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id, created_at);
CREATE INDEX idx_ai_conversations_project ON ai_conversations(project_id, user_id);
CREATE INDEX idx_ai_patterns_type ON ai_patterns(pattern_type, last_seen DESC);
CREATE INDEX idx_ai_provider_configs_project ON ai_provider_configs(project_id);
CREATE INDEX idx_ai_token_usage_project ON ai_token_usage_log(project_id, created_at DESC);
