import express from 'express';
import { body, param, query } from 'express-validator';

import ProjectsServices from '../Services/ProjectServices';
import { createRBACMiddleware } from '../middlewares/RBACSystem';
import pool from '../config/postgresql';
import { PermissionAction, PermissionResource } from '../middlewares/RBACTypes';
import multer from 'multer';

const router = express.Router();

const rbac = createRBACMiddleware(pool);
const storage = multer.memoryStorage();

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.originalname === '.env' || file.originalname.startsWith('.env.')) {
        cb(null, true);
    } else {
        cb(new Error('Only .env files are allowed'));
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1024 * 1024 * 10, // 10MB
    },
});

router.post(
    '/create-project',
    body('accessToken').not().isEmpty().withMessage('Access token is required'),
    body('name').not().isEmpty().withMessage('Project name is required'),
    body('teamId').not().isEmpty().withMessage('Team ID is required'),
    body('gitRepoUrl').not().isEmpty().withMessage('Git repository URL is required'),
    body('productionBranch').optional(),
    body('stagingBranch').optional(),
    body('developmentBranch').optional(),
    body('createDeploymentNow').optional().isBoolean(),
    body('autoDeployProduction').not().isEmpty().withMessage('Auto deploy production is required'),
    body('autoDeployStaging').optional().isBoolean(),
    body('autoDeployDevelopment').optional().isBoolean(),
    body('githubInstallationId').optional().isInt(),
    body('githubRepositoryId').optional(),
    body('githubRepositoryFullName').optional(),
    rbac.authenticate,
    rbac.loadCompanyEmployee,
    rbac.requirePermission(PermissionResource.PROJECT, PermissionAction.CREATE),
    ProjectsServices.CreateProject,
);

router.get('/get-projects/:accessToken', param('accessToken').not().isEmpty(), rbac.authenticate, rbac.loadCompanyEmployee, rbac.requirePermission(PermissionResource.PROJECT, PermissionAction.READ), ProjectsServices.GetProjects);
router.put(
    '/update-settings',
    body('accessToken').not().isEmpty().withMessage('Access token is required'),
    body('projectId').not().isEmpty().withMessage('Project ID is required'),
    body('domains').optional(),
    body('caching').not().isEmpty().withMessage('Caching is required'),
    body('cacheTTL').optional(),
    body('compressAssets').not().isEmpty().withMessage('Compress assets is required'),
    body('cdnEnabled').not().isEmpty().withMessage('CDN is required'),
    body('httpsEnabled').not().isEmpty().withMessage('HTTPS is required'),
    body('httpsCertificate').optional(),
    body('rateLimit').not().isEmpty().withMessage('Rate limit is required'),
    body('rateLimitMaxRequests').not().isEmpty().withMessage('Rate limit max requests is required'),
    body('rateLimitWindow').not().isEmpty().withMessage('Rate limit window is required'),
    body('rateLimitBurst').not().isEmpty().withMessage('Rate limit burst is required'),
    body('rateLimitBurstPeriod').not().isEmpty().withMessage('Rate limit burst period is required'),
    body('performHealthChecks').not().isEmpty().withMessage('Perform health checks is required'),
    body('healthCheckUrl').optional(),
    body('buildCacheEnabled').not().isEmpty().withMessage('Build cache is required'),
    body('parallelBuilds').not().isEmpty().withMessage('Parallel builds is required'),
    body('buildOptimization').not().isEmpty().withMessage('Build optimization is required'),
    body('failOnWarnings').not().isEmpty().withMessage('Fail on warnings is required'),
    rbac.authenticate,
    rbac.loadCompanyEmployee,
    rbac.requirePermission(PermissionResource.PROJECT, PermissionAction.UPDATE),
    ProjectsServices.UpdateProjectSettings,
);

router.delete('/delete-project', body('accessToken').not().isEmpty(), body('projectId').not().isEmpty(), rbac.authenticate, rbac.loadCompanyEmployee, rbac.requirePermission(PermissionResource.PROJECT, PermissionAction.DELETE), ProjectsServices.DeleteProject);

router.post('/env-config', upload.single('envFile'), body('projectId').not().isEmpty(), body('envLocation').not().isEmpty(), body('accessToken').not().isEmpty(), ProjectsServices.UploadEnvConfig);

router.put('/update-env-config', body('projectId').not().isEmpty(), body('services'), body('accessToken').not().isEmpty(), ProjectsServices.UpdateEnvVariables);

router.post('/trigger-build', body('projectId').not().isEmpty(), body('branch').optional(), body('commitHash').optional(), body('accessToken').not().isEmpty(), ProjectsServices.TriggerBuild);
router.delete('/delete-build/:buildId', body('projectId').not().isEmpty(), body('accessToken').not().isEmpty(), ProjectsServices.DeleteBuild);
router.delete('/delete-deployment/:deploymentId', body('projectId').not().isEmpty(), body('accessToken').not().isEmpty(), ProjectsServices.DeleteDeployment);

router.post(
    '/trigger-deploy',
    body('projectId').not().isEmpty(),
    body('branch').not(),
    body('accessToken').not().isEmpty(),
    query('buildId').optional(),
    body('environment').optional(),
    body('strategy').optional().isIn(['blue_green', 'rolling', 'canary']).withMessage('Invalid deployment strategy'),
    ProjectsServices.TriggerDeploy,
);

router.get('/get-project-details/:projectId/:accessToken', param('projectId').not().isEmpty(), param('accessToken').not().isEmpty(), ProjectsServices.GetProjectDetails);

router.get('/get-project-environment-variables/:projectId/:accessToken', param('projectId').not().isEmpty(), param('accessToken').not().isEmpty(), ProjectsServices.GetEnvConfigs);

export default router;
