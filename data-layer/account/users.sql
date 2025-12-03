
-- Minimal enums
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE team_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE data_region AS ENUM ('eu-central', 'eu-west', 'eu-north');


CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    
    password_hash TEXT,
    email_verified BOOLEAN DEFAULT false,
    
    status user_status DEFAULT 'active',
    
    data_region data_region DEFAULT 'eu-central',
    marketing_consent BOOLEAN DEFAULT false,
    deletion_requested_at TIMESTAMP, 
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP 
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);


CREATE TABLE oauth_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    provider VARCHAR(50) NOT NULL, -- 'google', 'github'
    provider_account_id VARCHAR(255) NOT NULL,
    
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(provider, provider_account_id)
);


CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token VARCHAR(255) UNIQUE NOT NULL, 
    refresh_token VARCHAR(255) UNIQUE, 
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);