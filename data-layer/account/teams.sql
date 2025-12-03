CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    
    owner_user_id UUID NOT NULL REFERENCES users(id),
    
    data_region data_region DEFAULT 'eu-central',
    
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(company_id, slug)
);

CREATE INDEX idx_teams_company_id ON teams(company_id);
CREATE INDEX idx_teams_owner ON teams(owner_user_id);    
CREATE INDEX idx_teams_slug ON teams(slug);

CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    role team_role DEFAULT 'member',
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(team_id, user_id)
);