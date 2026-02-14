import { type Request, type Response } from 'express';
import logging from '../config/logging';
import { CustomRequestValidationResult } from '../common/comon';
import db from '../config/postgresql';
import { getUserIdFromSessionToken, getDataRegion, normalizeServiceName, getCompanyIdFromSessionToken } from '../lib/utils';
import rabbitmq from '../config/rabbitmql';
import crypto from 'crypto';
import fs from 'fs';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { GetInstallationToken } from './GitHubService';
import axios from 'axios';

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
        const { accessToken, name, gitRepoUrl, productionBranch, stagingBranch, developmentBranch, autoDeployProduction, autoDeployStaging, autoDeployDevelopment, teamId, githubInstallationId, githubRepositoryId, githubRepositoryFullName } = req.body;

        const userId = await getUserIdFromSessionToken(accessToken);

        if (!userId) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const companyId = await getCompanyIdFromSessionToken(accessToken);
        if (!companyId) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        if (githubInstallationId) {
            const installationCheck = await db.query(
                `SELECT 1 FROM github_installations 
                 WHERE installation_id = $1 AND company_id = $2`,
                [githubInstallationId, companyId],
            );

            if (installationCheck.rows.length === 0) {
                return res.status(403).json({
                    error: true,
                    errmsg: 'GitHub installation not found or does not belong to user',
                });
            }
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
                    github_installation_id,
                    github_repository_id,
                    github_repository_full_name,
                    data_region
                )
                SELECT
                    cu.company_id,
                    $2,  -- name
                    $3,  -- slug
                    $4,  -- team_id
                    $5,  -- git_repo_url
                    $6,  -- git_branches
                    $7,  -- github_installation_id
                    $8,  -- github_repository_id
                    $9,  -- github_repository_full_name
                    $10  -- data_region
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
                p.github_installation_id,
                p.github_repository_full_name,
                p.git_branches,
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
                p.github_installation_id,
                p.github_repository_full_name,
                p.git_branches,
                t.name
            `,
            [userId, name, projectSlug, teamId, gitRepoUrl, JSON.stringify(branches), githubInstallationId || null, githubRepositoryId || null, githubRepositoryFullName || null, dataRegion],
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                error: true,
                errmsg: 'Failed to create project. User may not belong to a company.',
            });
        }

        const project = result.rows[0];

        // Insert default project settings
        await db.query(
            `INSERT INTO project_settings (
                project_id,
                domains,
                caching_enabled,
                cache_ttl,
                compress_assets,
                image_optimization,
                cdn_enabled,
                https_enabled,
                https_enforce,
                https_certificate_id,
                rate_limiting_enabled,
                rate_limiting_max_requests,
                rate_limiting_window_seconds,
                rate_limiting_burst_limit,
                rate_limiting_burst_period_seconds,
                perform_health_checks,
                health_check_url,
                build_cache_enabled,
                parallel_builds,
                build_optimization_enabled,
                fail_on_warning
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
            [
                project.id, // project_id
                null, // domains - no domains set
                true, // caching_enabled - enable caching true
                3600, // cache_ttl - 3600 seconds
                true, // compress_assets - enable compression true
                true, // image_optimization - image optimization true
                true, // cdn_enabled - cdn integration true
                true, // https_enabled - enable https true
                false, // https_enforce - enforce https false
                null, // https_certificate_id
                false, // rate_limiting_enabled - enable rate limit false
                null, // rate_limiting_max_requests
                null, // rate_limiting_window_seconds
                null, // rate_limiting_burst_limit
                null, // rate_limiting_burst_period_seconds
                false, // perform_health_checks - perform healthcheck false
                null, // health_check_url
                true, // build_cache_enabled
                true, // parallel_builds - parallel builds true
                false, // build_optimization_enabled - build optimization false
                false, // fail_on_warning - fail on warnings false
            ],
        );

        const response = {
            id: project.id,
            projectName: project.project_name,
            createdAt: project.created_at,
            slug: project.slug,
            teamName: project.team_name,
            memberCount: Number(project.member_count),
            hasGitHubIntegration: !!project.github_installation_id,
            githubRepository: project.github_repository_full_name,
            branches: project.git_branches,
        };

        logging.info('CREATE-PROJECT', `Project "${name}" created successfully by user ${userId}`);

        return res.status(200).json({ project: response });
    } catch (error: any) {
        console.error('create project error:', error);
        logging.error('CREATE-PROJECT', error.message);

        if (error.code === '23505') {
            return res.status(409).json({
                error: true,
                errmsg: 'A project with this name already exists in the team',
            });
        }

        return res.status(500).json({
            error: true,
            errmsg: 'Failed to create project',
        });
    }
};

const UpdateProjectSettings = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('UPDATE-PROJECT-SETTINGS', error.errorMsg);
        });

        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const {
            projectId,
            domains,
            caching,
            cacheTTL,
            compressAssets,
            imageOptimization,
            cdnEnabled,
            httpsEnabled,
            httpsEnforce,
            httpsCertificate,
            rateLimit,
            rateLimitMaxRequests,
            rateLimitWindow,
            rateLimitBurst,
            rateLimitBurstPeriod,
            performHealthChecks,
            healthCheckUrl,
            buildCacheEnabled,
            parallelBuilds,
            buildOptimization,
            failOnWarnings,
        } = req.body;

        await db.query(
            `
            UPDATE project_settings
            SET
                domains = $2,
                caching_enabled = $3,
                cache_ttl = $4,
                compress_assets = $5,
                image_optimization = $6,
                cdn_enabled = $7,
                https_enabled = $8,
                https_enforce = $9,
                https_certificate_id = $10,
                rate_limiting_enabled = $11,
                rate_limiting_max_requests = $12,
                rate_limiting_window_seconds = $13,
                rate_limiting_burst_limit = $14,
                rate_limiting_burst_period_seconds = $15,
                perform_health_checks = $16,
                health_check_url = $17,
                build_cache_enabled = $18,
                parallel_builds = $19,
                build_optimization_enabled = $20,
                fail_on_warning = $21
            WHERE project_id = $1
            `,
            [
                projectId,
                domains,
                caching,
                cacheTTL,
                compressAssets,
                imageOptimization,
                cdnEnabled,
                httpsEnabled,
                httpsEnforce,
                httpsCertificate,
                rateLimit,
                rateLimitMaxRequests,
                rateLimitWindow,
                rateLimitBurst,
                rateLimitBurstPeriod,
                performHealthChecks,
                healthCheckUrl,
                buildCacheEnabled,
                parallelBuilds,
                buildOptimization,
                failOnWarnings,
            ],
        );

        return res.status(200).json({
            success: true,
            message: 'Project settings updated successfully',
        });
    } catch (error: any) {
        logging.error('UPDATE-PROJECT-SETTINGS', error.message);

        return res.status(500).json({
            error: true,
            errmsg: 'Failed to update project settings',
        });
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

        const userId = await getUserIdFromSessionToken(accessToken!);

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

const removeRepositoryFromGitHubApp = async (installationId: number, owner: string, repoName: string, repoId?: string): Promise<void> => {
    try {
        logging.info('GITHUB-REMOVE-REPO', `Starting removal process for ${owner}/${repoName} from installation ${installationId}`);
        logging.info('GITHUB-REMOVE-REPO', `Environment check - GITHUB_APP_ID: ${process.env.GITHUB_APP_ID ? 'Set' : 'NOT SET'}, PRIVATE_KEY_PATH: ${process.env.GITHUB_APP_PRIVATE_KEY_PATH ? 'Set' : 'NOT SET'}`);

        const privateKey = process.env.GITHUB_APP_PRIVATE_KEY_PATH ? fs.readFileSync(process.env.GITHUB_APP_PRIVATE_KEY_PATH, 'utf-8') : process.env.GITHUB_APP_PRIVATE_KEY;

        if (!privateKey) {
            throw new Error('GitHub App private key not found in environment');
        }

        const appOctokit = new Octokit({
            authStrategy: createAppAuth,
            auth: {
                appId: process.env.GITHUB_APP_ID!,
                privateKey: privateKey,
                installationId: installationId,
            },
        });

        let repositoryId: number;

        if (repoId && !isNaN(parseInt(repoId))) {
            repositoryId = parseInt(repoId);
            logging.info('GITHUB-REMOVE-REPO', `Using stored repository ID: ${repositoryId}`);
        } else {
            logging.info('GITHUB-REMOVE-REPO', `Fetching repository ID for ${owner}/${repoName}...`);

            try {
                const { data: repo } = await appOctokit.rest.repos.get({
                    owner: owner,
                    repo: repoName,
                });

                repositoryId = repo.id;
                logging.info('GITHUB-REMOVE-REPO', `Found repository ID: ${repositoryId}`);
            } catch (fetchError: any) {
                logging.error('GITHUB-REMOVE-REPO', `Failed to fetch repository ${owner}/${repoName}: ${fetchError.message}`);
                throw fetchError;
            }
        }

        logging.info('GITHUB-REMOVE-REPO', `Attempting to remove repository ID ${repositoryId} from installation ${installationId}`);

        try {
            // Use the correct API endpoint for user installations
            await appOctokit.request('DELETE /user/installations/{installation_id}/repositories/{repository_id}', {
                installation_id: installationId,
                repository_id: repositoryId,
            });

            logging.info('GITHUB-REMOVE-REPO', `Successfully removed repository ${owner}/${repoName} (ID: ${repositoryId}) from installation ${installationId}`);
        } catch (apiError: any) {
            logging.error('GITHUB-REMOVE-REPO', `API call failed: ${apiError.message}`);
            logging.error('GITHUB-REMOVE-REPO', `API error status: ${apiError.status}, response: ${JSON.stringify(apiError.response?.data)}`);
            throw apiError;
        }
    } catch (error: any) {
        logging.error('GITHUB-REMOVE-REPO', `Full error details: ${error.message}`);
        logging.error('GITHUB-REMOVE-REPO', `Error stack: ${error.stack}`);

        if (error.status === 404) {
            logging.warn('GITHUB-REMOVE-REPO', `Repository ${owner}/${repoName} not found in installation ${installationId} - may already be removed`);
        } else if (error.status === 403) {
            logging.error('GITHUB-REMOVE-REPO', `Permission denied: GitHub App may not have permission to remove repository ${owner}/${repoName}. This requires 'Repository administration' permission.`);
            throw new Error(`GitHub App permission denied: ${error.message}`);
        } else {
            logging.error('GITHUB-REMOVE-REPO', `Failed to remove repository ${owner}/${repoName}: ${error.message}`);
            throw error;
        }
    }
};

const DeleteProject = async (req: Request, res: Response) => {
    const client = await db.connect();

    try {
        const { projectId, accessToken } = req.body;

        const errors = CustomRequestValidationResult(req);
        if (!errors.isEmpty()) {
            errors.array().forEach((error) => {
                logging.error('DELETE-PROJECT', error.errorMsg);
            });
            return res.status(401).json({ error: true, errors: errors.array() });
        }

        const userId = await getUserIdFromSessionToken(accessToken);
        if (!userId) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        await client.query('BEGIN');

        const projectResult = await client.query(
            `SELECT 
                p.id,
                p.github_installation_id,
                p.github_repository_id,
                p.github_repository_full_name
            FROM projects p
            WHERE p.id = $1`,
            [projectId],
        );

        if (projectResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: true,
                errmsg: 'Project not found',
            });
        }

        const project = projectResult.rows[0];

        // Get all active containers before deletion to cleanup Docker/Traefik
        const containersResult = await client.query(
            `SELECT container_id, container_name 
             FROM deployment_containers dc
             JOIN deployments d ON d.id = dc.deployment_id
             WHERE d.project_id = $1 AND dc.status IN ('running', 'healthy', 'starting')`,
            [projectId],
        );
        const activeContainers = containersResult.rows;

        if (activeContainers.length > 0) {
            logging.info('DELETE-PROJECT', `Found ${activeContainers.length} active containers for project ${projectId}, publishing cleanup message`);

            try {
                await rabbitmq.connect();
                const channel = await rabbitmq.getChannel();

                await channel.publish(
                    'obtura.deploys',
                    'project.cleanup',
                    Buffer.from(
                        JSON.stringify({
                            projectId: projectId,
                            containers: activeContainers.map((c) => ({
                                containerId: c.container_id,
                                containerName: c.container_name,
                            })),
                            timestamp: Date.now(),
                        }),
                    ),
                    { persistent: true, timestamp: Date.now() },
                );

                logging.info('DELETE-PROJECT', `Published cleanup message for ${activeContainers.length} containers`);

                // Wait a bit for cleanup to start
                await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (rabbitError: any) {
                logging.error('DELETE-PROJECT', `Failed to publish cleanup message: ${rabbitError.message}`);
                // Continue with deletion even if RabbitMQ fails
            }
        }

        // Handle GitHub App removal
        if (project.github_installation_id) {
            let owner: string | null = null;
            let repoName: string | null = null;
            let repoInfo: any = null;

            try {
                logging.info('DELETE-PROJECT', `GitHub installation found: ${project.github_installation_id}, repo_id: ${project.github_repository_id}, full_name: ${project.github_repository_full_name}`);

                // Get repository info from the installation's repositories array
                if (project.github_repository_id) {
                    const installQuery = await client.query('SELECT installation_id, repositories FROM github_installations WHERE installation_id = $1', [project.github_installation_id]);

                    if (installQuery.rows.length > 0) {
                        const repos = installQuery.rows[0].repositories || [];
                        repoInfo = repos.find((r: any) => r.id?.toString() === project.github_repository_id.toString());
                        if (repoInfo) {
                            // Try fullName first, then fall back to name
                            const fullName = repoInfo.fullName || repoInfo.full_name;
                            if (fullName) {
                                const parts = fullName.split('/');
                                owner = parts[0];
                                repoName = parts[1];
                            }
                            logging.info('DELETE-PROJECT', `Found repo info from installation data: ${owner}/${repoName}`);
                        }
                    }
                }

                // Fallback to stored full name
                if (!owner && project.github_repository_full_name) {
                    const parts = project.github_repository_full_name.split('/');
                    owner = parts[0];
                    repoName = parts[1];
                    logging.info('DELETE-PROJECT', `Using stored full name: ${owner}/${repoName}`);
                }

                // Try to remove from GitHub API if we have owner/repo
                if (owner && repoName && project.github_repository_id) {
                    logging.info('DELETE-PROJECT', `Removing GitHub app for ${owner}/${repoName} from installation ${project.github_installation_id}`);

                    try {
                        await removeRepositoryFromGitHubApp(project.github_installation_id, owner, repoName, project.github_repository_id);
                        logging.info('DELETE-PROJECT', `Successfully called GitHub API to remove repo`);
                    } catch (githubApiError: any) {
                        logging.error('DELETE-PROJECT', `GitHub API error: ${githubApiError.message}`);
                        // Continue with DB cleanup even if GitHub API fails
                    }
                } else {
                    logging.warn('DELETE-PROJECT', `Cannot remove from GitHub API - missing owner/repo name. Owner: ${owner}, Repo: ${repoName}, ID: ${project.github_repository_id}`);
                }

                // Always remove from DB if we have repository_id
                const repoId = project.github_repository_id;
                if (repoId && project.github_installation_id) {
                    logging.info('DELETE-PROJECT', `Removing repo ID ${repoId} from installation ${project.github_installation_id} in DB`);

                    const updateResult = await client.query(
                        `UPDATE github_installations 
                         SET repositories = COALESCE(
                             (SELECT jsonb_agg(repo)
                              FROM jsonb_array_elements(repositories) AS repo
                              WHERE (repo->>'id')::text != $1),
                             '[]'::jsonb
                         ),
                         updated_at = NOW()
                         WHERE installation_id = $2
                         RETURNING installation_id, repositories`,
                        [repoId.toString(), project.github_installation_id],
                    );

                    logging.info('DELETE-PROJECT', `DB update affected ${updateResult.rowCount} rows`);

                    // Verify the update
                    if (updateResult.rows.length > 0) {
                        const reposAfter = updateResult.rows[0].repositories || [];
                        logging.info('DELETE-PROJECT', `AFTER: Installation ${project.github_installation_id} has ${reposAfter.length} repos`);
                        if (reposAfter.length > 0) {
                            logging.info('DELETE-PROJECT', `Remaining repos: ${reposAfter.map((r: any) => r.fullName || r.name).join(', ')}`);
                        } else {
                            logging.info('DELETE-PROJECT', `No repos remaining in installation`);
                        }
                    }
                } else {
                    logging.warn('DELETE-PROJECT', `Missing repo_id (${repoId}) or installation_id (${project.github_installation_id}), skipping DB update`);
                }

                logging.info('DELETE-PROJECT', `Completed GitHub removal process`);
            } catch (githubError: any) {
                logging.error('DELETE-PROJECT', `Failed to remove GitHub integration: ${githubError.message}`);
                logging.error('DELETE-PROJECT', `Error stack: ${githubError.stack}`);
                // Don't fail the deletion if GitHub removal fails
            }
        } else {
            logging.info('DELETE-PROJECT', `No GitHub integration found for project ${projectId}`);
        }

        await client.query('DELETE FROM deployment_phase_transitions WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM canary_analysis_results WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM container_health_checks WHERE container_id IN (SELECT id FROM deployment_containers WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1))', [projectId]);
        await client.query('DELETE FROM container_metrics WHERE container_id IN (SELECT id FROM deployment_containers WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1))', [projectId]);
        await client.query('DELETE FROM deployment_containers WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM deployment_strategy_state WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM deployment_traffic_routing WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM deployment_metrics WHERE project_id = $1', [projectId]);
        await client.query('DELETE FROM deployment_alerts WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM deployment_resources WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM deployment_env_history WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM deployment_rollbacks WHERE from_deployment_id IN (SELECT id FROM deployments WHERE project_id = $1) OR to_deployment_id IN (SELECT id FROM deployments WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM deployment_approvals WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM deployment_events WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM deployment_logs WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM deployments WHERE project_id = $1', [projectId]);

        // await client.query('DELETE FROM build_usage WHERE build_id IN (SELECT id FROM builds WHERE project_id = $1)', [projectId]);
        await client.query('DELETE FROM builds WHERE project_id = $1', [projectId]);

        await client.query('DELETE FROM project_env_configs WHERE project_id = $1', [projectId]);
        await client.query('DELETE FROM project_settings WHERE project_id = $1', [projectId]);
        await client.query('DELETE FROM projects WHERE id = $1', [projectId]);

        await client.query('COMMIT');

        logging.info('DELETE-PROJECT', `Project ${projectId} deleted successfully by user ${userId}`);

        res.status(200).json({
            success: true,
            message: 'Project and all associated data deleted successfully',
        });
    } catch (error: any) {
        await client.query('ROLLBACK');
        logging.error('DELETE-PROJECT', `Failed to delete project: ${error.message}`);
        console.error('Delete project error:', error);
        res.status(500).json({
            error: true,
            errmsg: 'Failed to delete project',
        });
    } finally {
        client.release();
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

        const envVars: Record<string, string> = {};
        const lines = envFileContent.split('\n');

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
            vars: {
                service: serviceName,
                envVars: envVars,
            },
        });
    } catch (error) {
        console.error('Upload env config error:', error);
        res.status(500).json({ error: 'Failed to upload env configs' });
    }
};

const UpdateEnvVariables = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const { projectId, services } = req.body;

        for (const service of services) {
            const { service_name, env_vars } = service;

            const envContent = Object.entries(env_vars)
                .map(([key, value]) => {
                    const needsQuotes = /[\s#]/.test(value as string);
                    const escapedValue = needsQuotes ? `"${value}"` : value;
                    return `${key}=${escapedValue}`;
                })
                .join('\n');

            const serviceName = normalizeServiceName(service_name);
            const encryptedContent = encryptEnvContent(envContent);

            await db.query(
                `INSERT INTO project_env_configs (project_id, service_name, env_content, folder_location, updated_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (project_id, service_name)
                 DO UPDATE SET env_content = $3, updated_at = NOW()`,
                [projectId, serviceName, encryptedContent, service_name],
            );
        }

        return res.status(200).json({
            success: true,
            message: 'Environment variables updated successfully',
        });
    } catch (error) {
        console.error('Update env variables error:', error);
        res.status(500).json({ error: 'Failed to update environment variables' });
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
        const { accessToken, projectId, branch: requestedBranch, commitHash: requestedCommit } = req.body;

        const userID = await getUserIdFromSessionToken(accessToken);

        if (!userID) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const projectResult = await db.query(
            `SELECT p.*, gi.installation_id 
             FROM projects p
             LEFT JOIN github_installations gi ON gi.installation_id = p.github_installation_id
             WHERE p.id = $1`,
            [projectId],
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({
                error: true,
                errmsg: 'Project not found',
            });
        }

        const project = projectResult.rows[0];

        let branch = requestedBranch;
        let commitHash = requestedCommit;

        if (!branch) {
            const gitBranches = project.git_branches || [];
            const productionBranch = gitBranches.find((b: any) => b.type === 'production');

            if (!productionBranch || !productionBranch.branch) {
                return res.status(400).json({
                    error: true,
                    errmsg: 'No production branch configured for this project',
                });
            }
            branch = productionBranch.branch;
        }

        if (!project.installation_id || !project.git_repo_url) {
            return res.status(400).json({
                error: true,
                errmsg: 'GitHub integration not configured for this project',
            });
        }

        try {
            const token = await GetInstallationToken(project.installation_id);

            const repoMatch = project.git_repo_url.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);

            if (!repoMatch) {
                return res.status(400).json({
                    error: true,
                    errmsg: 'Invalid GitHub repository URL',
                });
            }

            const [, owner, repo] = repoMatch;

            const octokit = new Octokit({ auth: token });

            if (!commitHash) {
                const { data } = await octokit.rest.repos.getBranch({
                    owner,
                    repo,
                    branch: branch,
                });
                commitHash = data.commit.sha;
                console.log(`Fetched latest commit: ${commitHash} for branch ${branch}`);
            } else {
                console.log(`Using provided commit: ${commitHash} for branch ${branch}`);
            }
        } catch (githubError: any) {
            console.error('Error fetching commit from GitHub:', githubError);
            return res.status(500).json({
                error: true,
                errmsg: 'Failed to fetch commit from GitHub: ' + githubError.message,
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
                    deploy: false,
                }),
            ),
            { persistent: true, timestamp: Date.now() },
        );

        return res.status(200).json({
            buildId: buildId,
            commitHash: commitHash,
            branch: branch,
            status: 'queued',
        });
    } catch (error) {
        console.error('trigger build error:', error);
        res.status(500).json({ error: 'Failed to trigger build' });
    }
};

const TriggerDeploy = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const { accessToken, projectId, environment = 'production', strategy } = req.body;
        const buildId = req.query.buildId as string | undefined;

        const userID = await getUserIdFromSessionToken(accessToken);

        if (!userID) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const projectResult = await db.query(
            `SELECT p.*, gi.installation_id 
             FROM projects p
             LEFT JOIN github_installations gi ON gi.installation_id = p.github_installation_id
             WHERE p.id = $1`,
            [projectId],
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({
                error: true,
                errmsg: 'Project not found',
            });
        }

        const project = projectResult.rows[0];

        // If buildId is provided, skip build and trigger deployment directly
        if (buildId) {
            console.log(`Using existing build: ${buildId}`);

            // Fetch the existing build
            const existingBuildResult = await db.query(
                `SELECT id, project_id, image_tags, metadata, commit_hash, branch, status 
                 FROM builds 
                 WHERE id = $1 AND project_id = $2`,
                [buildId, projectId],
            );

            if (existingBuildResult.rows.length === 0) {
                return res.status(404).json({
                    error: true,
                    errmsg: 'Build not found or does not belong to this project',
                });
            }

            const existingBuild = existingBuildResult.rows[0];

            // Validate build is completed
            if (existingBuild.status !== 'completed') {
                return res.status(400).json({
                    error: true,
                    errmsg: `Build status is '${existingBuild.status}'. Only completed builds can be deployed.`,
                });
            }

            // Validate image tags exist
            if (!existingBuild.image_tags || existingBuild.image_tags.length === 0) {
                return res.status(400).json({
                    error: true,
                    errmsg: 'Build has no image tags. Cannot deploy.',
                });
            }
            let domain = null;
            let subdomain = null;

            if (environment === 'production') {
                // Production: projectslug.s3rbvn.org
                domain = `${project.slug}.s3rbvn.org`;
            } else if (environment === 'staging') {
                // Staging: projectslug-staging.s3rbvn.org
                subdomain = 'staging';
                domain = `${project.slug}-staging.s3rbvn.org`;
            } else if (environment === 'preview') {
                // Preview: projectslug-branchname.s3rbvn.org
                const branchSlug = (existingBuild?.branch || 'main')
                    .replace(/[^a-z0-9]/gi, '-')
                    .toLowerCase()
                    .substring(0, 30); // Limit length
                subdomain = branchSlug;
                domain = `${project.slug}-${branchSlug}.s3rbvn.org`;
            }
            const approvalRequired = environment === 'production';

            // Create deployment entry directly
            const deploymentInsert = await db.query(
                `INSERT INTO deployments (
                    project_id, 
                    build_id, 
                    environment, 
                    branch, 
                    commit_hash, 
                    commit_message, 
                    commit_author,
                    deployment_strategy,
                    domain,
                    subdomain,
                    deployed_by_user_id,
                    deployment_trigger,
                    approval_required,
                    status,
                    is_ephemeral,
                    preview_expires_at,
                    deployment_started_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
                RETURNING id`,
                [
                    projectId,
                    buildId,
                    environment,
                    existingBuild.branch,
                    existingBuild.commit_hash,
                    existingBuild.metadata?.commit_message || 'N/A',
                    existingBuild.metadata?.commit_author || 'Unknown',
                    strategy,
                    domain,
                    subdomain,
                    userID,
                    'manual',
                    approvalRequired,
                    'pending',
                    environment === 'preview',
                    environment === 'preview' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
                    new Date(),
                ],
            );

            const deploymentId = deploymentInsert.rows[0].id;

            await db.query(
                `INSERT INTO deployment_events (
                    deployment_id,
                    event_type,
                    event_message,
                    severity
                ) VALUES ($1, $2, $3, $4)`,
                [deploymentId, 'started', `Deployment triggered by user for ${environment} environment using existing build`, 'info'],
            );

            if (approvalRequired) {
                await db.query(
                    `INSERT INTO deployment_approvals (
                        deployment_id,
                        requested_by_user_id,
                        status
                    ) VALUES ($1, $2, $3)`,
                    [deploymentId, userID, 'pending'],
                );
            }

            await rabbitmq.connect();
            const channel = await rabbitmq.getChannel();

            await channel.publish(
                'obtura.deploys',
                'deploy.triggered',
                Buffer.from(
                    JSON.stringify({
                        buildId: buildId,
                        deploymentId: deploymentId,
                        projectId: projectId,
                        project: {
                            id: project.id,
                            slug: project.slug,
                            name: project.name,
                        },
                        build: {
                            id: existingBuild.id,
                            imageTags: existingBuild.image_tags,
                            branch: existingBuild.branch,
                            commitHash: existingBuild.commit_hash,
                            metadata: existingBuild.metadata,
                        },
                        deployment: {
                            id: deploymentId,
                            environment: environment,
                            strategy: strategy,
                            domain: domain,
                            subdomain: subdomain,
                        },
                    }),
                ),
                { persistent: true, timestamp: Date.now() },
            );

            console.log(`✅ Deployment ${deploymentId} triggered for existing build ${buildId}`);

            return res.status(200).json({
                buildId: buildId,
                deploymentId: deploymentId,
                commitHash: existingBuild.commit_hash,
                branch: existingBuild.branch,
                environment: environment,
                domain: domain,
                status: approvalRequired ? 'awaiting_approval' : 'queued',
                approvalRequired: approvalRequired,
                skippedBuild: true,
            });
        }

        // CI/CD workflow
        const gitBranches = project.git_branches || [];
        const targetBranch = gitBranches.find((b: any) => b.type === environment);

        if (!targetBranch || !targetBranch.branch) {
            return res.status(400).json({
                error: true,
                errmsg: `No ${environment} branch configured for this project`,
            });
        }

        const branch = targetBranch.branch;

        if (!project.installation_id || !project.git_repo_url) {
            return res.status(400).json({
                error: true,
                errmsg: 'GitHub integration not configured for this project',
            });
        }

        let commitHash: string;
        let commitMessage: string;
        let commitAuthor: string;

        try {
            const token = await GetInstallationToken(project.installation_id);

            const repoMatch = project.git_repo_url.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);

            if (!repoMatch) {
                return res.status(400).json({
                    error: true,
                    errmsg: 'Invalid GitHub repository URL',
                });
            }

            const [, owner, repo] = repoMatch;

            const octokit = new Octokit({ auth: token });
            const { data } = await octokit.rest.repos.getBranch({
                owner,
                repo,
                branch: branch,
            });

            commitHash = data.commit.sha;
            commitMessage = data.commit.commit.message;
            commitAuthor = data.commit.commit.author?.name || 'Unknown';

            console.log(`Fetched latest commit: ${commitHash} for branch ${branch}`);
        } catch (githubError: any) {
            console.error('Error fetching commit from GitHub:', githubError);
            return res.status(500).json({
                error: true,
                errmsg: 'Failed to fetch latest commit from GitHub: ' + githubError.message,
            });
        }

        const client = await db.connect();

        try {
            await client.query('BEGIN');

            const buildResult = await client.query('INSERT INTO builds (project_id, initiated_by_user_id, commit_hash, branch, status) VALUES ($1, $2, $3, $4, $5) RETURNING id', [projectId, userID, commitHash, branch, 'PENDING']);

            const newBuildId = buildResult.rows[0].id;

            let domain = null;
            let subdomain = null;

            if (environment === 'production') {
                domain = `${project.slug}.obtura.app`;
            } else if (environment === 'staging') {
                subdomain = 'staging';
                domain = `staging.${project.slug}.obtura.app`;
            } else if (environment === 'preview') {
                subdomain = branch.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
                domain = `${subdomain}.preview.${project.slug}.obtura.app`;
            }

            const approvalRequired = environment === 'production';

            const deploymentInsert = await client.query(
                `INSERT INTO deployments (
        project_id, 
        build_id, 
        environment, 
        branch, 
        commit_hash, 
        commit_message, 
        commit_author,
        deployment_strategy, 
        domain,
        subdomain,
        deployed_by_user_id,
        deployment_trigger,
        approval_required,
        status,
        is_ephemeral,
        preview_expires_at,
        deployment_started_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
    RETURNING id`,
                [
                    projectId,
                    newBuildId,
                    environment,
                    branch,
                    commitHash,
                    commitMessage,
                    commitAuthor,
                    strategy, // <- Add this parameter
                    domain,
                    subdomain,
                    userID,
                    'manual',
                    approvalRequired,
                    'pending',
                    environment === 'preview',
                    environment === 'preview' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
                    new Date(),
                ],
            );
            const deploymentId = deploymentInsert.rows[0].id;

            await client.query(
                `INSERT INTO deployment_events (
                    deployment_id,
                    event_type,
                    event_message,
                    severity
                ) VALUES ($1, $2, $3, $4)`,
                [deploymentId, 'started', `Deployment triggered by user for ${environment} environment`, 'info'],
            );

            if (approvalRequired) {
                await client.query(
                    `INSERT INTO deployment_approvals (
                        deployment_id,
                        requested_by_user_id,
                        status
                    ) VALUES ($1, $2, $3)`,
                    [deploymentId, userID, 'pending'],
                );
            }

            await client.query('COMMIT');

            // Publish to RabbitMQ for build service
            await rabbitmq.connect();
            const channel = await rabbitmq.getChannel();

            await channel.publish(
                'obtura.builds',
                'build.triggered',
                Buffer.from(
                    JSON.stringify({
                        buildId: newBuildId,
                        deploymentId: deploymentId,
                        projectId: projectId,
                        commitHash: commitHash,
                        branch: branch,
                        environment: environment,
                        approvalRequired: approvalRequired,
                        deploy: true,
                    }),
                ),
                { persistent: true, timestamp: Date.now() },
            );

            return res.status(200).json({
                buildId: newBuildId,
                deploymentId: deploymentId,

                commitHash: commitHash,
                branch: branch,
                environment: environment,
                domain: domain,
                status: approvalRequired ? 'awaiting_approval' : 'queued',
                approvalRequired: approvalRequired,
            });
        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('trigger deploy error:', error);
        res.status(500).json({ error: 'Failed to trigger deployment' });
    }
};

const DeleteBuild = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const { buildId } = req.params;

        console.log(buildId);

        await db.query('DELETE FROM builds WHERE id = $1', [buildId]);
        res.status(200).json({ success: true, message: 'Build deleted successfully' });
    } catch (error) {
        console.error('Delete build error:', error);
        res.status(500).json({ error: 'Failed to delete build' });
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
       WITH project_settings_data AS (
    SELECT 
        ps.project_id,
        json_build_object(
            'domains', COALESCE(ps.domains::jsonb, '[]'::jsonb),
            'cachingEnabled', ps.caching_enabled,
            'cacheTTL', ps.cache_ttl,
            'compressAssets', ps.compress_assets,
            'imageOptimization', ps.image_optimization,
            'cdnEnabled', ps.cdn_enabled,
            'httpsEnabled', ps.https_enabled,
            'httpsEnforce', ps.https_enforce,
            'httpsCertificateId', ps.https_certificate_id,
            'rateLimitingEnabled', ps.rate_limiting_enabled,
            'rateLimitingMaxRequests', ps.rate_limiting_max_requests,
            'rateLimitingWindowSeconds', ps.rate_limiting_window_seconds,
            'rateLimitingBurstLimit', ps.rate_limiting_burst_limit,
            'rateLimitingBurstPeriodSeconds', ps.rate_limiting_burst_period_seconds,
            'performHealthChecks', ps.perform_health_checks,
            'healthCheckUrl', ps.health_check_url,
            'buildCacheEnabled', ps.build_cache_enabled,
            'parallelBuilds', ps.parallel_builds,
            'buildOptimizationEnabled', ps.build_optimization_enabled,
            'failOnWarning', ps.fail_on_warning
        ) as settings
    FROM project_settings ps
    WHERE ps.project_id = $1
),
latest_deployments AS (
    SELECT DISTINCT ON (d.project_id, d.environment)
        d.id,
        d.project_id,
        d.environment,
        d.commit_hash,
        d.branch,
        d.status,
        d.deployment_strategy,
        d.replica_count,
        d.auto_scaling_enabled,
        d.instance_type,
        COALESCE(d.domain, CONCAT(d.subdomain, '.yourapp.com')) as deployment_url,
        d.created_at,
        d.deployment_completed_at as completed_at,
        d.build_id,
        d.deployed_by_user_id,
        d.deployment_trigger,
        d.traffic_percentage,
        d.current_requests_per_minute,
        d.avg_response_time_ms,
        d.error_rate_percentage,
        d.monitoring_enabled,
        d.ssl_enabled,
        b.build_time_seconds,
        b.metadata as build_metadata,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(d.deployment_completed_at, d.created_at))) as seconds_ago
    FROM deployments d
    LEFT JOIN builds b ON b.id = d.build_id
    WHERE d.status = 'active'
        AND d.project_id = $1
    ORDER BY d.project_id, d.environment, d.deployment_completed_at DESC NULLS LAST
),
deployment_containers_info AS (
    SELECT 
        dc.deployment_id,
        COUNT(*) as total_containers,
        COUNT(*) FILTER (WHERE dc.status = 'healthy') as healthy_containers,
        COUNT(*) FILTER (WHERE dc.status = 'unhealthy') as unhealthy_containers,
        COUNT(*) FILTER (WHERE dc.is_active = true) as active_containers,
        json_agg(
            json_build_object(
                'id', dc.id,
                'name', dc.container_name,
                'status', dc.status,
                'healthStatus', dc.health_status,
                'isActive', dc.is_active,
                'deploymentGroup', dc.deployment_group,
                'cpuUsage', dc.cpu_usage_percent,
                'memoryUsage', dc.memory_usage_mb,
                'memoryLimit', dc.memory_limit_mb,
                'startedAt', dc.started_at
            ) ORDER BY dc.created_at DESC
        ) as containers
    FROM deployment_containers dc
    WHERE dc.status IN ('running', 'healthy', 'unhealthy')
    GROUP BY dc.deployment_id
),
deployment_strategy_info AS (
    SELECT 
        dss.deployment_id,
        json_build_object(
            'strategy', dss.strategy,
            'currentPhase', dss.current_phase,
            'activeGroup', dss.active_group,
            'standbyGroup', dss.standby_group,
            'healthyReplicas', dss.healthy_replicas,
            'unhealthyReplicas', dss.unhealthy_replicas,
            'totalReplicas', dss.total_replicas,
            'canaryTrafficPercentage', dss.canary_traffic_percentage,
            'canaryAnalysisPassed', dss.canary_analysis_passed
        ) as strategy_details
    FROM deployment_strategy_state dss
),
deployment_alerts_info AS (
    SELECT 
        da.deployment_id,
        json_agg(
            json_build_object(
                'id', da.id,
                'type', da.alert_type,
                'severity', da.severity,
                'message', da.alert_message,
                'resolved', da.resolved,
                'timestamp', da.created_at
            ) ORDER BY da.created_at DESC
        ) FILTER (WHERE da.resolved = false) as unresolved_alerts,
        COUNT(*) FILTER (WHERE da.resolved = false) as unresolved_alert_count
    FROM deployment_alerts da
    GROUP BY da.deployment_id
),
project_alerts_info AS (
    SELECT 
        da.project_id,
        json_agg(
            json_build_object(
                'id', da.id,
                'type', da.alert_type,
                'severity', da.severity,
                'message', da.alert_message,
                'resolved', da.resolved,
                'timestamp', da.created_at
            ) ORDER BY da.created_at DESC
        ) FILTER (WHERE da.resolved = false AND da.deployment_id IS NULL) as project_only_alerts,
        COUNT(*) FILTER (WHERE da.resolved = false AND da.deployment_id IS NULL) as project_alert_count
    FROM deployment_alerts da
    WHERE da.project_id = $1
    GROUP BY da.project_id
),
preview_deployments AS (
    SELECT 
        COALESCE(d.domain, CONCAT(d.subdomain, '.yourapp.com')) as deployment_url,
        d.branch,
        d.commit_hash,
        d.status,
        d.replica_count,
        d.preview_expires_at,
        d.created_at,
        EXTRACT(EPOCH FROM (NOW() - d.created_at)) as seconds_ago
    FROM deployments d
    WHERE d.project_id = $1
        AND d.environment = 'preview'
        AND d.status = 'active'
    ORDER BY d.created_at DESC
    LIMIT 10
),
recent_builds AS (
    SELECT 
        b.id,
        b.commit_hash,
        b.branch,
        b.status,
        b.build_time_seconds,
        b.error_message,
        b.created_at,
        b.completed_at,
        u.name as initiated_by_name,
        u.email as initiated_by_email,
        EXTRACT(EPOCH FROM (NOW() - b.created_at)) as seconds_ago,
        CASE 
            WHEN b.metadata->>'frameworks' IS NOT NULL THEN
                (b.metadata->'frameworks'->0->>'Name')
            ELSE NULL
        END as framework
    FROM builds b
    LEFT JOIN users u ON u.id = b.initiated_by_user_id
    WHERE b.project_id = $1
    ORDER BY b.created_at DESC
    LIMIT 20
),
deployment_history AS (
    SELECT 
        d.id,
        d.environment,
        d.status,
        d.deployment_strategy,
        d.branch,
        d.commit_hash,
        d.deployment_trigger,
        d.deployment_started_at,
        d.deployment_completed_at,
        d.error_message,
        d.replica_count,
        d.traffic_percentage,
        d.build_id,
        b.status as build_status,
        COALESCE(d.domain, CONCAT(d.subdomain, '.yourapp.com')) as deployment_url,
        u.name as deployed_by_name,
        u.email as deployed_by_email,
        b.build_time_seconds,
        CASE 
            WHEN b.metadata->>'frameworks' IS NOT NULL THEN
                (b.metadata->'frameworks'->0->>'Name')
            ELSE NULL
        END as framework,
        EXTRACT(EPOCH FROM (NOW() - d.created_at)) as seconds_ago,
        -- Calculate deployment duration
        CASE 
            WHEN d.deployment_completed_at IS NOT NULL AND d.deployment_started_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (d.deployment_completed_at - d.deployment_started_at))::INTEGER
            ELSE NULL
        END as deployment_duration_seconds,
        -- Get strategy phase info
        dss.current_phase as strategy_phase,
        -- Count traffic switches (phase transitions to 'switching_traffic')
        (
            SELECT COUNT(*) 
            FROM deployment_phase_transitions dpt 
            WHERE dpt.deployment_id = d.id 
            AND dpt.to_phase = 'switching_traffic'
        ) as traffic_switch_count
    FROM deployments d
    LEFT JOIN users u ON u.id = d.deployed_by_user_id
    LEFT JOIN builds b ON b.id = d.build_id
    LEFT JOIN deployment_strategy_state dss ON dss.deployment_id = d.id
    WHERE d.project_id = $1
        AND d.status IN ('active', 'failed', 'rolled_back', 'terminated', 'pending', 'deploying')
    ORDER BY d.created_at DESC
    LIMIT 30
),
deployment_history_containers AS (
    SELECT 
        dc.deployment_id,
        json_agg(
            json_build_object(
                'id', dc.id,
                'name', dc.container_name,
                'status', dc.status,
                'healthStatus', dc.health_status,
                'isActive', dc.is_active,
                'deploymentGroup', dc.deployment_group,
                'cpuUsage', dc.cpu_usage_percent,
                'memoryUsage', dc.memory_usage_mb,
                'memoryLimit', dc.memory_limit_mb,
                'startedAt', dc.started_at
            ) ORDER BY dc.created_at DESC
        ) as containers
    FROM deployment_containers dc
    WHERE dc.status IN ('running', 'healthy', 'unhealthy')
    GROUP BY dc.deployment_id
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
    p.git_repo_url,
    t.name as team_name,
    -- Get all frameworks from latest build if monorepo
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
    
    -- Project Settings
    COALESCE(psd.settings, '{}'::json) as settings,
    
    -- Production deployment with enhanced info
    COALESCE(
        json_build_object(
            'url', prod.deployment_url,
            'status', prod.status,
            'deploymentStrategy', prod.deployment_strategy,
            'replicaCount', prod.replica_count,
            'autoScalingEnabled', prod.auto_scaling_enabled,
            'instanceType', prod.instance_type,
            'trafficPercentage', prod.traffic_percentage,
            'currentRequestsPerMinute', prod.current_requests_per_minute,
            'avgResponseTime', CONCAT(COALESCE(prod.avg_response_time_ms, 0), 'ms'),
            'errorRate', CONCAT(COALESCE(prod.error_rate_percentage, 0), '%'),
            'sslEnabled', prod.ssl_enabled,
            'monitoringEnabled', prod.monitoring_enabled,
            'deploymentTrigger', prod.deployment_trigger,
            'lastDeployment', CASE 
                WHEN prod.seconds_ago < 3600 THEN CONCAT(FLOOR(prod.seconds_ago / 60), ' minutes ago')
                WHEN prod.seconds_ago < 86400 THEN CONCAT(FLOOR(prod.seconds_ago / 3600), ' hours ago')
                ELSE CONCAT(FLOOR(prod.seconds_ago / 86400), ' days ago')
            END,
            'commitHash', prod.commit_hash,
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
            END,
            'containers', COALESCE(prod_containers.containers, '[]'::json),
            'totalContainers', COALESCE(prod_containers.total_containers, 0),
            'healthyContainers', COALESCE(prod_containers.healthy_containers, 0),
            'unhealthyContainers', COALESCE(prod_containers.unhealthy_containers, 0),
            'strategyDetails', prod_strategy.strategy_details,
            'unresolvedAlerts', COALESCE(prod_alerts.unresolved_alerts, '[]'::json),
            'unresolvedAlertCount', COALESCE(prod_alerts.unresolved_alert_count, 0)
        ),
        '{}'::json
    ) as production,
    
    -- Staging deployment with enhanced info
    COALESCE(
        json_build_object(
            'url', stg.deployment_url,
            'status', stg.status,
            'deploymentStrategy', stg.deployment_strategy,
            'replicaCount', stg.replica_count,
            'autoScalingEnabled', stg.auto_scaling_enabled,
            'instanceType', stg.instance_type,
            'trafficPercentage', stg.traffic_percentage,
            'currentRequestsPerMinute', stg.current_requests_per_minute,
            'avgResponseTime', CONCAT(COALESCE(stg.avg_response_time_ms, 0), 'ms'),
            'errorRate', CONCAT(COALESCE(stg.error_rate_percentage, 0), '%'),
            'sslEnabled', stg.ssl_enabled,
            'monitoringEnabled', stg.monitoring_enabled,
            'deploymentTrigger', stg.deployment_trigger,
            'lastDeployment', CASE 
                WHEN stg.seconds_ago < 3600 THEN CONCAT(FLOOR(stg.seconds_ago / 60), ' minutes ago')
                WHEN stg.seconds_ago < 86400 THEN CONCAT(FLOOR(stg.seconds_ago / 3600), ' hours ago')
                ELSE CONCAT(FLOOR(stg.seconds_ago / 86400), ' days ago')
            END,
            'commitHash', stg.commit_hash,
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
            END,
            'containers', COALESCE(stg_containers.containers, '[]'::json),
            'totalContainers', COALESCE(stg_containers.total_containers, 0),
            'healthyContainers', COALESCE(stg_containers.healthy_containers, 0),
            'unhealthyContainers', COALESCE(stg_containers.unhealthy_containers, 0),
            'strategyDetails', stg_strategy.strategy_details,
            'unresolvedAlerts', COALESCE(stg_alerts.unresolved_alerts, '[]'::json),
            'unresolvedAlertCount', COALESCE(stg_alerts.unresolved_alert_count, 0)
        ),
        '{}'::json
    ) as staging,
    
    -- Preview deployments with enhanced info
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'url', pd.deployment_url,
                    'branch', pd.branch,
                    'commitHash', pd.commit_hash,
                    'status', pd.status,
                    'replicaCount', pd.replica_count,
                    'expiresAt', pd.preview_expires_at,
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
    
    -- Builds
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', rb.id,
                    'commitHash', rb.commit_hash,
                    'branch', rb.branch,
                    'status', rb.status,
                    'buildTime', CASE 
                        WHEN rb.build_time_seconds IS NOT NULL 
                        THEN CONCAT(FLOOR(rb.build_time_seconds / 60), 'm ', rb.build_time_seconds % 60, 's')
                        ELSE NULL
                    END,
                    'framework', rb.framework,
                    'initiatedBy', CASE 
                        WHEN rb.initiated_by_name IS NOT NULL 
                        THEN rb.initiated_by_name
                        ELSE rb.initiated_by_email
                    END,
                    'createdAt', CASE 
                        WHEN rb.seconds_ago < 3600 THEN CONCAT(FLOOR(rb.seconds_ago / 60), ' minutes ago')
                        WHEN rb.seconds_ago < 86400 THEN CONCAT(FLOOR(rb.seconds_ago / 3600), ' hours ago')
                        ELSE CONCAT(FLOOR(rb.seconds_ago / 86400), ' days ago')
                    END,
                    'errorMessage', rb.error_message
                )
            )
            FROM recent_builds rb
        ),
        '[]'::json
    ) as builds,
    
    -- Deployment History (NEW)
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', dh.id,
                    'environment', dh.environment,
                    'status', dh.status,
                    'deploymentStrategy', dh.deployment_strategy,
                    'branch', dh.branch,
                    'commitHash', dh.commit_hash,
                    'deploymentUrl', dh.deployment_url,
                    'deploymentTrigger', dh.deployment_trigger,
                    'trafficPercentage', dh.traffic_percentage,
                    'replicaCount', dh.replica_count,
                    'framework', dh.framework,
                    'deployedBy', CASE 
                        WHEN dh.deployed_by_name IS NOT NULL 
                        THEN dh.deployed_by_name
                        ELSE dh.deployed_by_email
                    END,
                    'startedAt', CASE 
                        WHEN dh.seconds_ago < 3600 THEN CONCAT(FLOOR(dh.seconds_ago / 60), ' minutes ago')
                        WHEN dh.seconds_ago < 86400 THEN CONCAT(FLOOR(dh.seconds_ago / 3600), ' hours ago')
                        ELSE CONCAT(FLOOR(dh.seconds_ago / 86400), ' days ago')
                    END,
                    'completedAt', dh.deployment_completed_at,
                    'duration', CASE 
                        WHEN dh.deployment_duration_seconds IS NOT NULL 
                        THEN CONCAT(FLOOR(dh.deployment_duration_seconds / 60), 'm ', dh.deployment_duration_seconds % 60, 's')
                        ELSE NULL
                    END,
                    'buildTime', CASE 
                        WHEN dh.build_time_seconds IS NOT NULL 
                        THEN CONCAT(FLOOR(dh.build_time_seconds / 60), 'm ', dh.build_time_seconds % 60, 's')
                        ELSE NULL
                    END,
                    'strategyPhase', dh.strategy_phase,
                    'trafficSwitchCount', dh.traffic_switch_count,
                    'errorMessage', dh.error_message,
                    'buildId', dh.build_id,
                    'buildStatus', dh.build_status,
                    'containers', COALESCE(dhc.containers, '[]'::json)
                )
                ORDER BY dh.deployment_started_at DESC
            )
            FROM deployment_history dh
            LEFT JOIN deployment_history_containers dhc ON dhc.deployment_id = dh.id
        ),
        '[]'::json
    ) as deployments,
    
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
LEFT JOIN project_settings_data psd ON psd.project_id = p.id
LEFT JOIN latest_deployments prod ON prod.project_id = p.id AND prod.environment = 'production'
LEFT JOIN latest_deployments stg ON stg.project_id = p.id AND stg.environment = 'staging'
LEFT JOIN deployment_containers_info prod_containers ON prod_containers.deployment_id = prod.id
LEFT JOIN deployment_containers_info stg_containers ON stg_containers.deployment_id = stg.id
LEFT JOIN deployment_strategy_info prod_strategy ON prod_strategy.deployment_id = prod.id
LEFT JOIN deployment_strategy_info stg_strategy ON stg_strategy.deployment_id = stg.id
LEFT JOIN deployment_alerts_info prod_alerts ON prod_alerts.deployment_id = prod.id
LEFT JOIN deployment_alerts_info stg_alerts ON stg_alerts.deployment_id = stg.id
LEFT JOIN project_alerts_info proj_alerts ON proj_alerts.project_id = p.id
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
                settings: project.settings,
                production: project.production,
                gitRepoUrl: project.git_repo_url,
                builds: project.builds || [],
                deployments: project.deployments || [],
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

const DeleteDeployment = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const { deploymentId } = req.params;
        const { projectId } = req.body;

        const deploymentCheck = await db.query(
            `SELECT d.id, d.project_id, dc.container_id 
             FROM deployments d 
             LEFT JOIN deployment_containers dc ON dc.deployment_id = d.id 
             WHERE d.id = $1`,
            [deploymentId],
        );

        if (deploymentCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Deployment not found' });
        }

        if (deploymentCheck.rows[0].project_id !== projectId) {
            return res.status(403).json({ error: 'Deployment does not belong to this project' });
        }

        const deployServiceUrl = process.env.DEPLOY_SERVICE_URL;

        const containerIds = deploymentCheck.rows.filter((row) => row.container_id).map((row) => row.container_id);

        if (containerIds.length > 0) {
            try {
                await axios.post(`${deployServiceUrl}/api/deployments/${deploymentId}/containers/stop`, {
                    containerIds,
                });
            } catch (err) {
                console.error('Failed to stop containers:', err);
            }
        }

        await db.query('DELETE FROM deployment_strategy_state WHERE deployment_id = $1', [deploymentId]);
        await db.query('DELETE FROM deployment_events WHERE deployment_id = $1', [deploymentId]);
        await db.query('DELETE FROM container_health_checks WHERE deployment_id = $1', [deploymentId]);
        await db.query('DELETE FROM deployment_containers WHERE deployment_id = $1', [deploymentId]);
        await db.query('DELETE FROM deployments WHERE id = $1', [deploymentId]);

        res.status(200).json({ success: true, message: 'Deployment deleted successfully' });
    } catch (error) {
        console.error('Delete deployment error:', error);
        res.status(500).json({ error: 'Failed to delete deployment' });
    }
};

export default {
    RegisterUserWithGoogle,
    GetProjects,
    UpdateProjectSettings,
    DeleteProject,
    GetProjectDetails,
    TriggerBuild,
    TriggerDeploy,
    DeleteBuild,
    DeleteDeployment,
    GetEnvConfigs,
    UploadEnvConfig,
    UpdateEnvVariables,
    CreateProject,
};
