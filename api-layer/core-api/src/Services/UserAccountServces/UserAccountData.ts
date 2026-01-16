import { type Request, type Response } from 'express';
import logging from '../../config/logging';
import { CustomRequestValidationResult } from '../../common/comon';
import db from '../../config/postgresql';
import { formatDate, getUserIdFromSessionToken, hashPassword } from '../../lib/utils';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { getPasswordResetEmailTemplate, getResetEmailTemplate } from '../../config/HTML_email_Templates';

/**
 * Retrieves the user account data and its associated OAuth accounts
 * @param {Request} req - The Express request object
 * @param {Response} res - The Express response object
 * @return {Promise<Response>}
 */
const GetUserAccountData = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('GET-USER-ACCOUNT-DATA', error.errorMsg);
        });

        return res.status(400).json({ error: true, errors: errors.array() });
    }

    try {
        const query = `
SELECT 
    u.id,
    u.email,
    u.name,
    u.created_at,
    u.updated_at,

    json_agg(
        DISTINCT jsonb_build_object(
            'id', oa.id,
            'provider', oa.provider,
            'provider_account_id', oa.provider_account_id,
            'expires_at', oa.expires_at,
            'created_at', oa.created_at
        )
    ) FILTER (WHERE oa.id IS NOT NULL) AS oauth_accounts,

    json_agg(
        DISTINCT jsonb_build_object(
            'id', s.id,
            'expires_at', s.expires_at,
            'last_used_at', s.last_used_at,
            'ip_address', s.ip_address,
            'user_agent', s.user_agent,
            'created_at', s.created_at
        )
    ) FILTER (WHERE s.id IS NOT NULL AND s.expires_at > NOW()) AS active_sessions,

    (
        SELECT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'slug', c.slug,
            'role', jsonb_build_object(
                'name', r.name,
                'display_name', r.display_name,
                'hierarchy_level', r.hierarchy_level
            ),
            'status', c.status
        )
        FROM companies c
        JOIN company_users cu
            ON cu.company_id = c.id
           AND cu.user_id = u.id
        JOIN roles r
            ON r.id = cu.role
        ORDER BY c.created_at DESC
        LIMIT 1
    ) AS company,

    (
        SELECT jsonb_build_object(
            -- Basic Info
            'id', sub.id,
            'status', sub.status,
            'billing_cycle', sub.billing_cycle,
            
            -- Billing Period
            'current_period_start', sub.current_period_start,
            'current_period_end', sub.current_period_end,
            'cancel_at_period_end', sub.cancel_at_period_end,
            'canceled_at', sub.canceled_at,
            
            -- Payment Info
            'last_payment_at', sub.last_payment_at,
            'next_payment_at', sub.next_payment_at,
            
            -- Current Usage - Team & Organization
            'current_users_count', sub.current_users_count,
            'current_team_members_count', sub.current_team_members_count,
            'current_projects_count', sub.current_projects_count,
            
            -- Current Usage - Builds
            'current_builds_this_hour', sub.current_builds_this_hour,
            'current_builds_today', sub.current_builds_today,
            'current_builds_this_month', sub.current_builds_this_month,
            'current_concurrent_builds', sub.current_concurrent_builds,
            
            -- Current Usage - Deployments
            'current_deployments_count', sub.current_deployments_count,
            'current_deployments_this_month', sub.current_deployments_this_month,
            'current_concurrent_deployments', sub.current_concurrent_deployments,
            'current_environments_count', sub.current_environments_count,
            'current_preview_environments_count', sub.current_preview_environments_count,
            
            -- Current Usage - Storage
            'current_storage_used_gb', sub.current_storage_used_gb,
            'current_build_artifacts_gb', sub.current_build_artifacts_gb,
            'current_database_storage_gb', sub.current_database_storage_gb,
            
            -- Current Usage - Traffic & Bandwidth
            'current_bandwidth_used_gb', sub.current_bandwidth_used_gb,
            'bandwidth_reset_at', sub.bandwidth_reset_at,
            
            -- Current Usage - Integrations
            'current_webhooks_count', sub.current_webhooks_count,
            'current_api_keys_count', sub.current_api_keys_count,
            'current_custom_domains_count', sub.current_custom_domains_count,
            
            -- Overage & Limits
            'overage_charges', sub.overage_charges,
            'overage_details', sub.overage_details,
            
            -- Plan Modifications
            'pending_plan_change_id', sub.pending_plan_change_id,
            'pending_change_at', sub.pending_change_at,
            'previous_plan_id', sub.previous_plan_id,
            'plan_changed_at', sub.plan_changed_at,
            
            -- Additional Metadata
            'metadata', sub.metadata,
            'custom_limits', sub.custom_limits,
            'feature_flags', sub.feature_flags,
            
            -- Subscription Plan Details
            'plan', jsonb_build_object(
                -- Basic Info
                'id', sp.id,
                'name', sp.name,
                'price_monthly', sp.price_monthly,
                'price_annually', sp.price_annually,
                'description', sp.description,
                'display_order', sp.display_order,
                
                -- Team & Organization Limits
                'max_users', sp.max_users,
                'max_team_members', sp.max_team_members,
                'max_projects', sp.max_projects,
                
                -- Build Limits
                'max_builds_per_hour', sp.max_builds_per_hour,
                'max_builds_per_day', sp.max_builds_per_day,
                'max_builds_per_month', sp.max_builds_per_month,
                'max_concurrent_builds', sp.max_concurrent_builds,
                'max_build_duration_minutes', sp.max_build_duration_minutes,
                'max_build_size_mb', sp.max_build_size_mb,
                
                -- Build Resources
                'cpu_cores_per_build', sp.cpu_cores_per_build,
                'memory_gb_per_build', sp.memory_gb_per_build,
                
                -- Deployment Limits
                'max_deployments_per_month', sp.max_deployments_per_month,
                'max_concurrent_deployments', sp.max_concurrent_deployments,
                'max_environments_per_project', sp.max_environments_per_project,
                'max_preview_environments', sp.max_preview_environments,
                'rollback_retention_count', sp.rollback_retention_count,
                
                -- Runtime Resources
                'cpu_cores_per_deployment', sp.cpu_cores_per_deployment,
                'memory_gb_per_deployment', sp.memory_gb_per_deployment,
                
                -- Storage Limits
                'storage_gb', sp.storage_gb,
                'max_build_artifacts_gb', sp.max_build_artifacts_gb,
                'max_database_storage_gb', sp.max_database_storage_gb,
                'max_logs_retention_days', sp.max_logs_retention_days,
                'max_backup_retention_days', sp.max_backup_retention_days,
                
                -- Traffic & Bandwidth
                'bandwidth_gb_per_month', sp.bandwidth_gb_per_month,
                'requests_per_minute', sp.requests_per_minute,
                'ddos_protection_enabled', sp.ddos_protection_enabled,
                
                -- Integrations & Features
                'max_webhooks_per_project', sp.max_webhooks_per_project,
                'max_api_keys_per_project', sp.max_api_keys_per_project,
                'max_custom_domains', sp.max_custom_domains,
                'ssl_certificates_included', sp.ssl_certificates_included,
                'advanced_analytics_enabled', sp.advanced_analytics_enabled,
                'audit_logs_enabled', sp.audit_logs_enabled,
                'audit_logs_retention_days', sp.audit_logs_retention_days,
                
                -- Support & SLA
                'support_level', sp.support_level,
                'sla_uptime_percentage', sp.sla_uptime_percentage,
                'support_response_hours', sp.support_response_hours,
                
                -- Feature Flags
                'custom_runtime_configs_enabled', sp.custom_runtime_configs_enabled,
                'kubernetes_deployment_enabled', sp.kubernetes_deployment_enabled,
                'multi_region_enabled', sp.multi_region_enabled,
                'white_label_enabled', sp.white_label_enabled
            )
        )
        FROM subscriptions sub
        JOIN subscription_plans sp ON sp.id = sub.plan_id
        JOIN company_users cu
            ON cu.company_id = sub.company_id
           AND cu.user_id = u.id
        WHERE sub.status IN ('pending', 'active', 'trialing', 'past_due')
        ORDER BY sub.current_period_end DESC
        LIMIT 1
    ) AS subscription

FROM sessions s
JOIN users u ON s.user_id = u.id
LEFT JOIN oauth_accounts oa ON oa.user_id = u.id
WHERE s.access_token = $1
  AND s.expires_at > NOW()
GROUP BY u.id;
`;

        const response = await db.query(query, [req.params.accessToken]);
        if (response.rows.length === 0) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const userData = response.rows[0];

        await db.query('UPDATE sessions SET last_used_at = NOW() WHERE access_token = $1', [req.params.accessToken]);

        const accountType = userData.oauth_accounts && userData.oauth_accounts.length > 0 ? userData.oauth_accounts[0].provider : 'email';

        return res.status(200).json({
            error: false,
            email: userData.email,
            name: userData.name,
            accountType: accountType,
            memberSince: formatDate(userData.created_at),
            activeSessions: userData.active_sessions || [],
            userSubscription: userData.subscription,
            hasCompany: !!userData.company,
            companyName: userData.company?.name || null,
            companyRole: userData.company?.role,
        });
    } catch (error: any) {
        logging.error('GET-USER-ACCOUNT-DATA', error.message);

        return res.status(500).json({
            error: true,
            errmsg: error.message,
        });
    }
};

const ChangeUserData = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('CHANGE_USER_DATA', error.errorMsg);
        });
        res.status(400).json({ error: true, errors: errors.array() });
        return;
    }

    try {
        const userId = await getUserIdFromSessionToken(req.body.accessToken);

        if (!userId) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const queryString = `UPDATE users SET name = $1 WHERE id = $2`;

        await db.query(queryString, [req.body.name, userId]);

        res.sendStatus(200);
    } catch (error: any) {
        logging.error('CHANGE_USER_DATA', error.message);
        res.status(500).json({
            error: true,
            errmsg: error.message,
        });
    }
};

const GetChangeEmailLink = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('GET_CHANGE_EMAIL_LINK', error.errorMsg);
        });
        res.status(400).json({ error: true, errors: errors.array() });
        return;
    }

    try {
        const userId = await getUserIdFromSessionToken(req.body.accessToken);

        if (!userId) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const usrData = await db.query('SELECT email FROM users WHERE id = $1', [userId]);

        const userEmail = usrData.rows[0].email;

        const token = jwt.sign(
            {
                userId: userId,
                type: 'CHANGE_EMAIL',
            },
            process.env.CHANGE_GMAIL_SECRET as string,
            { expiresIn: '1h' },
        );

        const changeEmailLink = `${process.env.FRONTEND_URL}/account/change-email/${token}`;

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USERNAME,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: `"Obtura" <${process.env.EMAIL_USERNAME}>`,
            to: userEmail,
            subject: 'Change Email Request',
            html: getResetEmailTemplate(userEmail, changeEmailLink),
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({
            error: false,
            errmsg: 'Email change link sent successfully',
        });
    } catch (error: any) {
        logging.error('GET_CHANGE_EMAIL_LINK', error);
        res.status(500).json({
            error: true,
            errmsg: error.message,
        });
    }
};

const ChangeUserEmail = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('CHANGE_USER_EMAIL', error.errorMsg);
        });
        res.status(200).json({ error: true, errors: errors.array() });
        return;
    }

    try {
        let tokenPayload: { accessToken: string; type: string; iat: number; exp: number } | null = null;

        try {
            tokenPayload = jwt.verify(req.body.token, process.env.CHANGE_GMAIL_SECRET as string) as { accessToken: string; type: string; iat: number; exp: number };

            if (tokenPayload.type !== 'CHANGE_EMAIL') {
                res.status(400).json({
                    error: true,
                    errmsg: 'This link is not valid for changing email addresses.',
                });
                return;
            }
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                res.status(200).json({ error: true, errmsg: 'Token expired' });
            } else {
                res.status(200).json({ error: true, errmsg: 'Token is invalid' });
            }
            return;
        }

        const userId = await getUserIdFromSessionToken(tokenPayload.accessToken);

        if (!userId) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const updateQuery = `UPDATE users SET email = $1 WHERE id = $2`;

        await db.query(updateQuery, [req.body.email, userId]);

        res.status(200).json({
            error: false,
            errmsg: 'User email updated successfully',
        });
    } catch (error: any) {
        logging.error('CHANGE_USER_EMAIL', error.message);
        res.status(500).json({
            error: true,
            errmsg: error.message,
        });
    }
};

const GetChangePasswordLink = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('GET_CHANGE_EMAIL_LINK', error.errorMsg);
        });
        res.status(400).json({ error: true, errors: errors.array() });
        return;
    }

    try {
        const userId = await getUserIdFromSessionToken(req.body.accessToken);

        if (!userId) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        const userData = await db.query('SELECT email FROM users WHERE id = $1', [userId]);

        const accessToken = req.body.accessToken;
        const email = userData.rows[0].email;

        const token = jwt.sign(
            {
                accessToken: accessToken,
                type: 'CHANGE_PASSWORD',
            },
            process.env.CHANGE_PWD_SECRET as string,
            { expiresIn: '1h' },
        );

        const changeEmailLink = `${process.env.FRONTEND_URL}/account/change-password/${token}`;

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USERNAME,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: `"Obtura" <${process.env.EMAIL_USERNAME}>`,
            to: email,
            subject: 'Change Password Request',
            html: getPasswordResetEmailTemplate(email, changeEmailLink),
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({
            error: false,
            errmsg: 'Email change link sent successfully',
        });
    } catch (error: any) {
        logging.error('GET_CHANGE_EMAIL_LINK', error);
        res.status(500).json({
            error: true,
            errmsg: error.message,
        });
    }
};

const ChangeUserPassword = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('CHANGE_USER_PASSWORD', error.errorMsg);
        });
        res.status(200).json({ error: true, errors: errors.array() });
        return;
    }

    try {
        let tokenPayload: { accessToken: string; type: string; iat: number; exp: number } | null = null;

        try {
            tokenPayload = jwt.verify(req.body.token, process.env.CHANGE_PWD_SECRET as string) as { accessToken: string; type: string; iat: number; exp: number };

            if (tokenPayload.type !== 'CHANGE_PASSWORD') {
                res.status(400).json({
                    error: true,
                    errmsg: 'This link is not valid for changing email addresses.',
                });
                return;
            }
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                res.status(400).json({ error: true, errmsg: 'Token expired' });
            } else {
                res.status(400).json({ error: true, errmsg: 'Token is invalid' });
            }
            return;
        }
        const HashedPassword = await hashPassword(req.body.newPassword);

        const updateQuery = `UPDATE users SET UserPwd = $1 WHERE userId = $2`;

        await db.query(updateQuery, [HashedPassword, tokenPayload.accessToken]);

        res.status(200).json({
            error: false,
            errmsg: 'User email updated successfully',
        });
    } catch (error: any) {
        logging.error('CHANGE_USER_PASSWORD', error.message);
        res.status(200).json({
            error: true,
            errmsg: error.message,
        });
    }
};

const DeleteUserAccount = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('DELETE_USER_ACCOUNT', error.errorMsg);
        });
        res.status(400).json({ error: true, errors: errors.array() });
        return;
    }

    try {
        const userId = await getUserIdFromSessionToken(req.body.accessToken);

        if (!userId) {
            return res.status(401).json({
                error: true,
                errmsg: 'Invalid or expired access token',
            });
        }

        await db.query('DELETE FROM users WHERE id = $1', [userId]);

        res.sendStatus(200);
    } catch (error: any) {
        logging.error('DELETE_USER_ACCOUNT', error.message);
        res.status(500).json({
            error: true,
            errmsg: error.message,
        });
    }
};

export default {
    GetUserAccountData,
    ChangeUserData,
    GetChangeEmailLink,
    ChangeUserEmail,
    GetChangePasswordLink,
    ChangeUserPassword,
    DeleteUserAccount,
};
