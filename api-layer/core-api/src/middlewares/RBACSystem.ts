// RBACMiddleware.ts
import { type Request, type Response, type NextFunction } from 'express';
import { Pool } from 'pg';
import { PermissionResource, PermissionAction, TeamRole } from './RBACTypes';

export interface User {
    id: string;
    email: string;
    name: string;
}

export interface CompanyEmployee {
    userId: string;
    companyId: string;
    role: TeamRole;
    roleId: string;
    permissions: Set<string>;
}

export interface AuthenticatedRequest extends Request {
    accessToken?: string;
    user?: User;
    companyEmployee?: CompanyEmployee;
}

const permissionCache = new Map<string, { permissions: Set<string>; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export const createRBACMiddleware = (pool: Pool) => {
    const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            const accessToken = req.body?.accessToken || req.params?.accessToken;
            if (!accessToken) {
                return res.status(401).json({ message: 'Access token required' });
            }

            const result = await pool.query(
                `SELECT u.id, u.email, u.name 
                FROM sessions s 
                JOIN users u ON u.id = s.user_id 
                WHERE s.access_token = $1 AND s.expires_at > NOW() AND u.status = 'active'`,
                [accessToken],
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'Invalid or expired token' });
            }

            req.user = result.rows[0];
            await pool.query('UPDATE sessions SET last_used_at = NOW() WHERE access_token = $1', [accessToken]);
            next();
        } catch (error) {
            console.error('Authentication error:', error);
            res.status(500).json({ message: 'Authentication failed' });
        }
    };

    const loadCompanyEmployee = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                return res.status(401).json({ message: 'Not authenticated' });
            }

            const getUsersCompany = await pool.query(
                `
                SELECT cu.company_id as companyId
                FROM company_users cu
                WHERE cu.user_id = $1
                LIMIT 1
            `,
                [req.user.id],
            );

            const companyId = getUsersCompany.rows[0].companyid;
            if (!companyId) {
                return res.status(400).json({ message: 'Company ID required' });
            }

            const cacheKey = `${req.user.id}:${companyId}`;
            const cached = permissionCache.get(cacheKey);
            if (cached && cached.expiry > Date.now()) {
                req.companyEmployee = {
                    userId: req.user.id,
                    companyId,
                    role: '' as TeamRole,
                    roleId: '',
                    permissions: cached.permissions,
                };
                return next();
            }

            const result = await pool.query(
                `SELECT 
                    cu.user_id,
                    cu.company_id,
                    cu.role as role_id,
                    r.name as role_name,
                    COALESCE(
                        json_agg(DISTINCT jsonb_build_object('resource', p.resource, 'action', p.action)) 
                        FILTER (WHERE p.id IS NOT NULL), 
                        '[]'
                    ) as role_permissions
                FROM company_users cu
                JOIN roles r ON r.id = cu.role
                LEFT JOIN role_permissions rp ON rp.role_name = r.name
                LEFT JOIN permissions p ON p.id = rp.permission_id
                WHERE cu.user_id = $1 AND cu.company_id = $2
                GROUP BY cu.user_id, cu.company_id, cu.role, r.name`,
                [req.user.id, companyId],
            );

            if (result.rows.length === 0) {
                return res.status(403).json({ message: 'Not a company employee' });
            }

            const row = result.rows[0];
            const permissions = new Set<string>();

            row.role_permissions.forEach((p: any) => {
                permissions.add(`${p.resource}:${p.action}`);
            });

            permissionCache.set(cacheKey, { permissions, expiry: Date.now() + CACHE_TTL });
            req.companyEmployee = {
                userId: row.user_id,
                companyId: row.company_id,
                role: row.role_name as TeamRole,
                roleId: row.role_id,
                permissions,
            };
            next();
        } catch (error) {
            console.error('Load company employee error:', error);
            res.status(500).json({ message: 'Failed to load company employee' });
        }
    };

    const requirePermission = (resource: PermissionResource, action: PermissionAction) => {
        return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            if (!req.companyEmployee) {
                return res.status(403).json({ message: 'No company context' });
            }

            const key = `${resource}:${action}`;
            if (!req.companyEmployee.permissions.has(key)) {
                return res.status(403).json({
                    message: 'Insufficient permissions',
                    required: { resource, action },
                });
            }
            next();
        };
    };

    const canManageUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user || !req.companyEmployee) {
                return res.status(401).json({ message: 'Not authenticated' });
            }

            const targetUserId = req.body?.userId || req.params?.userId;
            if (!targetUserId) {
                return res.status(400).json({ message: 'User ID required' });
            }

            const result = await pool.query(
                `SELECT 
                    r1.hierarchy_level as actor_level, 
                    r2.hierarchy_level as target_level
                FROM company_users cu1
                JOIN roles r1 ON r1.id = cu1.role
                CROSS JOIN company_users cu2 
                JOIN roles r2 ON r2.id = cu2.role
                WHERE cu1.user_id = $1 
                    AND cu1.company_id = $2 
                    AND cu2.user_id = $3 
                    AND cu2.company_id = $2`,
                [req.user.id, req.companyEmployee.companyId, targetUserId],
            );

            if (result.rows.length === 0) {
                return res.status(403).json({ message: 'Target user not found in company' });
            }

            const { actorLevel, targetLevel } = result.rows[0];

            if (actorLevel >= targetLevel) {
                return res.status(403).json({
                    message: 'Cannot manage users with equal or higher privilege',
                });
            }

            next();
        } catch (error) {
            console.error('Can manage user check error:', error);
            res.status(500).json({ message: 'Permission check failed' });
        }
    };

    const isCompanyOwner = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user || !req.companyEmployee) {
                return res.status(401).json({ message: 'Not authenticated' });
            }

            const result = await pool.query(
                `SELECT owner_user_id 
                FROM companies 
                WHERE id = $1`,
                [req.companyEmployee.companyId],
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Company not found' });
            }

            if (result.rows[0].owner_user_id !== req.user.id) {
                return res.status(403).json({ message: 'Only company owner can perform this action' });
            }

            next();
        } catch (error) {
            console.error('Owner check error:', error);
            res.status(500).json({ message: 'Owner check failed' });
        }
    };

    const clearCache = (userId?: string, companyId?: string) => {
        if (userId && companyId) {
            permissionCache.delete(`${userId}:${companyId}`);
        } else {
            permissionCache.clear();
        }
    };

    return {
        authenticate,
        loadCompanyEmployee,
        requirePermission,
        canManageUser,
        isCompanyOwner,
        clearCache,
    };
};
