-- =============================================================
-- Xera — Lead Intelligence Database Schema
-- Database: xera_db
-- Run this once to bootstrap the database.
-- Prisma handles subsequent migrations via `prisma migrate dev`.
-- =============================================================

-- Create the database (run as superuser, outside a transaction)
-- CREATE DATABASE xera_db OWNER alx;
-- \c xera_db

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- ENUMS
-- =============================================================

CREATE TYPE source_enum AS ENUM ('REDDIT', 'LINKEDIN', 'HACKERNEWS', 'FACEBOOK');
CREATE TYPE heat_enum   AS ENUM ('HOT', 'WARM', 'COLD');
CREATE TYPE persona_enum AS ENUM ('FOUNDER', 'CTO', 'DEV', 'VIBE');
CREATE TYPE status_enum  AS ENUM ('NEW', 'CONTACTED', 'REPLIED', 'DEMO_BOOKED', 'CLOSED', 'DEAD');

-- =============================================================
-- TABLES
-- =============================================================

CREATE TABLE IF NOT EXISTS "User" (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    email       TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,              -- bcrypt hashed
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Lead" (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

    -- Source
    source       source_enum NOT NULL,
    "externalId" TEXT NOT NULL UNIQUE,
    url          TEXT NOT NULL,

    -- Content
    title        TEXT NOT NULL,
    body         TEXT,
    "authorName" TEXT,
    "authorUrl"  TEXT,
    subreddit    TEXT,

    -- Scoring
    score        INTEGER NOT NULL DEFAULT 0,
    heat         heat_enum NOT NULL,
    persona      persona_enum NOT NULL,
    "painTags"   TEXT[] NOT NULL DEFAULT '{}',

    -- Engagement signals
    upvotes      INTEGER NOT NULL DEFAULT 0,
    comments     INTEGER NOT NULL DEFAULT 0,

    -- Status tracking
    status       status_enum NOT NULL DEFAULT 'NEW',
    notes        TEXT,
    "dmScript"   TEXT,

    -- Timestamps
    "postedAt"    TIMESTAMP NOT NULL,
    "foundAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
    "contactedAt" TIMESTAMP,
    "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "ScanLog" (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    source       source_enum NOT NULL,
    query        TEXT NOT NULL,
    found        INTEGER NOT NULL DEFAULT 0,
    "newLeads"   INTEGER NOT NULL DEFAULT 0,
    "ranAt"      TIMESTAMP NOT NULL DEFAULT NOW(),
    "durationMs" INTEGER,
    error        TEXT
);

CREATE TABLE IF NOT EXISTS "SearchConfig" (
    id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    source    source_enum NOT NULL,
    subreddit TEXT,
    query     TEXT NOT NULL,
    persona   persona_enum NOT NULL,
    active    BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =============================================================
-- INDEXES
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_lead_status    ON "Lead"(status)    WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_heat      ON "Lead"(heat)      WHERE heat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_source    ON "Lead"(source)    WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_persona   ON "Lead"(persona)   WHERE persona IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_posted_at ON "Lead"("postedAt");
CREATE INDEX IF NOT EXISTS idx_lead_score     ON "Lead"(score DESC);

CREATE INDEX IF NOT EXISTS idx_scan_log_ran_at ON "ScanLog"("ranAt" DESC);

CREATE INDEX IF NOT EXISTS idx_search_config_active ON "SearchConfig"(active) WHERE active = TRUE;

-- =============================================================
-- DEFAULT SEARCH CONFIGS (seed data)
-- =============================================================

INSERT INTO "SearchConfig" (source, subreddit, query, persona, active) VALUES
    ('REDDIT', 'devops',         'too expensive alternative',       'FOUNDER', TRUE),
    ('REDDIT', 'devops',         'no devops engineer small team',   'CTO',     TRUE),
    ('REDDIT', 'webdev',         'deploy staging yaml dockerfile',  'DEV',     TRUE),
    ('REDDIT', 'startups',       'vercel billing pricing pain',     'FOUNDER', TRUE),
    ('REDDIT', 'ExperiencedDevs','wearing many hats just me',       'DEV',     TRUE),
    ('REDDIT', 'SideProject',    'cursor bolt lovable deploy host', 'VIBE',    TRUE),
    ('REDDIT', 'programming',    'manual deploy spending hours',    'DEV',     TRUE)
ON CONFLICT DO NOTHING;
