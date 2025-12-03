import { Request, Response } from 'express';
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

                -- OAuth accounts
                json_agg(
                    DISTINCT jsonb_build_object(
                        'id', oa.id,
                        'provider', oa.provider,
                        'provider_account_id', oa.provider_account_id,
                        'expires_at', oa.expires_at,
                        'created_at', oa.created_at
                    )
                ) FILTER (WHERE oa.id IS NOT NULL) AS oauth_accounts,

                -- Active sessions
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

                -- Company information (user's primary company)
                (
                    SELECT jsonb_build_object(
                        'id', c.id,
                        'name', c.name,
                        'slug', c.slug,
                        'role', CASE 
                            WHEN c.owner_user_id = u.id THEN 'owner'
                            ELSE (
                                SELECT tm.role 
                                FROM teams t
                                JOIN team_members tm ON tm.team_id = t.id
                                WHERE t.company_id = c.id 
                                AND tm.user_id = u.id
                                AND tm.role IN ('admin', 'owner')
                                LIMIT 1
                            )
                        END,
                        'is_active', c.is_active
                    )
                    FROM companies c
                    WHERE c.owner_user_id = u.id 
                    OR EXISTS (
                        SELECT 1 
                        FROM teams t
                        JOIN team_members tm ON tm.team_id = t.id
                        WHERE t.company_id = c.id 
                        AND tm.user_id = u.id
                    )
                    ORDER BY 
                        CASE WHEN c.owner_user_id = u.id THEN 0 ELSE 1 END,
                        c.created_at DESC
                    LIMIT 1
                ) AS company,

                -- Current subscription (for user's company)
                (
                    SELECT jsonb_build_object(
                        'id', sub.id,
                        'status', sub.status,
                        'current_period_start', sub.current_period_start,
                        'current_period_end', sub.current_period_end,
                        'cancel_at_period_end', sub.cancel_at_period_end,
                        'current_users_count', sub.current_users_count,
                        'current_projects_count', sub.current_projects_count,
                        'current_deployments_count', sub.current_deployments_count,
                        'current_storage_used_gb', sub.current_storage_used_gb,
                        'trial_end', sub.trial_end,
                        'plan', jsonb_build_object(
                            'id', sp.id,
                            'name', sp.name,
                            'price_monthly', sp.price_monthly,
                            'max_users', sp.max_users,
                            'max_projects', sp.max_projects,
                            'max_deployments_per_month', sp.max_deployments_per_month,
                            'max_apps', sp.max_apps,
                            'storage_gb', sp.storage_gb,
                            'description', sp.description
                        )
                    )
                    FROM subscriptions sub
                    INNER JOIN subscription_plans sp ON sp.id = sub.plan_id
                    INNER JOIN companies c ON c.id = sub.company_id
                    WHERE (
                        c.owner_user_id = u.id 
                        OR EXISTS (
                            SELECT 1 
                            FROM teams t
                            JOIN team_members tm ON tm.team_id = t.id
                            WHERE t.company_id = c.id 
                            AND tm.user_id = u.id
                        )
                    )
                    AND sub.status IN ('active', 'trialing', 'past_due')
                    ORDER BY 
                        CASE WHEN c.owner_user_id = u.id THEN 0 ELSE 1 END,
                        sub.current_period_end DESC
                    LIMIT 1
                ) AS subscription

            FROM sessions s
            INNER JOIN users u ON s.user_id = u.id
            LEFT JOIN oauth_accounts oa ON u.id = oa.user_id
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

        // Update session last used timestamp
        await db.query('UPDATE sessions SET last_used_at = NOW() WHERE access_token = $1', [req.params.accessToken]);

        // Determine account type
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
            companyRole: userData.company?.role || 'member',
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
