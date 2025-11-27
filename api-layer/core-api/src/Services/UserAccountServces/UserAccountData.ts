import { Request, Response } from 'express';
import logging from '../../config/logging';
import { CustomRequestValidationResult } from '../../common/comon';
import db from '../../config/postgresql';
import { formatDate } from '../../lib/utils';

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

    -- Current subscription
    (
        SELECT jsonb_build_object(
            'id', sub.id,
            'status', sub.status,
            'current_period_start', sub.current_period_start,
            'current_period_end', sub.current_period_end,
            'cancel_at_period_end', sub.cancel_at_period_end,
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
        WHERE sub.user_id = u.id
          AND sub.status = 'active'
        ORDER BY sub.current_period_end DESC
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

        await db.query('UPDATE sessions SET last_used_at = NOW() WHERE access_token = $1', [req.params.accessToken]);

        return res.status(200).json({
            error: false,
            email: response.rows[0].email,
            name: response.rows[0].name,
            accountType: response.rows[0].oauth_accounts[0].provider,
            memberSince: formatDate(response.rows[0].created_at),
            activeSessions: response.rows[0].active_sessions,
            userSubscription: response.rows[0].subscription,
        });
    } catch (error: any) {
        logging.error('GET-USER-ACCOUNT-DATA', error.message);

        return res.status(500).json({
            error: true,
            errmsg: error.message,
        });
    }
};

export default {
    GetUserAccountData,
};
