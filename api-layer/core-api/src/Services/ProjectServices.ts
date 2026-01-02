import { Request, Response } from 'express';
import logging from '../config/logging';
import { CustomRequestValidationResult } from '../common/comon';
import db from '../config/postgresql';
import { getUserIdFromSessionToken, getDataRegion, normalizeServiceName } from '../lib/utils';
import rabbitmq from '../config/rabbitmql';
import crypto from 'crypto';

/**
 * Registers a new user account with Google authentication
 * @param {Request} req
 * @param {Response} res
 * @return {Response}
 */
const RegisterUserWithGoogle = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('REGISTER-USER-WITH-GOOGLE', error.errorMsg);
        });

        return res.status(200).json({ error: true, errors: errors.array() });
    }

    try {
        res.status(200).json({});
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

const CreateProject = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().forEach((error) => {
            logging.error('CREATE-PROJECT', error.errorMsg);
        });

        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const { accessToken, name, gitRepoUrl, productionBranch, stagingBranch, developmentBranch, autoDeployProduction, autoDeployStaging, autoDeployDevelopment, teamId } = req.body;

        const userId = await getUserIdFromSessionToken(accessToken);

        if (!userId) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const dataRegion = getDataRegion(req);

        const projectSlug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        const branches = [
            { branch: productionBranch, autoDeploy: autoDeployProduction, type: 'production' },
            { branch: stagingBranch, autoDeploy: autoDeployStaging, type: 'staging' },
            { branch: developmentBranch, autoDeploy: autoDeployDevelopment, type: 'development' },
        ].filter((b) => typeof b.branch === 'string' && b.branch.trim() !== '');

        const result = await db.query(
            `
            WITH inserted_project AS (
                INSERT INTO projects (
                    company_id,
                    name,
                    slug,
                    team_id,
                    git_repo_url,
                    git_branches,
                    data_region
                )
                SELECT
                    cu.company_id,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7
                FROM company_users cu
                WHERE cu.user_id = $1
                LIMIT 1
                RETURNING *
            )
            SELECT
                p.id,
                p.name AS project_name,
                p.created_at,
                p.slug,
                t.name AS team_name,
                COUNT(tm.id) AS member_count
            FROM inserted_project p
            JOIN teams t ON p.team_id = t.id
            LEFT JOIN team_members tm ON tm.team_id = t.id
            GROUP BY
                p.id,
                p.name,
                p.created_at,
                p.slug,
                t.name
            `,
            [userId, name, projectSlug, teamId, gitRepoUrl, JSON.stringify(branches), dataRegion],
        );

        const projects = result.rows.map((project) => ({
            id: project.id,
            projectName: project.project_name,
            createdAt: project.created_at,
            slug: project.slug,
            teamName: project.team_name,
            memberCount: Number(project.member_count),
        }));

        return res.status(200).json({ project: projects[0] });
    } catch (error) {
        console.error('create project error:', error);
        return res.status(500).json({ error: 'Failed to create project' });
    }
};

const GetProjects = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('GET-PROJECTS', error.errorMsg);
        });

        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const { accessToken } = req.params;

        const userId = await getUserIdFromSessionToken(accessToken);

        console.log(userId);

        if (!userId) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const result = await db.query(
            `
  SELECT
    p.id,
    p.name AS project_name,
    p.created_at,
    p.slug,
    t.name AS team_name,
    COUNT(tm.id) AS member_count
  FROM projects p
  JOIN teams t ON p.team_id = t.id
  LEFT JOIN team_members tm ON tm.team_id = t.id
  WHERE EXISTS (
    SELECT 1
    FROM company_users cu
    WHERE cu.company_id = p.company_id
      AND cu.user_id = $1
  )
  GROUP BY
    p.id,
    p.name,
    p.created_at,
    p.slug,
    t.name
  `,
            [userId],
        );

        const projects = result.rows.map((project) => ({
            id: project.id,
            projectName: project.project_name,
            createdAt: project.created_at,
            slug: project.slug,
            teamName: project.team_name,
            memberCount: project.member_count,
        }));

        res.status(200).json({ projects });
    } catch (error) {
        console.error('get projects error:', error);
        res.status(500).json({ error: 'Failed to get projects' });
    }
};

const ENCRYPTION_KEY = process.env.ENV_ENCRYPTION_KEY || '';
const ALGORITHM = 'aes-256-cbc';

const KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
const encryptEnvContent = (content: string): string => {
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

    let encrypted = cipher.update(content, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
};

const decryptEnvContent = (encryptedContent: string): string => {
    const parts = encryptedContent.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv); // Use KEY instead
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

const UploadEnvConfig = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const { accessToken, projectId, envLocation } = req.body;
        const userID = await getUserIdFromSessionToken(accessToken);

        if (!userID) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const envFile = req.file;
        let envFileContent: string | null = null;

        if (envFile) {
            envFileContent = envFile.buffer.toString('utf-8');
        }

        if (!envFileContent) {
            return res.status(400).json({ error: true, errmsg: 'No file uploaded' });
        }

        const serviceName = normalizeServiceName(envLocation);

        await db.query(
            `INSERT INTO project_env_configs (project_id, service_name, env_content, folder_location, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (project_id, service_name)
             DO UPDATE SET env_content = $3, updated_at = NOW()`,
            [projectId, serviceName, encryptEnvContent(envFileContent), envLocation],
        );

        return res.status(200).json({
            success: true,
            message: 'Environment configurations uploaded successfully',
        });
    } catch (error) {
        console.error('Upload env config error:', error);
        res.status(500).json({ error: 'Failed to upload env configs' });
    }
};

const GetEnvConfigs = async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;

        const envConfigs = await db.query('SELECT service_name, env_content, updated_at FROM project_env_configs WHERE project_id = $1 ORDER BY service_name', [projectId]);

        const services = envConfigs.rows.map((row) => {
            const envVars: Record<string, string> = {};
            try {
                const decryptedContent = decryptEnvContent(row.env_content);

                const lines = decryptedContent.split('\n');
                for (const line of lines) {
                    const trimmedLine = line.trim();

                    if (!trimmedLine || trimmedLine.startsWith('#')) {
                        continue;
                    }

                    const equalIndex = trimmedLine.indexOf('=');
                    if (equalIndex > 0) {
                        const key = trimmedLine.substring(0, equalIndex).trim();
                        let value = trimmedLine.substring(equalIndex + 1).trim();

                        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.slice(1, -1);
                        }

                        envVars[key] = value;
                    }
                }
            } catch (error) {
                console.error(`Failed to decrypt env for service ${row.service_name}:`, error);
            }
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.setHeader('X-Content-Type-Options', 'nosniff');

            return {
                service_name: row.service_name,
                env_vars: envVars,
                updated_at: row.updated_at,
            };
        });

        return res.status(200).json({
            services,
        });
    } catch (error) {
        console.error('Get env configs error:', error);
        res.status(500).json({ error: 'Failed to fetch env configs' });
    }
};
const TriggerBuild = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const { accessToken, projectId, commitHash, branch } = req.body;

        const userID = await getUserIdFromSessionToken(accessToken);

        if (!userID) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const result = await db.query('INSERT INTO builds (project_id, initiated_by_user_id, commit_hash, branch, status) VALUES ($1, $2, $3, $4, $5) RETURNING id', [projectId, userID, commitHash, branch, 'PENDING']);

        const buildId = result.rows[0].id;

        await rabbitmq.connect();
        const channel = await rabbitmq.getChannel();

        await channel.publish(
            'obtura.builds',
            'build.triggered',
            Buffer.from(
                JSON.stringify({
                    buildId: buildId,
                    projectId: projectId,
                    commitHash: commitHash,
                    branch: branch,
                }),
            ),
            { persistent: true, timestamp: Date.now() },
        );

        return res.status(200).json({
            buildId: buildId,
            status: 'queued',
        });
    } catch (error) {
        console.error('trigger build error:', error);
        res.status(500).json({ error: 'Failed to trigger build' });
    }
};

const GetProjectDetails = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const { projectId } = req.params;

        const query = `
            WITH latest_deployments AS (
                SELECT DISTINCT ON (d.project_id, d.deployment_type)
                    d.id,
                    d.project_id,
                    d.deployment_type,
                    d.commit_hash,
                    d.branch,
                    d.status,
                    d.deployment_url,
                    d.created_at,
                    d.completed_at,
                    d.build_id,
                    b.build_time_seconds,
                    b.metadata as build_metadata,
                    EXTRACT(EPOCH FROM (NOW() - COALESCE(d.completed_at, d.created_at))) as seconds_ago
                FROM deployments d
                LEFT JOIN builds b ON b.id = d.build_id
                WHERE d.status = 'deployed'
                    AND d.project_id = $1
                ORDER BY d.project_id, d.deployment_type, d.completed_at DESC NULLS LAST
            ),
            preview_deployments AS (
                SELECT 
                    d.deployment_url,
                    d.branch,
                    d.commit_hash,
                    d.created_at,
                    EXTRACT(EPOCH FROM (NOW() - d.created_at)) as seconds_ago
                FROM deployments d
                WHERE d.project_id = $1
                    AND d.deployment_type = 'preview'
                    AND d.status = 'deployed'
                ORDER BY d.created_at DESC
                LIMIT 10
            ),
            latest_metrics AS (
                SELECT 
                    uptime_percentage,
                    avg_response_time_ms,
                    total_requests,
                    total_errors
                FROM deployment_metrics
                WHERE project_id = $1
                    AND metric_date >= CURRENT_DATE - INTERVAL '1 day'
                ORDER BY metric_date DESC
                LIMIT 1
            ),
            latest_build AS (
                SELECT 
                    b.metadata
                FROM builds b
                WHERE b.project_id = $1
                    AND b.status = 'completed'
                ORDER BY b.created_at DESC
                LIMIT 1
            )
            SELECT 
                p.id,
                p.name,
                p.slug,
                t.name as team_name,
                -- Get all frameworks if monorepo
                CASE 
                    WHEN (lb.metadata->>'isMonorepo')::boolean = true THEN
                        lb.metadata->'frameworks'
                    ELSE NULL
                END as frameworks,
                COALESCE((lb.metadata->>'isMonorepo')::boolean, false) as is_monorepo,
                CASE 
                    WHEN p.deleted_at IS NULL THEN 'active'
                    ELSE 'inactive'
                END as status,
                
                -- Production deployment
                COALESCE(
                    json_build_object(
                        'url', prod.deployment_url,
                        'status', prod.status,
                        'lastDeployment', CASE 
                            WHEN prod.seconds_ago < 3600 THEN CONCAT(FLOOR(prod.seconds_ago / 60), ' minutes ago')
                            WHEN prod.seconds_ago < 86400 THEN CONCAT(FLOOR(prod.seconds_ago / 3600), ' hours ago')
                            ELSE CONCAT(FLOOR(prod.seconds_ago / 86400), ' days ago')
                        END,
                        'commit', prod.commit_hash,
                        'branch', prod.branch,
                        'buildTime', CASE 
                            WHEN prod.build_time_seconds IS NOT NULL 
                            THEN CONCAT(FLOOR(prod.build_time_seconds / 60), 'm ', prod.build_time_seconds % 60, 's')
                            ELSE NULL
                        END,
                        'framework', CASE 
                            WHEN prod.build_metadata->>'frameworks' IS NOT NULL THEN
                                (prod.build_metadata->'frameworks'->0->>'Name')
                            ELSE NULL
                        END
                    ),
                    '{}'::json
                ) as production,
                
                -- Staging deployment
                COALESCE(
                    json_build_object(
                        'url', stg.deployment_url,
                        'status', stg.status,
                        'lastDeployment', CASE 
                            WHEN stg.seconds_ago < 3600 THEN CONCAT(FLOOR(stg.seconds_ago / 60), ' minutes ago')
                            WHEN stg.seconds_ago < 86400 THEN CONCAT(FLOOR(stg.seconds_ago / 3600), ' hours ago')
                            ELSE CONCAT(FLOOR(stg.seconds_ago / 86400), ' days ago')
                        END,
                        'commit', stg.commit_hash,
                        'branch', stg.branch,
                        'buildTime', CASE 
                            WHEN stg.build_time_seconds IS NOT NULL 
                            THEN CONCAT(FLOOR(stg.build_time_seconds / 60), 'm ', stg.build_time_seconds % 60, 's')
                            ELSE NULL
                        END,
                        'framework', CASE 
                            WHEN stg.build_metadata->>'frameworks' IS NOT NULL THEN
                                (stg.build_metadata->'frameworks'->0->>'Name')
                            ELSE NULL
                        END
                    ),
                    '{}'::json
                ) as staging,
                
                -- Preview deployments
                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'url', pd.deployment_url,
                                'branch', pd.branch,
                                'commit', pd.commit_hash,
                                'createdAt', CASE 
                                    WHEN pd.seconds_ago < 3600 THEN CONCAT(FLOOR(pd.seconds_ago / 60), ' minutes ago')
                                    WHEN pd.seconds_ago < 86400 THEN CONCAT(FLOOR(pd.seconds_ago / 3600), ' hours ago')
                                    ELSE CONCAT(FLOOR(pd.seconds_ago / 86400), ' days ago')
                                END
                            )
                        )
                        FROM preview_deployments pd
                    ),
                    '[]'::json
                ) as preview,
                
                -- Metrics
                json_build_object(
                    'uptime', CONCAT(COALESCE(m.uptime_percentage, 99.9), '%'),
                    'avgResponseTime', CONCAT(COALESCE(m.avg_response_time_ms, 0), 'ms'),
                    'requests24h', COALESCE(m.total_requests, 0)::text,
                    'errors24h', COALESCE(m.total_errors, 0)::text
                ) as metrics

            FROM projects p
            LEFT JOIN teams t ON t.id = p.team_id
            LEFT JOIN latest_build lb ON true
            LEFT JOIN latest_deployments prod ON prod.project_id = p.id AND prod.deployment_type = 'production'
            LEFT JOIN latest_deployments stg ON stg.project_id = p.id AND stg.deployment_type = 'staging'
            LEFT JOIN latest_metrics m ON true
            WHERE p.id = $1
                AND p.deleted_at IS NULL;
        `;

        const result = await db.query(query, [projectId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: true,
                message: 'Project not found',
            });
        }

        const project = result.rows[0];

        res.status(200).json({
            error: false,
            project: {
                id: project.id,
                name: project.name,
                slug: project.slug,
                teamName: project.team_name,
                framework: project.framework,
                isMonorepo: project.is_monorepo,
                frameworks: project.frameworks || null,
                status: project.status,
                production: project.production,
                staging: project.staging,
                preview: project.preview || [],
                metrics: project.metrics,
            },
        });
    } catch (error) {
        console.error('Get project details error:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to fetch project details',
        });
    }
};

export default {
    RegisterUserWithGoogle,
    GetProjects,
    GetProjectDetails,
    TriggerBuild,
    GetEnvConfigs,
    UploadEnvConfig,
    CreateProject,
};
