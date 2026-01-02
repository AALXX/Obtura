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
    body('productionBranch'),
    body('stagingBranch'),
    body('developmentBranch'),
    body('createDeploymentNow').not().isEmpty().withMessage('Create deployment now is required'),
    body('autoDeployProduction').not().isEmpty().withMessage('Auto deploy production is required'),
    body('autoDeployStaging').not().isEmpty().withMessage('Auto deploy staging is required'),
    body('autoDeployDevelopment').not().isEmpty().withMessage('Auto deploy development is required'),
    body('accessToken').not().isEmpty(),
    rbac.authenticate,
    rbac.loadCompanyEmployee,
    rbac.requirePermission(PermissionResource.PROJECT, PermissionAction.CREATE),
    ProjectsServices.CreateProject,
);

router.get('/get-projects/:accessToken', param('accessToken').not().isEmpty(), rbac.authenticate, rbac.loadCompanyEmployee, rbac.requirePermission(PermissionResource.PROJECT, PermissionAction.READ), ProjectsServices.GetProjects);
router.put('/update-project', body('accessToken').not().isEmpty(), body('projectId').not().isEmpty(), body('projectName').not().isEmpty(), ProjectsServices.RegisterUserWithGoogle);

router.delete('/delete-project', body('accessToken').not().isEmpty(), body('projectId').not().isEmpty(), ProjectsServices.RegisterUserWithGoogle);

router.post('/env-config', upload.single('envFile'), body('projectId').not().isEmpty(), body('envLocation').not().isEmpty(), body('accessToken').not().isEmpty(), ProjectsServices.UploadEnvConfig);

router.post('/trigger-build', body('projectId').not().isEmpty(), body('commitHash').not().isEmpty(), body('branch').not().isEmpty(), body('accessToken').not().isEmpty(), ProjectsServices.TriggerBuild);

router.get('/get-project-details/:projectId/:accessToken', param('projectId').not().isEmpty(), param('accessToken').not().isEmpty(), ProjectsServices.GetProjectDetails);

router.get('/get-project-environment-variables/:projectId/:accessToken', param('projectId').not().isEmpty(), param('accessToken').not().isEmpty(), ProjectsServices.GetEnvConfigs);

export = router;
