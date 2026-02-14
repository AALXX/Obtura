CREATE TABLE
    teams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        team_description VARCHAR(100),
        owner_user_id UUID NOT NULL REFERENCES users (id),
        data_region data_region DEFAULT 'eu-central',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW (),
        updated_at TIMESTAMP DEFAULT NOW (),
        UNIQUE (company_id, slug)
    );

CREATE INDEX idx_teams_company_id ON teams (company_id);

CREATE INDEX idx_teams_owner ON teams (owner_user_id);

CREATE INDEX idx_teams_slug ON teams (slug);

CREATE TABLE
    team_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW (),
        UNIQUE (team_id, user_id)
    );



CREATE TABLE team_member_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    is_granted BOOLEAN NOT NULL, -- true = grant, false = revoke
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(team_member_id, permission_id)
);

CREATE INDEX idx_team_member_permissions_member ON team_member_permissions(team_member_id);
