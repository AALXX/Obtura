CREATE TYPE permission_resource AS ENUM (
    'team',
    'project',
    'deployment',
    'environment',
    'repository',
    'settings',
    'members',
    'billing',
    'analytics',
    'logs',
    'secrets',
    'domains',
    'integrations'
);

CREATE TYPE permission_action AS ENUM (
    'create',
    'read',
    'update',
    'delete',
    'deploy',
    'rollback',
    'invite',
    'remove',
    'promote',
    'demote',
    'configure',
    'view_logs',
    'manage_secrets',
    'manage_billing'
);

-- Update team_role enum with enterprise roles
ALTER TYPE team_role RENAME TO team_role_old;
CREATE TYPE team_role AS ENUM (
    'ceo',
    'cto',
    'cfo',
    'engineering_manager',
    'tech_lead',
    'devops_lead',
    'senior_developer',
    'developer',
    'junior_developer',
    'qa_lead',
    'qa_engineer',
    'product_manager',
    'designer',
    'business_analyst',
    'viewer'
);