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

const CompleteCompanySetup = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('COMPLETE-COMPANY-SETUP', error.errorMsg);
        });

        return res.status(400).json({ error: true, errors: errors.array() });
    }

    const { companyName, companySize, accessToken, industry, userRole, subscriptionPlan } = req.body;
    const dbClient = await db.connect();

    try {
        await dbClient.query('BEGIN');

        const sessionResult = await dbClient.query('SELECT user_id FROM sessions WHERE access_token = $1 AND expires_at > NOW()', [accessToken]);

        if (sessionResult.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const userId = sessionResult.rows[0].user_id;

        const existingCompany = await dbClient.query(
            `
            SELECT c.id 
            FROM companies c
            WHERE c.owner_user_id = $1
            LIMIT 1
            `,
            [userId],
        );

        console.log('CUM 1');

        if (existingCompany.rows.length > 0) {
            await dbClient.query('ROLLBACK');
            return res.status(400).json({
                error: true,
                message: 'User already has a company',
            });
        }

        const validPlans = ['starter', 'professional', 'business', 'enterprise'];
        const selectedPlan = subscriptionPlan || 'starter';

        if (!validPlans.includes(selectedPlan)) {
            await dbClient.query('ROLLBACK');
            return res.status(400).json({
                error: true,
                message: 'Invalid subscription plan selected',
            });
        }

        const planResult = await dbClient.query('SELECT id, name, price_monthly FROM subscription_plans WHERE id = $1', [selectedPlan]);

        if (planResult.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(400).json({
                error: true,
                message: 'Selected subscription plan not found',
            });
        }

        const planDetails = planResult.rows[0];

        const userResult = await dbClient.query('SELECT email FROM users WHERE id = $1', [userId]);

        if (userResult.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }

        const userEmail = userResult.rows[0].email;

        const baseSlug = companyName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        const randomSuffix = Math.random().toString(36).substr(2, 6);
        const companySlug = `${baseSlug}-${randomSuffix}`;

        const companyResult = await dbClient.query(
            `
            INSERT INTO companies (
                owner_user_id,
                name,
                slug,
                billing_email,
                data_region,
                is_active
            )
            VALUES ($1, $2, $3, $4, 'eu-central', true)
            RETURNING id, name, slug
            `,
            [userId, companyName, companySlug, userEmail],
        );

        const company = companyResult.rows[0];

        const teamResult = await dbClient.query(
            `
            INSERT INTO teams (
                company_id,
                owner_user_id,
                name,
                slug,
                data_region,
                is_active
            )
            VALUES ($1, $2, 'Default Team', 'default', 'eu-central', true)
            RETURNING id
            `,
            [company.id, userId],
        );

        const teamId = teamResult.rows[0].id;

        await dbClient.query(
            `
            INSERT INTO team_members (team_id, user_id, role)
            VALUES ($1, $2, 'owner')
            `,
            [teamId, userId],
        );

        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await dbClient.query(
            `
    INSERT INTO subscriptions (
        company_id,
        plan_id,
        status,
        current_period_start,
        current_period_end,
        current_users_count,
        current_projects_count,
        current_deployments_count,
        current_storage_used_gb
    )
    VALUES ($1, $2, 'active', NOW(), $3, 1, 0, 0, 0)
    `,
            [company.id, selectedPlan, periodEnd],
        );

        const subscriptionResult = await dbClient.query('SELECT id FROM subscriptions WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1', [company.id]);

        if (subscriptionResult.rows.length > 0) {
            await dbClient.query(
                `
                INSERT INTO subscription_history (
                    subscription_id, 
                    plan_id, 
                    status, 
                    change_type, 
                    changed_by, 
                    notes
                )
                VALUES ($1, $2, 'trialing', 'created', $3, $4)
                `,
                [subscriptionResult.rows[0].id, selectedPlan, userId, `Trial subscription created during onboarding. Selected plan: ${planDetails.name} ($${planDetails.price_monthly}/month)`],
            );
        }

        await dbClient.query(
            `
  UPDATE companies 
  SET metadata = jsonb_build_object(
      'company_size', $1::text,
      'industry', $2::text,
      'owner_role', $3::text,
      'selected_plan', $4::text,
      'onboarding_completed_at', NOW()
  )
  WHERE id = $5
  `,
            [companySize, industry, userRole, selectedPlan, company.id],
        );

        await dbClient.query(
            `
            INSERT INTO audit_logs (
                user_id,
                team_id,
                action,
                resource_type,
                resource_id,
                ip_address,
                user_agent
            )
            VALUES ($1, $2, 'company.created', 'company', $3, $4, $5)
            `,
            [userId, teamId, company.id, req.ip, req.headers['user-agent']],
        );

        await dbClient.query('COMMIT');

        res.status(200).json({
            success: true,
            company: {
                id: company.id,
                name: company.name,
                slug: company.slug,
            },
            subscription: {
                plan: selectedPlan,
                planName: planDetails.name,
                priceMonthly: planDetails.price_monthly,
                status: 'trialing',
            },
            message: 'Company setup completed successfully',
        });
    } catch (error: any) {
        await dbClient.query('ROLLBACK');
        logging.error('COMPLETE-COMPANY-SETUP', error.message);
        res.status(500).json({
            error: true,
            message: 'Failed to setup company',
            details: error.message,
        });
    } finally {
        dbClient.release();
    }
};

const CheckCompanyStatus = async (req: Request, res: Response) => {
    try {
        const result = await db.query(
            `
            SELECT 
                u.id,
                u.email,
                u.name,
                EXISTS (
                    SELECT 1 
                    FROM companies c
                    WHERE c.owner_user_id = u.id
                    OR EXISTS (
                        SELECT 1 
                        FROM teams t
                        JOIN team_members tm ON tm.team_id = t.id
                        WHERE t.company_id = c.id 
                        AND tm.user_id = u.id
                    )
                ) as has_company,
                (
                    SELECT c.id 
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
                ) as company_id
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.access_token = $1
            AND s.expires_at > NOW()
            `,
            [req.params.accessToken],
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        res.status(200).json({
            hasCompany: result.rows[0].has_company,
            companyId: result.rows[0].company_id,
            user: {
                id: result.rows[0].id,
                email: result.rows[0].email,
                name: result.rows[0].name,
            },
        });
    } catch (error: any) {
        logging.error('CHECK-COMPANY-STATUS', error.message);
        res.status(500).json({ error: 'Failed to check company status' });
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
    CompleteCompanySetup,
    CheckCompanyStatus,
};
