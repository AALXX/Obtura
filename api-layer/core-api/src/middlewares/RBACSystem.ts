// RBACMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { PermissionResource, PermissionAction, TeamRole } from './RBACTypes';

export interface User {
    id: string;
    email: string;
    name: string;
}

export interface TeamMember {
    id: string;
    teamId: string;
    role: TeamRole;
    permissions: Set<string>;
}

export interface AuthenticatedRequest extends Request {
    accessToken?: string;
    user?: User;
    teamMember?: TeamMember;
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

    const loadTeamMember = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                return res.status(401).json({ message: 'Not authenticated' });
            }

            const teamId = req.body?.teamId || req.params?.teamId || req.query?.teamId;
            if (!teamId) {
                return res.status(400).json({ message: 'Team ID required' });
            }

            const cacheKey = `${req.user.id}:${teamId}`;
            const cached = permissionCache.get(cacheKey);
            if (cached && cached.expiry > Date.now()) {
                req.teamMember = {
                    id: '',
                    teamId,
                    role: '' as TeamRole,
                    permissions: cached.permissions,
                };
                return next();
            }

            const result = await pool.query(
                `SELECT 
                    tm.id, 
                    cu.role,
                    COALESCE(
                        json_agg(DISTINCT jsonb_build_object('resource', p.resource, 'action', p.action)) 
                        FILTER (WHERE p.id IS NOT NULL), 
                        '[]'
                    ) as role_permissions,
                    COALESCE(
                        json_agg(DISTINCT jsonb_build_object('resource', p2.resource, 'action', p2.action, 'granted', tmp.is_granted)) 
                        FILTER (WHERE p2.id IS NOT NULL), 
                        '[]'
                    ) as custom_permissions
                FROM team_members tm
                LEFT JOIN company_users cu ON cu.user_id = tm.user_id
                LEFT JOIN role_permissions rp ON rp.role_name = (SELECT name FROM roles WHERE id = cu.role)
                LEFT JOIN permissions p ON p.id = rp.permission_id
                LEFT JOIN team_member_permissions tmp ON tmp.team_member_id = tm.id
                LEFT JOIN permissions p2 ON p2.id = tmp.permission_id
                WHERE tm.user_id = $1 AND tm.team_id = $2
                GROUP BY tm.id, cu.role`,
                [req.user.id, teamId],
            );

            if (result.rows.length === 0) {
                return res.status(403).json({ message: 'Not a team member' });
            }

            const row = result.rows[0];
            const permissions = new Set<string>();

            row.role_permissions.forEach((p: any) => {
                permissions.add(`${p.resource}:${p.action}`);
            });

            row.custom_permissions.forEach((p: any) => {
                const key = `${p.resource}:${p.action}`;
                if (p.granted) {
                    permissions.add(key);
                } else {
                    permissions.delete(key);
                }
            });

            console.log(permissions);

            permissionCache.set(cacheKey, { permissions, expiry: Date.now() + CACHE_TTL });
            req.teamMember = {
                id: row.id,
                teamId,
                role: row.role as TeamRole,
                permissions,
            };
            next();
        } catch (error) {
            console.error('Load team member error:', error);
            res.status(500).json({ message: 'Failed to load team member' });
        }
    };

    const requirePermission = (resource: PermissionResource, action: PermissionAction) => {
        return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            if (!req.teamMember) {
                return res.status(403).json({ message: 'No team context' });
            }

            const key = `${resource}:${action}`;
            if (!req.teamMember.permissions.has(key)) {
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
            if (!req.user || !req.teamMember) {
                return res.status(401).json({ message: 'Not authenticated' });
            }

            const targetUserId = req.body?.userId || req.params?.userId;
            if (!targetUserId) {
                return res.status(400).json({ message: 'User ID required' });
            }

            const result = await pool.query(
                `SELECT 
                    r1.hierarchy_level as actorLevel, 
                    r2.hierarchy_level as targetLevel
                FROM team_members tm1 
                JOIN roles r1 ON r1.name = tm1.role
                CROSS JOIN team_members tm2 
                JOIN roles r2 ON r2.name = tm2.role
                WHERE tm1.user_id = $1 
                    AND tm1.team_id = $2 
                    AND tm2.user_id = $3 
                    AND tm2.team_id = $2`,
                [req.user.id, req.teamMember.teamId, targetUserId],
            );

            if (result.rows.length === 0) {
                return res.status(403).json({ message: 'Target user not found in team' });
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

    const clearCache = (userId?: string, teamId?: string) => {
        if (userId && teamId) {
            permissionCache.delete(`${userId}:${teamId}`);
        } else {
            permissionCache.clear();
        }
    };

    return {
        authenticate,
        loadTeamMember,
        requirePermission,
        canManageUser,
        clearCache,
    };
};
