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
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
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
        const { accessToken } = req.body;
        const { projectId } = req.params;

        const userID = await getUserIdFromSessionToken(accessToken);

        if (!userID) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const envConfigs = await db.query('SELECT service_name, updated_at FROM project_env_configs WHERE project_id = $1 ORDER BY service_name', [projectId]);

        return res.status(200).json({
            services: envConfigs.rows,
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

export default {
    RegisterUserWithGoogle,
    GetProjects,
    TriggerBuild,
    GetEnvConfigs,
    UploadEnvConfig,
    CreateProject,
};
