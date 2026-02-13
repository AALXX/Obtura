import express from 'express';
import { param, query } from 'express-validator';
import GitHubService from '../Services/GitHubService';
import { createRBACMiddleware } from '../middlewares/RBACSystem';
import pool from '../config/postgresql';

const router = express.Router();
const rbac = createRBACMiddleware(pool);

router.get('/installation-url/:accessToken', param('accessToken').not().isEmpty(), rbac.authenticate, GitHubService.GetInstallationURL);

router.get('/installation/callback', query('installationId').not().isEmpty(), query('setupAction').not().isEmpty(), query('state').not().isEmpty(), GitHubService.HandleInstallationCallback);

router.get('/installations/:accessToken', param('accessToken').not().isEmpty(), rbac.authenticate, GitHubService.GetUserInstallations);

router.post('/webhook', GitHubService.HandleWebhook);

router.get('/repository-branches/:accessToken/:repo/:owner/:installationId', param('accessToken').not().isEmpty(), param('repo').not().isEmpty(), param('installationId').not().isEmpty(), param('owner').not().isEmpty(), GitHubService.GetRepositoryBranches);

router.get('/repository-commits/:accessToken/:repo/:owner/:installationId/:branch', param('accessToken').not().isEmpty(), param('repo').not().isEmpty(), param('installationId').not().isEmpty(), param('owner').not().isEmpty(), param('branch').not().isEmpty(), GitHubService.GetRepositoryCommits);

router.get('/project-token/:projectId', param('projectId').not().isEmpty(), GitHubService.GetProjectGitHubToken);

export default router;
