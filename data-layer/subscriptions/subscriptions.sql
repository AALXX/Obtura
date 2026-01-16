CREATE TABLE subscription_plans (
    -- Basic Info
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price_monthly DECIMAL(10,2) NOT NULL,
    price_annually DECIMAL(10,2), -- Offer 17% discount for annual
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    
    -- Team & Organization
    max_users INTEGER, -- NULL = unlimited
    max_team_members INTEGER,
    max_projects INTEGER,
    
    -- Build Limits (matches your Build Service quotas)
    max_builds_per_hour INTEGER ,
    max_builds_per_day INTEGER ,
    max_builds_per_month INTEGER ,
    max_concurrent_builds INTEGER ,
    max_build_duration_minutes INTEGER ,
    max_build_size_mb INTEGER ,
    
    -- Build Resources
    cpu_cores_per_build DECIMAL(3,1) NOT NULL, -- 1.0, 4.0, 8.0
    memory_gb_per_build INTEGER NOT NULL,
    
    -- Deployment Limits
    max_deployments_per_month INTEGER,
    max_concurrent_deployments INTEGER NOT NULL DEFAULT 1,
    max_environments_per_project INTEGER NOT NULL DEFAULT 3, -- prod/staging/preview
    max_preview_environments INTEGER, -- NULL = unlimited
    rollback_retention_count INTEGER NOT NULL DEFAULT 10,
    
    -- Runtime Resources
    cpu_cores_per_deployment DECIMAL(3,1) NOT NULL,
    memory_gb_per_deployment INTEGER NOT NULL,
    
    -- Storage Limits
    storage_gb INTEGER NOT NULL, -- Total storage per account
    max_build_artifacts_gb INTEGER NOT NULL,
    max_database_storage_gb INTEGER, -- NULL = unlimited
    max_logs_retention_days INTEGER NOT NULL,
    max_backup_retention_days INTEGER NOT NULL,
    
    -- Traffic & Bandwidth
    bandwidth_gb_per_month INTEGER, -- NULL = unlimited
    requests_per_minute INTEGER NOT NULL, -- Rate limiting
    ddos_protection_enabled BOOLEAN DEFAULT FALSE,
    
    -- Integrations & Features
    max_webhooks_per_project INTEGER NOT NULL DEFAULT 5,
    max_api_keys_per_project INTEGER DEFAULT 3,
    max_custom_domains INTEGER, -- NULL = unlimited
    ssl_certificates_included BOOLEAN DEFAULT TRUE,
    advanced_analytics_enabled BOOLEAN DEFAULT FALSE,
    audit_logs_enabled BOOLEAN DEFAULT FALSE,
    audit_logs_retention_days INTEGER,
    
    -- Support & SLA
    support_level VARCHAR(50) NOT NULL, -- 'community', 'email', 'priority', 'dedicated'
    sla_uptime_percentage DECIMAL(5,2), -- 99.00, 99.50, 99.90
    support_response_hours INTEGER, -- 48, 24, 4, 1
    
    -- Feature Flags
    custom_runtime_configs_enabled BOOLEAN DEFAULT FALSE,
    kubernetes_deployment_enabled BOOLEAN DEFAULT FALSE,
    multi_region_enabled BOOLEAN DEFAULT FALSE,
    white_label_enabled BOOLEAN DEFAULT FALSE,

    -- stripe integration
    stripe_product_id VARCHAR(255),
    stripe_price_id VARCHAR(255),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE subscriptions (
    -- Basic Info
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL REFERENCES subscription_plans(id),
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'active', 'past_due', 'canceled', 'paused')),
    
    -- Billing Period
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'annually')),
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMP,
    
    -- Payment Integration
    stripe_price_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_payment_method_id VARCHAR(255),
    last_payment_at TIMESTAMP,
    next_payment_at TIMESTAMP,
    
    -- Current Usage Tracking (matches plan limits)
    -- Team & Organization Usage
    current_users_count INTEGER DEFAULT 1,
    current_team_members_count INTEGER DEFAULT 1,
    current_projects_count INTEGER DEFAULT 0,
    
    -- Build Usage
    current_builds_this_hour INTEGER DEFAULT 0,
    current_builds_today INTEGER DEFAULT 0,
    current_builds_this_month INTEGER DEFAULT 0,
    current_concurrent_builds INTEGER DEFAULT 0,
    builds_hour_reset_at TIMESTAMP,
    builds_day_reset_at TIMESTAMP,
    builds_month_reset_at TIMESTAMP,
    
    -- Deployment Usage
    current_deployments_count INTEGER DEFAULT 0,
    current_deployments_this_month INTEGER DEFAULT 0,
    current_concurrent_deployments INTEGER DEFAULT 0,
    current_environments_count INTEGER DEFAULT 0,
    current_preview_environments_count INTEGER DEFAULT 0,
    
    -- Storage Usage
    current_storage_used_gb DECIMAL(10,2) DEFAULT 0,
    current_build_artifacts_gb DECIMAL(10,2) DEFAULT 0,
    current_database_storage_gb DECIMAL(10,2) DEFAULT 0,
    
    -- Traffic & Bandwidth Usage
    current_bandwidth_used_gb DECIMAL(10,2) DEFAULT 0,
    bandwidth_reset_at TIMESTAMP,
    
    -- Integration Usage
    current_webhooks_count INTEGER DEFAULT 0,
    current_api_keys_count INTEGER DEFAULT 0,
    current_custom_domains_count INTEGER DEFAULT 0,
    

    -- Overage & Limits
    overage_charges DECIMAL(10,2) DEFAULT 0,
    overage_details JSONB DEFAULT '{}',
    soft_limit_warnings JSONB DEFAULT '{}', -- Track warnings sent
    
    -- Plan Modifications
    pending_plan_change_id VARCHAR(50) REFERENCES subscription_plans(id),
    pending_change_at TIMESTAMP, -- When the plan change takes effect
    previous_plan_id VARCHAR(50), -- Track downgrades/upgrades
    plan_changed_at TIMESTAMP,
    
    -- Additional Metadata
    metadata JSONB DEFAULT '{}',
    custom_limits JSONB DEFAULT '{}', -- Override specific plan limits
    feature_flags JSONB DEFAULT '{}', -- Enable/disable specific features
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_usage_reset_at TIMESTAMP DEFAULT NOW(),


    -- Constraints
    CONSTRAINT subscription_active_company CHECK (
        status != 'active' OR company_id IS NOT NULL
    ),

    CONSTRAINT subscription_billing_cycle_valid CHECK (
        billing_cycle IN ('monthly', 'annually')
    )
);

-- Indexes for performance
CREATE INDEX idx_subscriptions_company_id ON subscriptions(company_id);
CREATE INDEX idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscription_updated_at_trigger
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_updated_at();

-- Function to reset usage counters
CREATE OR REPLACE FUNCTION reset_subscription_usage_counters()
RETURNS TRIGGER AS $$
BEGIN
    -- Reset hourly builds if needed
    IF NEW.builds_hour_reset_at IS NULL OR NEW.builds_hour_reset_at < NOW() THEN
        NEW.current_builds_this_hour = 0;
        NEW.builds_hour_reset_at = NOW() + INTERVAL '1 hour';
    END IF;
    
    -- Reset daily builds if needed
    IF NEW.builds_day_reset_at IS NULL OR NEW.builds_day_reset_at < NOW() THEN
        NEW.current_builds_today = 0;
        NEW.builds_day_reset_at = NOW() + INTERVAL '1 day';
    END IF;
    
    -- Reset monthly counters if new period
    IF OLD.current_period_end IS DISTINCT FROM NEW.current_period_end THEN
        NEW.current_builds_this_month = 0;
        NEW.current_deployments_this_month = 0;
        NEW.current_bandwidth_used_gb = 0;
        NEW.overage_charges = 0;
        NEW.builds_month_reset_at = NEW.current_period_end;
        NEW.bandwidth_reset_at = NEW.current_period_end;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscription_reset_usage_trigger
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION reset_subscription_usage_counters();

CREATE INDEX idx_subscriptions_company_id ON subscriptions(company_id);
CREATE INDEX idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_current_period ON subscriptions(current_period_end);

CREATE TABLE subscription_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL REFERENCES subscription_plans(id),
    status VARCHAR(50) NOT NULL,
    change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('created', 'upgraded', 'downgraded', 'renewed', 'canceled', 'reactivated', 'status_changed')),
    changed_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);



CREATE INDEX idx_subscription_history_subscription_id ON subscription_history(subscription_id);
CREATE INDEX idx_subscription_history_created_at ON subscription_history(created_at DESC);

INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
VALUES ('361aa117-0cbb-4c89-bcb3-5b616d0a4bc9', 'business', 'active', NOW(), NOW() + INTERVAL '30 days');

CREATE OR REPLACE FUNCTION log_subscription_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO subscription_history (subscription_id, plan_id, status, change_type)
        VALUES (NEW.id, NEW.plan_id, NEW.status, 'created');
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.plan_id != NEW.plan_id) THEN
            INSERT INTO subscription_history (subscription_id, plan_id, status, change_type)
            VALUES (NEW.id, NEW.plan_id, NEW.status, 
                CASE 
                    WHEN (SELECT price_monthly FROM subscription_plans WHERE id = NEW.plan_id) > 
                         (SELECT price_monthly FROM subscription_plans WHERE id = OLD.plan_id) 
                    THEN 'upgraded'
                    ELSE 'downgraded'
                END
            );
        ELSIF (OLD.status != NEW.status) THEN
            INSERT INTO subscription_history (subscription_id, plan_id, status, change_type)
            VALUES (NEW.id, NEW.plan_id, NEW.status,
                CASE 
                    WHEN NEW.status = 'canceled' THEN 'canceled'
                    WHEN NEW.status = 'active' AND OLD.status = 'canceled' THEN 'reactivated'
                    ELSE 'status_changed'
                END
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_subscription_changes_trigger
    AFTER INSERT OR UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION log_subscription_changes();

    INSERT INTO subscription_plans (
    id,
    name,
    price_monthly,
    max_users,
    max_projects,
    max_deployments_per_month,
    max_apps,
    storage_gb,
    description,
    is_active
) VALUES
(
    'starter',
    'Starter',
    79.00,
    8,
    5,
    100,
    5,
    10,
    'Perfect for small teams starting with DevOps automation',
    TRUE
),
(
    'team',
    'Team',
    299.00,
    25,
    15,
    500,
    10,
    50,
    'For growing teams with multiple projects',
    TRUE
),
(
    'business',
    'Business',
    799.00,
    50,
    30,
    1000,
    25,
    3072, -- 3 TB
    'For established SMEs with complex needs',
    TRUE
),
(
    'enterprise',
    'Enterprise',
    2199.00,
    NULL, -- unlimited users
    NULL, -- unlimited projects
    NULL, -- unlimited deployments
    NULL, -- unlimited apps
    5120, -- 5 TB
    'Custom limits for large organizations',
    TRUE
);

