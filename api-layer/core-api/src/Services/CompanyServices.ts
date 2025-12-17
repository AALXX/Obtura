import { Request, Response } from 'express';
import logging from '../config/logging';
import { CustomRequestValidationResult } from '../common/comon';
import db from '../config/postgresql';
import { getUserIdFromSessionToken } from '../lib/utils';

const CompleteCompanySetup = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('COMPLETE-COMPANY-SETUP', error.errorMsg);
        });

        return res.status(400).json({ error: true, errors: errors.array() });
    }

    const { companyName, companySize, accessToken, industry, userRole, subscriptionPlan, billingEmail, vatNumber, addressLine1, city, country, dataRegion, dpaSigned } = req.body;
    const dbClient = await db.connect();

    console.log(req.body);

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
                data_region,
                is_active,
                billing_email,
                vat_number,
                address_line1,
                city,
                country,
                dpa_signed
            )
            VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9, $10)
            RETURNING id, name, slug
            `,
            [userId, companyName, companySlug, dataRegion, billingEmail, vatNumber, addressLine1, city, country, dpaSigned],
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
            VALUES ($1, $2, 'Default Team', 'default', $3, true)
            RETURNING id
            `,
            [company.id, userId, dataRegion],
        );

        const teamId = teamResult.rows[0].id;

        await dbClient.query(
            `
            INSERT INTO team_members (team_id, user_id)
            VALUES ($1, $2)
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

        await dbClient.query(
            `
            INSERT INTO company_users (
                company_id,
                user_id,
                role
            )
            VALUES ($1, $2, (SELECT id FROM roles WHERE name = $3))
            `,
            [company.id, userId, userRole],
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
      'onboarding_completed_at', NOW()
  )
  WHERE id = $3
  `,
            [companySize, industry, company.id],
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

const GetEmployees = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('GET-EMPLOYEES', error.errorMsg);
        });

        return res.status(401).json({ error: true, errors: errors.array() });
    }
    try {
        const { accessToken } = req.params;

        const employees = await db.query(
            `SELECT 
    u.id,
    u.name, 
    u.email,
    u.phone_number as phone,
    r.display_name AS roleName,
    r.hierarchy_level,
    c.name AS companyName,
    t.name AS teamName,
    CASE 
        WHEN u.id = s.user_id THEN true 
        ELSE false 
    END AS is_you,
    CASE
        WHEN requester_role.hierarchy_level < 6 THEN true 
        ELSE false
    END AS can_edit
FROM sessions s
JOIN users requester ON requester.id = s.user_id
JOIN company_users requester_cu ON requester_cu.user_id = requester.id
JOIN companies c ON c.id = requester_cu.company_id
JOIN roles requester_role ON requester_role.id = requester_cu.role
JOIN company_users cu ON cu.company_id = c.id
JOIN users u ON u.id = cu.user_id
JOIN roles r ON r.id = cu.role
JOIN teams t ON t.company_id = c.id
WHERE s.access_token = $1 
  AND s.expires_at > NOW()
ORDER BY r.hierarchy_level ASC, u.name ASC;
`,
            [accessToken],
        );

        res.status(200).json({
            employees: employees.rows,
        });
    } catch (error: any) {
        logging.error('GET-EMPLOYEES', error.message);
        res.status(500).json({ error: 'Failed to get employees' });
    }
};

export default { CompleteCompanySetup, CheckCompanyStatus, GetEmployees };
