import express from 'express';
import { body, param } from 'express-validator';

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
router.put('/update-project', body('accessToken').not().isEmpty(), body('projectId').not().isEmpty(), body('projectName').not().isEmpty(), ProjectsServices.RegisterUserWithGoogle);

router.delete('/delete-project', body('accessToken').not().isEmpty(), body('projectId').not().isEmpty(), ProjectsServices.RegisterUserWithGoogle);

router.post('/env-config', upload.single('envFile'), body('projectId').not().isEmpty(), body('envLocation').not().isEmpty(), body('accessToken').not().isEmpty(), ProjectsServices.UploadEnvConfig);

router.put('/update-env-config', body('projectId').not().isEmpty(), body('services'), body('accessToken').not().isEmpty(), ProjectsServices.UpdateEnvVariables);

router.post('/trigger-build', body('projectId').not().isEmpty(), body('branch').not(), body('accessToken').not().isEmpty(), ProjectsServices.TriggerBuild);
router.post('/trigger-deploy', body('projectId').not().isEmpty(), body('branch').not(), body('accessToken').not().isEmpty(), ProjectsServices.TriggerDeploy);

router.delete('/delete-build/:buildId', body('projectId').not().isEmpty(), body('accessToken').not().isEmpty(), ProjectsServices.DeleteBuild);

router.get('/get-project-details/:projectId/:accessToken', param('projectId').not().isEmpty(), param('accessToken').not().isEmpty(), ProjectsServices.GetProjectDetails);

router.get('/get-project-environment-variables/:projectId/:accessToken', param('projectId').not().isEmpty(), param('accessToken').not().isEmpty(), ProjectsServices.GetEnvConfigs);

export default router;
