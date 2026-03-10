-- Migration 001: Fix missing columns and constraints in AI agent tables
-- Apply this against the live obtura_db database.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ai_provider_configs: add UNIQUE constraint required by ON CONFLICT clause
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_ai_provider_configs_project_provider_name'
    ) THEN
        ALTER TABLE ai_provider_configs
            ADD CONSTRAINT uq_ai_provider_configs_project_provider_name
            UNIQUE (project_id, provider_name);
    END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ai_conversations: add user_id column (storage layer inserts/selects it)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_conversations' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE ai_conversations
            ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ai_messages: add tokens_used column (storage layer inserts/selects it)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_messages' AND column_name = 'tokens_used'
    ) THEN
        ALTER TABLE ai_messages
            ADD COLUMN tokens_used INTEGER;
    END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ai_insights: add columns referenced by insights storage layer
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_insights' AND column_name = 'confidence_score'
    ) THEN
        ALTER TABLE ai_insights
            ADD COLUMN confidence_score NUMERIC(5, 2);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_insights' AND column_name = 'context'
    ) THEN
        ALTER TABLE ai_insights
            ADD COLUMN context JSONB DEFAULT '{}';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_insights' AND column_name = 'resolved_at'
    ) THEN
        ALTER TABLE ai_insights
            ADD COLUMN resolved_at TIMESTAMP;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_insights' AND column_name = 'resolved_by'
    ) THEN
        ALTER TABLE ai_insights
            ADD COLUMN resolved_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END$$;
