import express from 'express';
import { body, param } from 'express-validator';

import CompanyServices from '../Services/CompanyServices';
import { createRBACMiddleware } from '../middlewares/RBACSystem';
import pool from '../config/postgresql';
import { PermissionAction, PermissionResource } from '../middlewares/RBACTypes';

const router = express.Router();
const rbac = createRBACMiddleware(pool);

router.get('/check-company-status/:accessToken', body('accessToken').not().isEmpty(), CompanyServices.CheckCompanyStatus);

router.post(
    '/complete-company-setup',
    [
        body('companyName').notEmpty().withMessage('Company name is required'),
        body('companySize').notEmpty().withMessage('Company size is required'),
        body('accessToken').notEmpty().withMessage('Access token is required'),
        body('userRole').notEmpty().withMessage('User role is required'),
        body('subscriptionPlan').optional().isIn(['starter', 'professional', 'business', 'enterprise']).withMessage('Invalid subscription plan'),
    ],
    CompanyServices.CompleteCompanySetup,
);

router.get(
    '/get-employees/:accessToken',
    param('accessToken').not().isEmpty().withMessage('Access token is required'),
    // rbac.authenticate,
    // rbac.loadTeamMember,
    // rbac.requirePermission(PermissionResource.TEAM, PermissionAction.READ),
    CompanyServices.GetEmployees,
);

export = router;
