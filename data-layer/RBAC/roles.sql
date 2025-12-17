CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name team_role UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    hierarchy_level INTEGER NOT NULL, -- Lower number = higher privilege
    is_system_role BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO roles (name, display_name, description, hierarchy_level) VALUES
('ceo', 'Chief Executive Officer', 'Highest authority with full system access', 1),
('cto', 'Chief Technology Officer', 'Technical leadership with full engineering access', 2),
('cfo', 'Chief Financial Officer', 'Financial oversight and billing management', 2),
('engineering_manager', 'Engineering Manager', 'Manages engineering teams and processes', 3),
('tech_lead', 'Technical Lead', 'Leads technical architecture and senior developers', 4),
('devops_lead', 'DevOps Lead', 'Manages infrastructure and deployment pipelines', 4),
('senior_developer', 'Senior Developer', 'Experienced developer with deployment rights', 5),
('developer', 'Developer', 'Standard developer with code and deploy access', 6),
('junior_developer', 'Junior Developer', 'Entry-level developer with limited permissions', 7),
('qa_lead', 'QA Lead', 'Leads quality assurance and testing', 5),
('qa_engineer', 'QA Engineer', 'Tests and verifies deployments', 6),
('product_manager', 'Product Manager', 'Manages product requirements and roadmap', 5),
('designer', 'Designer', 'UI/UX design with view access', 7),
('business_analyst', 'Business Analyst', 'Analytics and reporting access', 7),
('viewer', 'Viewer', 'Read-only access to projects', 8);
