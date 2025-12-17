-- Permissions table
CREATE TABLE
    permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        resource permission_resource NOT NULL,
        action permission_action NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW (),
        UNIQUE (resource, action)
    );

CREATE TABLE
    role_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        role_name team_role NOT NULL REFERENCES roles (name) ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW (),
        UNIQUE (role_name, permission_id)
    );

CREATE INDEX idx_role_permissions_role ON role_permissions (role_name);

CREATE INDEX idx_role_permissions_permission ON role_permissions (permission_id);

CREATE TABLE
    permission_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users (id) ON DELETE SET NULL,
        target_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL, -- 'role_changed', 'permission_granted', 'permission_revoked'
        old_value TEXT,
        new_value TEXT,
        metadata JSONB DEFAULT '{}',
        ip_address INET,
        created_at TIMESTAMP DEFAULT NOW ()
    );

CREATE INDEX idx_permission_audit_team ON permission_audit_log (team_id);

CREATE INDEX idx_permission_audit_user ON permission_audit_log (user_id);

CREATE INDEX idx_permission_audit_created ON permission_audit_log (created_at);

INSERT INTO
    permissions (resource, action, description)
VALUES
    -- Team permissions
    ('team', 'read', 'View team information'),
    ('team', 'update', 'Update team settings'),
    ('team', 'delete', 'Delete team'),
    ('team', 'configure', 'Configure team settings'),
    -- Member permissions
    ('members', 'read', 'View team members'),
    ('members', 'invite', 'Invite new members'),
    ('members', 'remove', 'Remove members'),
    ('members', 'promote', 'Change member roles'),
    ('members', 'demote', 'Demote member roles'),
    -- Project permissions
    ('project', 'create', 'Create new projects'),
    ('project', 'read', 'View projects'),
    ('project', 'update', 'Update project settings'),
    ('project', 'delete', 'Delete projects'),
    -- Deployment permissions
    ('deployment', 'create', 'Create deployments'),
    ('deployment', 'read', 'View deployments'),
    ('deployment', 'deploy', 'Deploy to environments'),
    ('deployment', 'rollback', 'Rollback deployments'),
    ('deployment', 'delete', 'Delete deployments'),
    -- Environment permissions
    ('environment', 'create', 'Create environments'),
    ('environment', 'read', 'View environments'),
    (
        'environment',
        'update',
        'Update environment settings'
    ),
    ('environment', 'delete', 'Delete environments'),
    (
        'environment',
        'configure',
        'Configure environment variables'
    ),
    -- Repository permissions
    ('repository', 'create', 'Create repositories'),
    ('repository', 'read', 'View repository code'),
    ('repository', 'update', 'Push code changes'),
    ('repository', 'delete', 'Delete repositories'),
    -- Settings permissions
    ('settings', 'read', 'View settings'),
    ('settings', 'update', 'Update settings'),
    (
        'settings',
        'configure',
        'Configure advanced settings'
    ),
    -- Billing permissions
    ('billing', 'read', 'View billing information'),
    (
        'billing',
        'manage_billing',
        'Manage billing and subscriptions'
    ),
    -- Analytics permissions
    ('analytics', 'read', 'View analytics and metrics'),
    -- Logs permissions
    ('logs', 'read', 'View logs'),
    ('logs', 'view_logs', 'View detailed logs'),
    -- Secrets permissions
    ('secrets', 'read', 'View secret names'),
    ('secrets', 'create', 'Create secrets'),
    ('secrets', 'update', 'Update secrets'),
    ('secrets', 'delete', 'Delete secrets'),
    (
        'secrets',
        'manage_secrets',
        'Full secret management'
    ),
    -- Domains permissions
    ('domains', 'create', 'Add custom domains'),
    ('domains', 'read', 'View domains'),
    ('domains', 'update', 'Update domain settings'),
    ('domains', 'delete', 'Remove domains'),
    -- Integrations permissions
    ('integrations', 'create', 'Add integrations'),
    ('integrations', 'read', 'View integrations'),
    ('integrations', 'update', 'Update integrations'),
    ('integrations', 'delete', 'Remove integrations');

-- Seed role permissions
INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'ceo',
    id
FROM
    permissions;

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'cto',
    id
FROM
    permissions
WHERE
    resource != 'billing';

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'cfo',
    id
FROM
    permissions
WHERE
    resource IN (
        'billing',
        'analytics',
        'team',
        'members',
        'project',
        'deployment'
    )
    AND action IN ('read', 'manage_billing', 'view_logs');

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'engineering_manager',
    id
FROM
    permissions
WHERE
    resource IN (
        'team',
        'members',
        'project',
        'deployment',
        'environment',
        'repository',
        'settings',
        'analytics',
        'logs'
    )
    AND action NOT IN ('delete', 'manage_billing');

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'tech_lead',
    id
FROM
    permissions
WHERE
    resource IN (
        'project',
        'deployment',
        'environment',
        'repository',
        'logs',
        'secrets',
        'domains',
        'integrations'
    )
    AND action NOT IN ('delete', 'manage_billing');

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'devops_lead',
    id
FROM
    permissions
WHERE
    resource IN (
        'deployment',
        'environment',
        'repository',
        'logs',
        'secrets',
        'domains',
        'integrations',
        'settings'
    )
    AND action != 'manage_billing';

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'senior_developer',
    id
FROM
    permissions
WHERE
    resource IN (
        'project',
        'deployment',
        'environment',
        'repository',
        'logs',
        'secrets'
    )
    AND action IN (
        'create',
        'read',
        'update',
        'deploy',
        'rollback',
        'view_logs'
    );

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'developer',
    id
FROM
    permissions
WHERE
    resource IN ('project', 'deployment', 'repository', 'logs', 'secrets', 'team')
    AND action IN ('create', 'read', 'update', 'deploy', 'view_logs');

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'junior_developer',
    id
FROM
    permissions
WHERE
    resource IN ('project', 'repository', 'logs', 'secrets', 'team')
    AND action IN ('read', 'update', 'view_logs');

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'qa_lead',
    id
FROM
    permissions
WHERE
    resource IN (
        'project',
        'deployment',
        'environment',
        'logs',
        'analytics',
        'team'
    )
    AND action IN ('read', 'deploy', 'view_logs');

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'qa_engineer',
    id
FROM
    permissions
WHERE
    resource IN ('project', 'deployment', 'logs', 'team')
    AND action IN ('read', 'view_logs');

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'product_manager',
    id
FROM
    permissions
WHERE
    resource IN ('project', 'deployment', 'analytics', 'members', 'team')
    AND action IN ('read', 'create', 'update', 'view_logs');

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'designer',
    id
FROM
    permissions
WHERE
    resource IN ('project', 'repository')
    AND action IN ('read', 'update');

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'business_analyst',
    id
FROM
    permissions
WHERE
    resource IN ('analytics', 'logs', 'project')
    AND action IN ('read', 'view_logs');

INSERT INTO
    role_permissions (role_name, permission_id)
SELECT
    'viewer',
    id
FROM
    permissions
WHERE
    action = 'read';