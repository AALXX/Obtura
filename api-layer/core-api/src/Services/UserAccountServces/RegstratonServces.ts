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

    try {
        const ticket = await client.verifyIdToken({
            idToken: req.body.idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();

        if (!payload) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const googleUserId = payload.sub;
        const email = payload.email;

        let userId;
        const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);

        if (existingUser.rows.length > 0) {
            userId = existingUser.rows[0].id;

            await db.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [req.body.user.name, userId]);
        } else {
            const newUser = await db.query('INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id', [email, req.body.user.name]);
            userId = newUser.rows[0].id;
        }


        await db.query(
            `
      INSERT INTO oauth_accounts (user_id, provider, provider_account_id, access_token, expires_at)
      VALUES ($1, 'google', $2, $3, $4)
      ON CONFLICT (provider, provider_account_id) 
      DO UPDATE SET 
        access_token = EXCLUDED.access_token,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `,
            [userId, googleUserId, req.body.accessToken, new Date(payload.exp * 1000)],
        );

        const accessToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await db.query(
            `
      INSERT INTO sessions (user_id, access_token, expires_at, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
    `,
            [userId, accessToken, expiresAt, req.ip, req.headers['user-agent']],
        );

        res.json({
            token: accessToken,
            expiresAt: expiresAt.toISOString(),
            user: {
                id: userId,
                email,
                name: req.body.user.name,
                avatar: req.body.user.image,
            },
        });
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

export default {
    RegisterUserWithGoogle,
};
