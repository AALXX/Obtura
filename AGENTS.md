# OBTURA - AI Coding Guidelines

## Project Overview

Obtura is an autonomous DevOps platform for European SMEs. It provides zero-config deployment, automated builds, and intelligent monitoring. The platform uses a microservices architecture with clear separation between API services, client frontend, and data layer.

**Core Philosophy**: Clean architecture, strong typing, comprehensive error handling, and GDPR-compliant data practices.

---

## Architecture Overview

```
├── api-layer/                    # Backend microservices
│   ├── core-api/                # Main API (Node.js/Express/TypeScript) - Port 7070
│   ├── build-service/           # Docker builds (Go) - Port 5050
│   ├── deploy-service/          # Container deployment (Go) - Port 5070
│   ├── monitoring-service/      # Metrics & observability (Go) - Port 5110
│   └── payment-service/         # Stripe integration (Node.js) - Port 5080
├── client-layer/                # Next.js 16 frontend
├── data-layer/                  # PostgreSQL schemas
├── infra/                       # Traefik, Docker configs
└── shared/                      # Shared platform logging
```

---

## Go Services Standards

### Project Structure

All Go services follow this structure:

```
service-name/
├── cmd/
│   └── main.go              # Entry point - wire dependencies, start server
├── internal/
│   ├── worker/              # RabbitMQ consumers
│   ├── builder/             # Business logic
│   ├── security/            # Rate limiting, quotas, sandboxing
│   ├── storage/             # External storage (MinIO)
│   ├── logger/              # Logging with SSE streaming
│   └── git/                 # Git operations
├── pkg/                     # Shared packages
│   ├── postgres.go          # Database client
│   ├── utils.go             # Helper functions
│   └── platformlog/         # Unified logging client
└── go.mod
```

### Coding Conventions

#### Package Organization
- `cmd/` - Main entry points
- `internal/` - Private code, business logic
- `pkg/` - Public code, reusable packages
- Use service name as module path: `build-service`, `deploy-service`

#### Naming Conventions
- **Files**: snake_case.go (e.g., `rate_limit.go`, `platform_logger.go`)
- **Types**: PascalCase (e.g., `SandboxConfig`, `BuildLimits`)
- **Functions**: PascalCase for exported, camelCase for private
- **Variables**: camelCase
- **Constants**: PascalCase or ALL_CAPS for package-level

#### Struct Tags
Always use JSON tags with camelCase:
```go
type Framework struct {
    Name     string `json:"name"`
    Version  string `json:"version"`
    BuildCmd string `json:"buildCmd"`
    Runtime  string `json:"runtime"`
    Port     int    `json:"port"`
    Path     string `json:"path"`
}
```

#### Error Handling
Always wrap errors with context:
```go
if err != nil {
    return fmt.Errorf("failed to query env configs: %w", err)
}
```

Use deferred cleanup:
```go
defer rows.Close()
defer w.rateLimiter.DecrementConcurrentBuilds(ctx, companyID)
```

#### Context Usage
Always pass context through the call chain:
```go
func (w *Worker) fetchEnvConfigs(ctx context.Context, projectID string) ([]EnvConfig, error) {
    rows, err := w.db.QueryContext(ctx, query, projectID)
    // ...
}
```

#### Logging Standards
Use emoji indicators and structured messages:
```go
log.Println("✅ Successfully connected to PostgreSQL database")
log.Printf("🚀 Starting RabbitMQ worker...")
log.Printf("❌ Failed to create worker: %v", err)
log.Printf("⚠️ Build size warning: %v", err)
log.Printf("📨 Received message: %s", string(msg.Body))
log.Printf("🏗️ Starting build %s", buildID)
log.Printf("🔨 Building project %s", projectID)
log.Printf("🧹 Cleanup completed")
```

### HTTP Server Setup (Gin)

```go
package main

import (
    "fmt"
    "log"
    "os"
    "os/signal"
    "syscall"

    "github.com/gin-gonic/gin"
)

func main() {
    // Initialize database
    db, err := pkg.NewDatabase(connStr)
    if err != nil {
        log.Fatalf("Failed to connect to database: %v", err)
    }
    defer db.Close()
    log.Println("✅ Successfully connected to PostgreSQL database")

    // Initialize Redis
    rateLimiter, err := security.NewRateLimiter(redisURL)
    if err != nil {
        log.Fatalf("Failed to create rate limiter: %v", err)
    }
    defer rateLimiter.Close()
    log.Println("✅ Successfully connected to Redis")

    // Setup Gin router
    r := gin.Default()

    // CORS middleware for SSE
    r.Use(func(c *gin.Context) {
        c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
        c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(204)
            return
        }
        c.Next()
    })

    // Health endpoint
    r.GET("/health", func(c *gin.Context) {
        if err := db.Ping(); err != nil {
            c.JSON(503, gin.H{
                "status":   "unhealthy",
                "database": "disconnected",
                "error":    err.Error(),
            })
            return
        }
        c.JSON(200, gin.H{
            "status":   "healthy",
            "database": "connected",
        })
    })

    // Graceful shutdown
    go func() {
        sigChan := make(chan os.Signal, 1)
        signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
        <-sigChan
        log.Println("🛑 Shutting down gracefully...")
        // Cleanup
        os.Exit(0)
    }()

    port := pkg.GetEnv("PORT", "5050")
    r.Run(":" + port)
}
```

### RabbitMQ Worker Pattern

```go
type Worker struct {
    conn        *amqp.Connection
    channel     *amqp.Channel
    db          *pkg.Database
    rateLimiter *security.RateLimiter
}

func NewWorker(rabbitmqURL string, db *pkg.Database, rateLimiter *security.RateLimiter) (*Worker, error) {
    conn, err := amqp.Dial(rabbitmqURL)
    if err != nil {
        return nil, err
    }

    channel, err := conn.Channel()
    if err != nil {
        conn.Close()
        return nil, err
    }

    return &Worker{
        conn:        conn,
        channel:     channel,
        db:          db,
        rateLimiter: rateLimiter,
    }, nil
}

func (w *Worker) Start() error {
    // Declare exchange
    err := w.channel.ExchangeDeclare(
        "obtura.builds",  // exchange name
        "topic",          // type
        true,             // durable
        false,            // auto-deleted
        false,            // internal
        false,            // no-wait
        nil,              // arguments
    )
    if err != nil {
        return err
    }

    // Declare queue
    queue, err := w.channel.QueueDeclare(
        "build-queue",
        true,  // durable
        false, // delete when unused
        false, // exclusive
        false, // no-wait
        nil,   // arguments
    )
    if err != nil {
        return err
    }

    // Bind queue
    err = w.channel.QueueBind(
        queue.Name,
        "build.triggered",   // routing key
        "obtura.builds",     // exchange
        false,
        nil,
    )
    if err != nil {
        return err
    }

    // Consume messages
    messages, err := w.channel.Consume(
        queue.Name,
        "",    // consumer
        false, // auto-ack
        false, // exclusive
        false, // no-local
        false, // no-wait
        nil,   // args
    )
    if err != nil {
        return err
    }

    log.Println("✅ Service is now listening for messages...")

    for msg := range messages {
        log.Printf("📨 Received message: %s", string(msg.Body))
        go w.handleJob(msg)  // Process concurrently
    }

    return nil
}

func (w *Worker) handleJob(msg amqp.Delivery) {
    defer func() {
        if r := recover(); r != nil {
            log.Printf("❌ Panic in job handler: %v", r)
            msg.Nack(false, false)
        }
    }()

    // Process job...
    
    msg.Ack(false)  // Acknowledge on success
}
```

### Environment Variables Helper

```go
// pkg/utils.go
func GetEnv(key, defaultValue string) string {
    value := os.Getenv(key)
    if value == "" {
        return defaultValue
    }
    return value
}
```

---

## Node.js/Express API Standards

### Project Structure

```
core-api/
├── src/
│   ├── core_api.ts              # Main entry point
│   ├── routes/                  # Route definitions
│   │   ├── ProjectsManagerRoutes.ts
│   │   ├── CompanyManagerRoutes.ts
│   │   └── UserAccountManagerRoutes.ts
│   ├── Services/                # Business logic
│   │   ├── ProjectServices.ts
│   │   └── TeamServices.ts
│   ├── middlewares/             # RBAC, auth
│   │   ├── RBACSystem.ts
│   │   └── RBACTypes.ts
│   ├── config/                  # DB, Redis, RabbitMQ configs
│   │   ├── postgresql.ts
│   │   ├── redis.ts
│   │   └── rabbitmql.ts
│   ├── lib/                     # Utilities
│   │   └── utils.ts
│   └── common/                  # Shared types/helpers
│       └── comon.ts
└── package.json
```

### Coding Conventions

#### Imports Organization
```typescript
// 1. Node.js built-ins
import http from 'http';
import crypto from 'crypto';

// 2. External dependencies
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { Octokit } from '@octokit/rest';

// 3. Internal modules (use relative paths with ../)
import db from '../config/postgresql';
import logging from '../config/logging';
import { createRBACMiddleware } from '../middlewares/RBACSystem';
```

#### TypeScript Types
Always use explicit types, prefer `type` over `interface` for simple structures:
```typescript
// For API responses
type ApiResponse = {
    error: boolean;
    data: ProjectData;
};

// For function parameters
const createProject = async (req: Request, res: Response): Promise<Response> => {
    // ...
};

// For extended Request types
export interface AuthenticatedRequest extends Request {
    accessToken?: string;
    user?: User;
    companyEmployee?: CompanyEmployee;
}
```

#### Service Functions Pattern
```typescript
const ServiceName = async (req: Request, res: Response): Promise<Response> => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().forEach((error) => {
            logging.error('ACTION-NAME', error.errorMsg);
        });
        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        // Business logic
        
        logging.info('ACTION-NAME', `Success message`);
        return res.status(200).json({ success: true, data });
    } catch (error: any) {
        console.error('Action error:', error);
        
        return res.status(500).json({
            error: true,
            errmsg: 'Failed to perform action',
        });
    }
};
```

#### Route Definition Pattern
```typescript
import express from 'express';
import { body, param } from 'express-validator';

const router = express.Router();
const rbac = createRBACMiddleware(pool);

router.post(
    '/create-project',
    body('accessToken').not().isEmpty().withMessage('Access token is required'),
    body('name').not().isEmpty().withMessage('Project name is required'),
    body('teamId').not().isEmpty().withMessage('Team ID is required'),
    rbac.authenticate,
    rbac.loadCompanyEmployee,
    rbac.requirePermission(PermissionResource.PROJECT, PermissionAction.CREATE),
    ProjectsServices.CreateProject,
);

router.get(
    '/get-projects/:accessToken',
    param('accessToken').not().isEmpty(),
    rbac.authenticate,
    rbac.loadCompanyEmployee,
    rbac.requirePermission(PermissionResource.PROJECT, PermissionAction.READ),
    ProjectsServices.GetProjects,
);

export default router;
```

#### Database Queries
Use parameterized queries with CTEs for complex operations:
```typescript
const result = await db.query(
    `
    WITH inserted_project AS (
        INSERT INTO projects (
            company_id,
            name,
            slug,
            team_id,
            git_repo_url
        )
        SELECT cu.company_id, $2, $3, $4, $5
        FROM company_users cu
        WHERE cu.user_id = $1
        LIMIT 1
        RETURNING *
    )
    SELECT p.*, t.name AS team_name
    FROM inserted_project p
    JOIN teams t ON p.team_id = t.id
    `,
    [userId, name, projectSlug, teamId, gitRepoUrl],
);
```

#### Error Logging
```typescript
// Always include namespace
logging.info('CREATE-PROJECT', `Project "${name}" created successfully`);
logging.error('DELETE-PROJECT', `Failed to delete project: ${error.message}`);
logging.warn('GITHUB-REMOVE-REPO', `Repository not found`);

// Console for debugging
console.error('Error details:', error);
console.log('Debug info:', data);
```

#### Transactions
Always use explicit transactions with proper cleanup:
```typescript
const client = await db.connect();

try {
    await client.query('BEGIN');
    
    // Multiple operations
    await client.query('INSERT INTO...', [params]);
    await client.query('UPDATE...', [params]);
    
    await client.query('COMMIT');
    
    return res.status(200).json({ success: true });
} catch (error: any) {
    await client.query('ROLLBACK');
    logging.error('ACTION', error.message);
    return res.status(500).json({ error: true });
} finally {
    client.release();
}
```

---

## Next.js Client Standards

### Project Structure

```
client/
├── app/                         # Next.js App Router
│   ├── api/                     # API routes
│   ├── projects/                # Project pages
│   ├── team/                    # Team management
│   └── account/                 # User account
├── features/                    # Feature modules
│   ├── projects/
│   │   ├── Types/
│   │   │   └── ProjectTypes.ts
│   │   └── components/
│   ├── account/
│   └── teams/
├── hooks/                       # Custom React hooks
│   ├── useBuildUpdates.ts
│   └── usePlatformLogs.ts
├── lib/                         # Utilities
│   ├── utils.ts
│   └── store/
│       └── accountStore.ts
└── types/                       # Global TypeScript types
```

### Coding Conventions

#### Component Structure
```typescript
'use client'  // If using client-side features

import { useEffect, useState } from 'react'
import { useAccountStore } from '@/lib/store/accountStore'

interface ComponentProps {
    projectId: string
    initialData: ProjectData
}

export function ProjectComponent({ projectId, initialData }: ComponentProps) {
    const [data, setData] = useState(initialData)
    const { user } = useAccountStore()

    useEffect(() => {
        // Effect logic
    }, [projectId])

    return (
        <div>
            {/* JSX */}
        </div>
    )
}
```

#### Custom Hooks Pattern
```typescript
// hooks/useBuildUpdates.ts
import { useEffect, useState, useRef, useMemo } from 'react'
import { Build, BuildStatus } from '@/features/projects/Types/ProjectTypes'

export function useBuildUpdates(projectId: string, initialBuilds: Build[]) {
    const [updatedBuilds, setUpdatedBuilds] = useState<Build[]>(initialBuilds)
    const eventSourcesRef = useRef<Map<string, EventSource>>(new Map())

    useEffect(() => {
        // Effect logic with proper cleanup
        
        return () => {
            // Cleanup
            eventSourcesRef.current.forEach(es => es.close())
            eventSourcesRef.current.clear()
        }
    }, [dependency])

    return updatedBuilds
}
```

#### Zustand Store Pattern
```typescript
// lib/store/accountStore.ts
import { create } from 'zustand'

interface User {
    name: string
    accountType: string
    image: string
    hasCompany: boolean
    email: string
}

interface AccountState {
    user: User | null
    authenticated: boolean
    status: 'idle' | 'loading' | 'succeeded' | 'failed'
    error: string | null

    // Actions
    fetchAccount: () => Promise<void>
    logout: () => void
    clearError: () => void
}

export const useAccountStore = create<AccountState>(set => ({
    // Initial state
    user: null,
    authenticated: false,
    status: 'idle',
    error: null,

    fetchAccount: async () => {
        set({ status: 'loading', error: null })

        try {
            const response = await fetch('/api/account')
            
            if (!response.ok) {
                return
            }

            const data = await response.json()

            if (data.error) {
                throw new Error(data.error)
            }

            set({
                status: 'succeeded',
                user: {
                    name: data.name,
                    accountType: data.accountType,
                    image: data.image,
                    email: data.email,
                    hasCompany: data.hasCompany
                },
                authenticated: data.authenticated,
                error: null
            })
        } catch (error) {
            console.error('Fetch account error:', error)
            set({
                status: 'failed',
                authenticated: false,
                user: null,
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        }
    },

    logout: () => {
        set({
            user: null,
            authenticated: false,
            status: 'idle',
            error: null
        })
    },

    clearError: () => {
        set({ error: null })
    }
}))
```

#### Type Definitions
```typescript
// features/projects/Types/ProjectTypes.ts
export interface ProjectData {
    id: string
    name: string
    slug: string
    teamName: string
    framework: string
    isMonorepo: boolean
    status: 'active' | 'inactive' | 'paused' | string
    settings: ProjectSettings
    production: EnvironmentDeployment
    staging: EnvironmentDeployment
    preview: PreviewDeployment[]
    metrics: ProjectMetrics
    gitRepoUrl: string
    builds: BuildData[]
    deployments: Deployment[]
}

export interface BuildData {
    id: string
    commitHash: string
    branch: string
    status: 'queued' | 'cloning' | 'installing' | 'building' | 'deploying' | 'completed' | 'failed' | 'cancelled' | 'timeout'
    buildTime: string | null
    framework: string | null
    initiatedBy: string | null
    createdAt: string
    errorMessage: string | null
}

// Type aliases for status enums
export type BuildStatus = 'queued' | 'cloning' | 'installing' | 'building' | 'running' | 'deploying' | 'success' | 'failed' | 'cancelled'

export type DeploymentStatus = 'pending' | 'deploying' | 'active' | 'failed' | 'rolled_back' | 'terminated'
```

#### API Route Handlers (App Router)
```typescript
// app/api/account/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        // Fetch data
        const data = await fetchUserData()
        
        return NextResponse.json({
            authenticated: true,
            name: data.name,
            email: data.email,
        })
    } catch (error) {
        console.error('API error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch account' },
            { status: 500 }
        )
    }
}
```

---

## Database Patterns

### PostgreSQL Conventions

#### Schema Organization
- `account/` - Users, OAuth, sessions
- `projects/` - Projects, builds, deployments
- `RBAC/` - Roles, permissions
- `subscriptions/` - Stripe billing
- `log/` - Monitoring, metrics

#### Table Design
- Use UUID primary keys: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- Use snake_case for column names
- Include audit fields:
  ```sql
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP  -- For soft deletes
  ```
- Use JSONB for flexible metadata
- Create indexes for frequently queried fields

#### Soft Deletes
Always use soft deletes with `deleted_at`:
```sql
-- In queries
WHERE deleted_at IS NULL

-- Soft delete
UPDATE table_name SET deleted_at = NOW() WHERE id = $1
```

#### Migrations
Place migrations in `data-layer/` organized by domain:
```sql
-- data-layer/projects/builds.sql
CREATE TABLE builds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    initiated_by_user_id UUID REFERENCES users(id),
    commit_hash VARCHAR(255) NOT NULL,
    branch VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    metadata JSONB DEFAULT '{}',
    image_tags JSONB DEFAULT '[]',
    build_time_seconds INTEGER,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_builds_project_id ON builds(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_builds_status ON builds(status) WHERE deleted_at IS NULL;
```

---

## RabbitMQ Messaging Patterns

### Exchange Structure
- **obtura.builds** - Build events
  - Routing key: `build.triggered`
- **obtura.deploys** - Deployment events
  - Routing key: `deploy.triggered`
  - Routing key: `project.cleanup`

### Message Format
```typescript
// Build message
{
    buildId: string,
    projectId: string,
    commitHash: string,
    branch: string,
    deploy?: boolean,
    deploymentId?: string
}

// Deploy message
{
    buildId: string,
    deploymentId: string,
    projectId: string,
    project: {
        id: string,
        slug: string,
        name: string
    },
    build: {
        id: string,
        imageTags: string[],
        branch: string,
        commitHash: string,
        metadata: any
    },
    deployment: {
        id: string,
        environment: string,
        strategy: string,
        domain: string,
        subdomain: string
    }
}
```

---

## Security Standards

### Encryption
Use AES-256-CBC for sensitive data:
```typescript
const ALGORITHM = 'aes-256-cbc';
const KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

const encrypt = (content: string): string => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(content, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
};

const decrypt = (encryptedContent: string): string => {
    const parts = encryptedContent.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};
```

### RBAC Permissions
```typescript
// middlewares/RBACTypes.ts
export enum PermissionResource {
    PROJECT = 'project',
    TEAM = 'team',
    COMPANY = 'company',
    DEPLOYMENT = 'deployment',
}

export enum PermissionAction {
    CREATE = 'create',
    READ = 'read',
    UPDATE = 'update',
    DELETE = 'delete',
}

export enum TeamRole {
    OWNER = 'owner',
    ADMIN = 'admin',
    MEMBER = 'member',
    VIEWER = 'viewer',
}
```

---

## Docker & Infrastructure

### Service Ports
- Traefik: 80, 443, 8080 (dashboard)
- Core API: 7070
- Build Service: 5050
- Deploy Service: 5070
- Monitoring Service: 5110
- Payment Service: 5080
- PostgreSQL: 5432
- Redis: 6379
- RabbitMQ: 5672 (AMQP), 15672 (Management)
- MinIO: 9000 (API), 9001 (Console)

### Environment Variables
Use `.env` files in development. Required variables:
```bash
# Database
POSTGRESQL_HOST=localhost
POSTGRESQL_PORT=5432
POSTGRESQL_DATABASE=obtura_db
POSTGRESQL_USER=postgres
POSTGRESQL_PASSWORD=

# Redis
REDIS_URL=redis://localhost:6379/0

# RabbitMQ
RABBITMQ_URL=amqp://obtura:obtura123@rabbitmq:5672

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=obtura-builds
MINIO_USE_SSL=false

# Encryption
ENV_ENCRYPTION_KEY=your-secret-key

# GitHub App
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY_PATH=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## Testing Standards

### Unit Tests (Go)
```go
func TestDetectFramework(t *testing.T) {
    tests := []struct {
        name        string
        projectPath string
        want        *Framework
        wantErr     bool
    }{
        {
            name:        "Next.js project",
            projectPath: "testdata/nextjs",
            want: &Framework{
                Name:     "Next.js",
                Runtime:  "node:20-alpine",
                BuildCmd: "npm run build",
                Port:     3000,
            },
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := DetectFramework(tt.projectPath)
            if (err != nil) != tt.wantErr {
                t.Errorf("DetectFramework() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
            if !reflect.DeepEqual(got, tt.want) {
                t.Errorf("DetectFramework() = %v, want %v", got, tt.want)
            }
        })
    }
}
```

### Integration Tests
- Use test database with transactions
- Clean up resources after tests
- Mock external services (RabbitMQ, GitHub)

---

## Code Review Checklist

### Go Services
- [ ] Error handling with proper context wrapping
- [ ] Context propagation throughout call chain
- [ ] Resource cleanup (defer statements)
- [ ] No goroutine leaks
- [ ] Proper logging with emojis
- [ ] Environment variables have defaults
- [ ] Database connections closed properly

### Node.js API
- [ ] Input validation using express-validator
- [ ] RBAC middleware applied
- [ ] Proper error responses (401, 403, 404, 409, 500)
- [ ] Database transactions where needed
- [ ] Logging with namespace
- [ ] No sensitive data in logs

### Client
- [ ] TypeScript types defined
- [ ] Proper error handling
- [ ] Loading states implemented
- [ ] Cleanup in useEffect
- [ ] Accessible UI elements

### Database
- [ ] Soft delete pattern used
- [ ] Indexes on foreign keys
- [ ] JSONB for flexible data
- [ ] Proper constraints

---

## Common Commands

### Development
```bash
# Start all services
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose logs -f core-api
docker-compose logs -f build-service

# Rebuild specific service
docker-compose up -d --build build-service
```

### Database
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d obtura_db

# Run migrations
# (Place .sql files in data-layer/ and execute in order)
```

### Go Services
```bash
# Hot reload (with Air)
cd api-layer/build-service && air

# Build for production
cd api-layer/build-service && go build -o bin/build-service cmd/main.go
```

---

## Best Practices Summary

1. **Always handle errors** - Never ignore errors, always wrap with context
2. **Use transactions** - For multi-step database operations
3. **Soft deletes** - Never hard delete, use `deleted_at`
4. **Structured logging** - Use emojis and consistent message formats
5. **Type safety** - Full TypeScript coverage, explicit Go types
6. **RBAC everywhere** - Check permissions on every route
7. **Context propagation** - Pass context through entire call chain
8. **Resource cleanup** - Always defer close/cleanup operations
9. **Environment config** - Use env vars with sensible defaults
10. **Validation** - Validate all inputs at API boundary

---

## File Naming Conventions

| Language | Files | Examples |
|----------|-------|----------|
| Go | snake_case.go | `rate_limit.go`, `platform_logger.go` |
| TypeScript | PascalCase.ts | `ProjectServices.ts`, `RBACSystem.ts` |
| React | PascalCase.tsx | `ProjectCard.tsx`, `BuildStatus.tsx` |
| SQL | snake_case.sql | `builds_table.sql`, `rbac_schema.sql` |
| CSS | kebab-case.css | `project-card.module.css` |

---

## Contact & Resources

- **Project**: Obtura - Autonomous DevOps Platform
- **Tech Stack**: Go 1.24+, Node.js 20+, Next.js 16, PostgreSQL 18, Redis 7, RabbitMQ 3.13
- **Architecture**: Microservices with message queues
- **Deployment**: Docker, Traefik, Jenkins CI/CD
