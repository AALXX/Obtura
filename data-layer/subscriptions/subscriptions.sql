CREATE TABLE subscription_plans (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price_monthly DECIMAL(10,2) NOT NULL,
    max_users INTEGER,
    max_projects INTEGER,
    max_deployments_per_month INTEGER ,
    max_apps INTEGER,
    storage_gb INTEGER NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL REFERENCES subscription_plans(id),
    status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'paused')),
    
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMP,
    
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255) UNIQUE,
    
    current_users_count INTEGER DEFAULT 1,
    current_projects_count INTEGER DEFAULT 0,
    current_deployments_count INTEGER DEFAULT 0,
    current_apps_count INTEGER DEFAULT 0,
    current_storage_used_gb DECIMAL(10,2) DEFAULT 0,
    
    trial_start TIMESTAMP,
    trial_end TIMESTAMP,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT subscription_active_company CHECK (
        status != 'active' OR company_id IS NOT NULL
    )
);

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
