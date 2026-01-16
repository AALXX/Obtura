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
    '/company-init',
    [
        body('companyName').notEmpty().withMessage('Company name is required'),
        body('companySize').notEmpty().withMessage('Company size is required'),
        body('accessToken').notEmpty().withMessage('Access token is required'),
        body('industry').notEmpty().withMessage('Industry is required'),
        body('userRole').notEmpty().withMessage('User role is required'),
        body('billingEmail').notEmpty().withMessage('User role is required'),
        body('vatNumber').notEmpty().withMessage('VAT number is required'),
        body('addressLine1').notEmpty().withMessage('Address line 1 is required'),
        body('city').notEmpty().withMessage('City is required'),
        body('country').notEmpty().withMessage('Country is required'),
        body('dataRegion').notEmpty().withMessage('Data region is required'),
        body('dpaSigned').isBoolean().withMessage('DPA signed is required'),
    ],
    CompanyServices.CompanyInit,
);

router.get('/search-users/:accessToken/:searchTerm', param('searchTerm').not().isEmpty(), param('accessToken').not().isEmpty(), CompanyServices.SearchUsers);

router.post('/invite-employees', body('accessToken').notEmpty().isString(), body('invitations').notEmpty().isArray({ min: 1 }), rbac.authenticate, rbac.loadCompanyEmployee, rbac.requirePermission(PermissionResource.MEMBERS, PermissionAction.INVITE), CompanyServices.InviteUser);

router.post('/accept-invitation', body('accessToken').notEmpty().isString(), body('companyId').notEmpty().isString(), rbac.authenticate, CompanyServices.AcceptInvitation);

router.get('/get-employees/:accessToken', param('accessToken').not().isEmpty().withMessage('Access token is required'), rbac.authenticate, rbac.loadCompanyEmployee, rbac.requirePermission(PermissionResource.MEMBERS, PermissionAction.READ), CompanyServices.GetEmployees);

export default router;
