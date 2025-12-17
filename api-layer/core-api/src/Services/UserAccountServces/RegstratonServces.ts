import { Request, Response } from 'express';
import logging from '../../config/logging';
import { CustomRequestValidationResult } from '../../common/comon';
import { OAuth2Client } from 'google-auth-library';
import db from '../../config/postgresql';
import crypto from 'crypto';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Registers a new user account with Google authentication
 * @param {Request} req
 * @param {Response} res
 * @return {Response}
 */
const RegisterUserWithGoogle = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('REGISTER-USER-WITH-GOOGLE', error.errorMsg);
        });

        return res.status(200).json({ error: true, errors: errors.array() });
    }

    const dbClient = await db.connect();

    try {
        await dbClient.query('BEGIN');

        const ticket = await client.verifyIdToken({
            idToken: req.body.idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();

        if (!payload) {
            await dbClient.query('ROLLBACK');
            return res.status(401).json({ error: 'Invalid token' });
        }

        const googleUserId = payload.sub;
        const email = payload.email;

        let userId: string;
        let hasCompany = false;
        let companyId = null;
        let companyName = null;
        let isNewUser = false;

        const existingUser = await dbClient.query('SELECT id FROM users WHERE email = $1', [email]);

        if (existingUser.rows.length > 0) {
            userId = existingUser.rows[0].id;
            isNewUser = false;

            await dbClient.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [req.body.user.name, userId]);

            const companyCheck = await dbClient.query(
                `
                SELECT c.id, c.name
                FROM companies c
                WHERE c.owner_user_id = $1 
                OR EXISTS (
                    SELECT 1 
                    FROM teams t
                    JOIN team_members tm ON tm.team_id = t.id
                    WHERE t.company_id = c.id 
                    AND tm.user_id = $1
                )
                ORDER BY 
                    CASE WHEN c.owner_user_id = $1 THEN 0 ELSE 1 END,
                    c.created_at DESC
                LIMIT 1
            `,
                [userId],
            );

            if (companyCheck.rows.length > 0) {
                hasCompany = true;
                companyId = companyCheck.rows[0].id;
                companyName = companyCheck.rows[0].name;
            }
        } else {
            // NEW USER - Create user only (no company yet)
            const newUser = await dbClient.query(
                `INSERT INTO users (email, name, email_verified, data_region) 
                 VALUES ($1, $2, true, 'eu-central') 
                 RETURNING id`,
                [email, req.body.user.name],
            );
            userId = newUser.rows[0].id;
            isNewUser = true;
            hasCompany = false; // New users need to complete onboarding
        }

        // Create or update OAuth account
        await dbClient.query(
            `
            INSERT INTO oauth_accounts (user_id, provider, provider_account_id, access_token, expires_at)
            VALUES ($1, 'google', $2, $3, $4)
            ON CONFLICT (provider, provider_account_id) 
            DO UPDATE SET 
                access_token = EXCLUDED.access_token,
                expires_at = EXCLUDED.expires_at
            `,
            [userId, googleUserId, req.body.accessToken, new Date(payload.exp! * 1000)],
        );

        const accessToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await dbClient.query(
            `
            INSERT INTO sessions (user_id, access_token, expires_at, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5)
            `,
            [userId, accessToken, expiresAt, req.ip, req.headers['user-agent']],
        );

        // Log audit event
        await dbClient.query(
            `
            INSERT INTO audit_logs (
                user_id, 
                action, 
                resource_type, 
                resource_id, 
                ip_address, 
                user_agent
            )
            VALUES ($1, $2, 'user', $1, $3, $4)
            `,
            [userId, isNewUser ? 'user.registered.google' : 'user.login.google', req.ip, req.headers['user-agent']],
        );

        await dbClient.query('COMMIT');

        res.status(200).json({
            token: accessToken,
            expiresAt: expiresAt.toISOString(),
            user: {
                id: userId,
                email,
                name: req.body.user.name,
                avatar: req.body.user.image,
            },
            hasCompany, // Frontend uses this to redirect to onboarding or dashboard
            company: hasCompany ? { id: companyId, name: companyName } : null,
        });
    } catch (error) {
        await dbClient.query('ROLLBACK');
        console.error('Google auth error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    } finally {
        dbClient.release();
    }
};

const LogoutUser = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().forEach((error) => {
            logging.error('LOGOUT_USER_FUNCTION', error.errorMsg);
        });
        res.status(400).json({ error: true, errors: errors.array() });
        return;
    }
    try {
        const queryString = `
            DELETE FROM sessions
            WHERE access_token = $1
        `;

        await db.query(queryString, [req.body.accessToken]);

        res.sendStatus(200);
    } catch (error: any) {
        logging.error('LOGOUT_USER_FUNCTION', error.message);
        res.status(500).json({
            error: true,
            errmsg: 'Something went wrong',
        });
    }
};

export default {
    RegisterUserWithGoogle,
    LogoutUser,
};
