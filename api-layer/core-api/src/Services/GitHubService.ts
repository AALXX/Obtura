import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import crypto from 'crypto';
import fs from 'fs';
import pool from '../config/postgresql';
import redis from '../config/redis';
import { type Request, type Response } from 'express';
import { getCompanyIdFromSessionToken } from '../lib/utils';
import logging from '../config/logging';

const GITHUB_APP_ID = process.env.GITHUB_APP_ID!;
const GITHUB_APP_CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID!;
const GITHUB_APP_CLIENT_SECRET = process.env.GITHUB_APP_CLIENT_SECRET!;
const GITHUB_APP_WEBHOOK_SECRET = process.env.GITHUB_APP_WEBHOOK_SECRET!;

const GITHUB_APP_PRIVATE_KEY = fs.readFileSync(process.env.GITHUB_APP_PRIVATE_KEY_PATH || '', 'utf-8');

const GetInstallationURL = async (req: Request, res: Response) => {
    try {
        const { accessToken } = req.params;

        const companyId = await getCompanyIdFromSessionToken(accessToken);

        if (!companyId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired access token',
            });
        }

        const state = crypto.randomBytes(32).toString('hex');

        await redis.setEx(`github:state:${state}`, 600, companyId);

        const installationURL = `https://github.com/apps/obtura-platform/installations/new?state=${state}`;

        logging.info('GET-INSTALLATION-URL', `Generated installation URL: ${state}`);

        return res.status(200).json({
            success: true,
            installationURL,
            message: 'Redirect user to this URL to install GitHub App',
        });
    } catch (error: any) {
        console.error('Error generating installation URL:', error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

const HandleInstallationCallback = async (req: Request, res: Response) => {
    try {
        const { installationId, setupAction, state } = req.query;

        if (!installationId) {
            logging.error('HANDLE-INSTALLATION-CALLBACK', 'Missing installationId');
            return res.json({
                success: false,
                message: 'Missing installationId',
                data: null,
            });
        }

        const companyId = await redis.get(`github:state:${state}`);
        if (!companyId) {
            logging.error('HANDLE-INSTALLATION-CALLBACK', 'Invalid state');
            return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=invalid_state`);
        }

        await redis.del(`github:state:${state}`);

        const installationIdNum = parseInt(installationId as string);

        const appOctokit = new Octokit({
            authStrategy: createAppAuth,
            auth: {
                appId: GITHUB_APP_ID,
                privateKey: GITHUB_APP_PRIVATE_KEY,
            },
        });

        const installationOctokit = new Octokit({
            authStrategy: createAppAuth,
            auth: {
                appId: GITHUB_APP_ID,
                privateKey: GITHUB_APP_PRIVATE_KEY,
                installationId: installationIdNum,
            },
        });

        const { data: installation } = await appOctokit.rest.apps.getInstallation({
            installation_id: installationIdNum,
        });

        const { data: repos } = await installationOctokit.rest.apps.listReposAccessibleToInstallation();

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const repositories = repos.repositories.map((repo) => ({
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                private: repo.private,
                cloneUrl: repo.clone_url,
                defaultBranch: repo.default_branch,
            }));

            const insertQuery = `
        INSERT INTO github_installations (
          installation_id,
          company_id,
          account_login,
          account_type,
          account_id,
          repositories,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (installation_id) 
        DO UPDATE SET 
          repositories = $6,
          updated_at = NOW()
        RETURNING *
      `;

            await client.query(insertQuery, [installationIdNum, companyId, installation.account.login, installation.account.type, installation.account.id, JSON.stringify(repositories)]);

            await client.query('COMMIT');

            console.log(`✅ GitHub App installed: ${repositories.length} repositories`);

            return res.json({
                success: true,
                message: 'GitHub App installed successfully!',
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('Error handling installation:', error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

const GetUserInstallations = async (req: Request, res: Response) => {
    try {
        const { accessToken } = req.params;

        const companyId = await getCompanyIdFromSessionToken(accessToken);

        if (!companyId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired access token',
            });
        }

        const query = `
      SELECT 
        installation_id,
        account_login,
        account_type,
        repositories,
        created_at
      FROM github_installations
      WHERE company_id = $1
      ORDER BY created_at DESC
    `;

        const result = await pool.query(query, [companyId]);

        return res.status(200).json({
            success: true,
            installations: result.rows,
        });
    } catch (error: any) {
        console.error('Error fetching installations:', error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const GetInstallationToken = async (installationId: number): Promise<string> => {
    const cacheKey = `github:token:${installationId}`;
    const cachedToken = await redis.get(cacheKey);

    if (cachedToken) {
        return cachedToken;
    }

    const octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
            appId: GITHUB_APP_ID,
            privateKey: GITHUB_APP_PRIVATE_KEY,
            installationId: installationId,
        },
    });

    const { data } = await octokit.rest.apps.createInstallationAccessToken({
        installation_id: installationId,
    });

    await redis.setEx(cacheKey, 3000, data.token);

    return data.token;
};

const GetProjectGitHubToken = async (req: any, res: any) => {
    try {
        const { projectId } = req.params;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: 'Project ID required',
            });
        }

        const query = `
      SELECT gi.installation_id
      FROM projects p
      LEFT JOIN github_installations gi ON gi.installation_id = p.github_installation_id
      WHERE p.id = $1
    `;

        const result = await pool.query(query, [projectId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found',
            });
        }

        const installationId = result.rows[0].installation_id;

        if (!installationId) {
            // No GitHub integration for this project
            return res.status(404).json({
                success: false,
                message: 'No GitHub integration found for project',
            });
        }

        // Get installation token (cached for 50 minutes)
        const token = await GetInstallationToken(installationId);

        return res.status(200).json({
            success: true,
            token: token,
        });
    } catch (error: any) {
        console.error('Error getting project token:', error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

const GetRepositoryBranches = async (req: Request, res: Response) => {
    try {
        const { installationId, owner, repo } = req.params;

        if (!installationId || !owner || !repo) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters',
            });
        }

        const token = await GetInstallationToken(parseInt(installationId));

        const octokit = new Octokit({
            auth: token,
        });

        const { data } = await octokit.rest.repos.listBranches({
            owner,
            repo,
            per_page: 100,
        });

        return res.status(200).json({
            success: true,
            branches: data,
        });
    } catch (error: any) {
        console.error('Error fetching branches:', error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

const HandleWebhook = async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-hub-signature-256'];
        const payload = JSON.stringify(req.body);

        const hmac = crypto.createHmac('sha256', GITHUB_APP_WEBHOOK_SECRET);
        const digest = 'sha256=' + hmac.update(payload).digest('hex');

        if (signature !== digest) {
            return res.status(401).json({
                success: false,
                message: 'Invalid signature',
            });
        }

        const event = req.headers['x-github-event'];
        const { action, installation, repositories, repository } = req.body;

        console.log(`Received GitHub webhook: ${event} - ${action}`);

        switch (event) {
            case 'installation':
                await handleInstallationEvent(req.body);
                break;

            case 'installation_repositories':
                await handleInstallationRepositoriesEvent(req.body);
                break;

            case 'push':
                await handlePushEvent(req.body);
                break;

            case 'pull_request':
                await handlePullRequestEvent(req.body);
                break;

            default:
                console.log(`Unhandled event: ${event}`);
        }

        return res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('Webhook error:', error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

const handleInstallationEvent = async (payload: any) => {
    const { action, installation, repositories } = payload;

    if (action === 'created') {
        console.log(`Installation created: ${installation.id}`);
    } else if (action === 'deleted') {
        console.log(`Installation deleted: ${installation.id}`);

        await pool.query('DELETE FROM github_installations WHERE installation_id = $1', [installation.id]);
    }
};

const handleInstallationRepositoriesEvent = async (payload: any) => {
    const { action, installation, repositories_added, repositories_removed } = payload;

    const { rows } = await pool.query('SELECT repositories FROM github_installations WHERE installation_id = $1', [installation.id]);

    if (rows.length === 0) return;

    let repoList = JSON.parse(rows[0].repositories);

    if (action === 'added') {
        repositories_added.forEach((repo: any) => {
            repoList.push({
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                private: repo.private,
            });
        });
    } else if (action === 'removed') {
        const removedIds = repositories_removed.map((r: any) => r.id);
        repoList = repoList.filter((r: any) => !removedIds.includes(r.id));
    }

    await pool.query('UPDATE github_installations SET repositories = $1, updated_at = NOW() WHERE installation_id = $2', [JSON.stringify(repoList), installation.id]);
};

const handlePushEvent = async (payload: any) => {
    const { repository, ref, after, installation } = payload;
    const branch = ref.replace('refs/heads/', '');

    console.log(`Push to ${repository.full_name} on branch ${branch}`);

    const { rows } = await pool.query(
        `SELECT p.* FROM projects p
     JOIN github_installations gi ON gi.user_id = p.user_id
     WHERE gi.installation_id = $1
     AND p.git_repo_url LIKE $2`,
        [installation.id, `%${repository.full_name}%`],
    );

    for (const project of rows) {
        const shouldDeploy = (branch === project.production_branch && project.auto_deploy_production) || (branch === project.staging_branch && project.auto_deploy_staging) || (branch === project.development_branch && project.auto_deploy_development);

        if (shouldDeploy) {
            console.log(`Auto-deploying project ${project.project_id} for branch ${branch}`);

            // Trigger build (you'll implement this)
            // await TriggerBuildService(project.project_id, after, branch);
        }
    }
};

const handlePullRequestEvent = (payload: any) => {
    const { action, pull_request, installation } = payload;

    if (action === 'opened' || action === 'synchronize') {
        console.log(`PR ${action}: ${pull_request.html_url}`);

        // TODO: Create preview environment
    } else if (action === 'closed') {
        console.log(`PR closed: ${pull_request.html_url}`);

        // TODO: Destroy preview environment
    }
};

export default {
    GetInstallationURL,
    HandleInstallationCallback,
    GetUserInstallations,
    GetRepositoryBranches,
    HandleWebhook,
    GetProjectGitHubToken,
};
