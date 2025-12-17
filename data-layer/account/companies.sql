CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id),
    
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    
    billing_email VARCHAR(255),
    vat_number VARCHAR(50),
    
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    country VARCHAR(2) DEFAULT 'RO',
    
    data_region data_region DEFAULT 'eu-central',
    dpa_signed BOOLEAN DEFAULT false,
    
    metadata JSONB DEFAULT '{}',
    
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_companies_owner ON companies(owner_user_id);
CREATE INDEX idx_companies_slug ON companies(slug); 

CREATE TABLE company_users (
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role UUID NOT NULL REFERENCES roles(id),
    PRIMARY KEY (company_id, user_id)
);

-- TODO FIX
CREATE VIEW company_usage_limits AS
SELECT 
    c.id AS company_id,
    c.name AS company_name,
    s.status AS subscription_status,
    sp.name AS plan_name,
    
    s.current_users_count,
    sp.max_users,
    CASE WHEN sp.max_users IS NULL THEN true 
         ELSE s.current_users_count < sp.max_users END AS can_add_users,
    
    s.current_projects_count,
    sp.max_projects,
    CASE WHEN sp.max_projects IS NULL THEN true 
         ELSE s.current_projects_count < sp.max_projects END AS can_add_projects,
    
    s.current_deployments_count,
    sp.max_deployments_per_month,
    CASE WHEN sp.max_deployments_per_month IS NULL THEN true 
         ELSE s.current_deployments_count < sp.max_deployments_per_month END AS can_deploy,
    
    s.current_storage_used_gb,
    sp.storage_gb AS max_storage_gb,
    CASE WHEN sp.storage_gb IS NULL THEN true 
         ELSE s.current_storage_used_gb < sp.storage_gb END AS has_storage
         
FROM companies c
JOIN subscriptions s ON s.company_id = c.id
JOIN subscription_plans sp ON sp.id = s.plan_id
WHERE s.status = 'active';

CREATE OR REPLACE FUNCTION update_company_user_count()
RETURNS TRIGGER AS $$
DECLARE
    v_company_id UUID;
    v_user_count INTEGER;
BEGIN
    SELECT company_id INTO v_company_id
    FROM teams
    WHERE id = COALESCE(NEW.team_id, OLD.team_id);
    
    SELECT COUNT(DISTINCT tm.user_id) INTO v_user_count
    FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE t.company_id = v_company_id;
    
    UPDATE subscriptions
    SET current_users_count = v_user_count,
        updated_at = NOW()
    WHERE company_id = v_company_id
    AND status = 'active';
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_count_on_member_change
    AFTER INSERT OR DELETE ON team_members
    FOR EACH ROW EXECUTE FUNCTION update_company_user_count();