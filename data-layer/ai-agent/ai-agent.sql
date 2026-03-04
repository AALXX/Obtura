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