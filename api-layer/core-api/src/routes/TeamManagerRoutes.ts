// TeamManagerRoutes.ts
import express from 'express';
import { body, param } from 'express-validator';

import TeamServices from '../Services/TeamServices';
import { createRBACMiddleware } from '../middlewares/RBACSystem';
import { PermissionResource, PermissionAction, TeamRole } from '../middlewares/RBACTypes';
import pool from '../config/postgresql';

const router = express.Router();
const rbac = createRBACMiddleware(pool);

// Public routes
router.post(
    '/create-team',
    body('accessToken').notEmpty().isString(),
    body('teamName').notEmpty().isString().trim().isLength({ min: 2, max: 100 }),
    body('teamDescription').optional().isString().trim().isLength({ max: 500 }),
    rbac.authenticate,
    rbac.loadTeamMember,
    rbac.requirePermission(PermissionResource.TEAM, PermissionAction.CREATE),
    TeamServices.CreateTeam,
);

router.get('/get-teams/:accessToken', param('accessToken').notEmpty().isString(), rbac.authenticate, TeamServices.GetTeams);

router.post('/accept-invitation', body('accessToken').notEmpty().isString(), body('teamId').notEmpty().isString(), rbac.authenticate, TeamServices.AcceptInvitation);

// Protected routes
router.get(
    '/get-team-data/:accessToken/:teamId',
    param('accessToken').notEmpty().isString(),
    param('teamId').notEmpty().isString(),
    rbac.authenticate,
    rbac.loadTeamMember,
    rbac.requirePermission(PermissionResource.TEAM, PermissionAction.READ),
    TeamServices.GetTeamData,
);

router.put(
    '/update-team',
    body('accessToken').notEmpty().isString(),
    body('teamId').notEmpty().isString(),
    body('teamName').notEmpty().isString().trim().isLength({ min: 2, max: 100 }),
    body('teamDescription').optional().isString().trim().isLength({ max: 500 }),
    rbac.authenticate,
    rbac.loadTeamMember,
    rbac.requirePermission(PermissionResource.TEAM, PermissionAction.UPDATE),
    TeamServices.UpdateTeam,
);

router.delete(
    '/delete-team',
    body('accessToken').notEmpty().isString(),
    body('teamId').notEmpty().isString(),
    rbac.authenticate,
    rbac.loadTeamMember,
    rbac.requirePermission(PermissionResource.TEAM, PermissionAction.DELETE),
    TeamServices.DeleteTeam,
);

router.post(
    '/invite-members',
    body('accessToken').notEmpty().isString(),
    body('teamId').notEmpty().isString(),
    body('invitations').notEmpty().isArray({ min: 1 }),
    rbac.authenticate,
    rbac.loadTeamMember,
    rbac.requirePermission(PermissionResource.MEMBERS, PermissionAction.INVITE),
    TeamServices.InviteUser,
);

router.post(
    '/promote-member',
    body('accessToken').notEmpty().isString(),
    body('teamId').notEmpty().isString(),
    body('userId').notEmpty().isString(),
    body('role').notEmpty().isIn(Object.values(TeamRole)),
    rbac.authenticate,
    rbac.loadTeamMember,
    rbac.requirePermission(PermissionResource.MEMBERS, PermissionAction.PROMOTE),
    rbac.canManageUser,
    TeamServices.PromoteMember,
);

router.delete(
    '/remove-member',
    body('accessToken').notEmpty().isString(),
    body('teamId').notEmpty().isString(),
    body('userId').notEmpty().isString(),
    rbac.authenticate,
    rbac.loadTeamMember,
    rbac.requirePermission(PermissionResource.MEMBERS, PermissionAction.REMOVE),
    rbac.canManageUser,
    TeamServices.RemoveMember,
);

export = router;
