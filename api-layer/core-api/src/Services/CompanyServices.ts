import { type Request, type Response } from 'express';
import logging from '../config/logging';
import { CustomRequestValidationResult } from '../common/comon';
import db from '../config/postgresql';
import { getCompanyInvitationEmailTemplate } from '../config/HTML_email_Templates';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';

const CompanyInit = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('COMPANY-INIT', error.errorMsg);
        });
        return res.status(400).json({ error: true, errors: errors.array() });
    }

    const { companyName, companySize, accessToken, industry, userRole, billingEmail, vatNumber, addressLine1, city, country, dataRegion, dpaSigned } = req.body;

    const dbClient = await db.connect();

    try {
        await dbClient.query('BEGIN');

        // Validate session
        const sessionResult = await dbClient.query('SELECT user_id FROM sessions WHERE access_token = $1 AND expires_at > NOW()', [accessToken]);

        if (sessionResult.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const userId = sessionResult.rows[0].user_id;

        // Check if user already has a company (including pending ones)
        const existingCompany = await dbClient.query('SELECT c.id, c.status FROM companies c WHERE c.owner_user_id = $1 LIMIT 1', [userId]);

        if (existingCompany.rows.length > 0) {
            const existingStatus = existingCompany.rows[0].status;

            // If there's a pending company, allow overwriting (in case of retry)
            if (existingStatus === 'pending') {
                await dbClient.query('DELETE FROM companies WHERE id = $1', [existingCompany.rows[0].id]);
            } else {
                await dbClient.query('ROLLBACK');
                return res.status(400).json({
                    error: true,
                    message: 'User already has an active company',
                });
            }
        }

        // Get user details
        const userResult = await dbClient.query('SELECT email, name FROM users WHERE id = $1', [userId]);

        if (userResult.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }

        const userEmail = userResult.rows[0].email;

        // Generate unique company slug
        const baseSlug = companyName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        const randomSuffix = Math.random().toString(36).substr(2, 6);
        const companySlug = `${baseSlug}-${randomSuffix}`;

        // Create company with PENDING status
        const companyResult = await dbClient.query(
            `INSERT INTO companies (
                owner_user_id, 
                name, 
                slug, 
                data_region, 
                billing_email, 
                vat_number, 
                address_line1, 
                city, 
                country, 
                dpa_signed,
                status,
                metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
            RETURNING id, name, slug, status`,
            [
                userId,
                companyName,
                companySlug,
                dataRegion,
                billingEmail || userEmail,
                vatNumber,
                addressLine1,
                city,
                country,
                dpaSigned,
                JSON.stringify({
                    company_size: companySize,
                    industry: industry || null,
                    user_role: userRole,
                    onboarding_step: 'payment_pending',
                }),
            ],
        );

        const company = companyResult.rows[0];

        // Create default team (also pending)
        // const teamResult = await dbClient.query(
        //     `INSERT INTO teams (company_id, owner_user_id, name, slug, data_region, is_active)
        //     VALUES ($1, $2, 'Default Team', 'default', $3, false)
        //     RETURNING id`,
        //     [company.id, userId, dataRegion],
        // );

        // const teamId = teamResult.rows[0].id;

        // // Add user to team (pending)
        // await dbClient.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [teamId, userId]);

        // // Add user to company_users with role (pending)
        // await dbClient.query(
        //     `INSERT INTO company_users (company_id, user_id, role)
        //     VALUES ($1, $2, (SELECT id FROM roles WHERE name = $3))`,
        //     [company.id, userId, userRole],
        // );

        // Log audit entry
        await dbClient.query(
            `INSERT INTO audit_logs (
                user_id,  action, resource_type, 
                resource_id, ip_address, user_agent
            )
            VALUES ($1, 'company.init_pending', 'company', $2, $3, $4)`,
            [userId, company.id, req.ip, req.headers['user-agent']],
        );

        await dbClient.query('COMMIT');


        res.status(200).json({
            success: true,
            company: {
                id: company.id,
                slug: company.slug,
                status: company.status,
            },
            message: 'Company initialized. Proceed to payment.',
        });
    } catch (error: any) {
        await dbClient.query('ROLLBACK');
        logging.error('COMPANY-INIT', error.message);
        res.status(500).json({
            error: true,
            message: 'Failed to initialize company',
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
                FROM company_users cu
                WHERE cu.company_id = c.id 
                AND cu.user_id = u.id
            )
        ) as has_company,
        (
            SELECT c.id 
            FROM companies c
            WHERE c.owner_user_id = u.id
            OR EXISTS (
                SELECT 1 
                FROM company_users cu
                WHERE cu.company_id = c.id 
                AND cu.user_id = u.id
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

const InviteUser = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('INVITE-USER', error.errorMsg);
        });

        return res.status(401).json({ error: true, errors: errors.array() });
    }
    try {
        const result = await db.query(
            `SELECT 
            c.id as companyId,
            c.name as companyName,
                u.name as inviterName
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            JOIN company_users cu ON cu.user_id = u.id
            JOIN companies c ON c.id = cu.company_id
            WHERE s.user_id = (SELECT user_id FROM sessions WHERE access_token = $1 LIMIT 1)
            LIMIT 1`,
            [req.body.accessToken],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Company not found or invalid access' });
        }

        const { companyid, companyname, invitername } = result.rows[0];

        const invitations = req.body.invitations || [];

        if (invitations.length === 0) {
            return res.status(400).json({ error: 'No invitations provided' });
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USERNAME,
                pass: process.env.EMAIL_PASS,
            },
        });

        const invitationPromises = invitations.map(async (invitation: { email: string; role: string; roleName: string }) => {
            const token = jwt.sign(
                {
                    type: 'COMPANY_INVITATION',
                    companyId: companyid,
                    invitedEmail: invitation.email,
                    invitedBy: invitername,
                    role: invitation.roleName,
                    companyName: companyname,
                },
                process.env.TEAM_INVITATION_SECRET as string,
                { expiresIn: '7d' },
            );
            const insertPromises = invitations.map((invitation: { email: string; role: string }) =>
                db.query('INSERT INTO company_invitations (company_id, email, role_id, invited_by, created_at) VALUES ($1, $2, (SELECT id FROM roles WHERE name = $3), (SELECT user_id FROM sessions WHERE access_token = $4), NOW())', [
                    companyid,
                    invitation.email,
                    invitation.role,
                    req.body.accessToken,
                ]),
            );
            await Promise.all(insertPromises);

            const inviteLink = `${process.env.FRONTEND_URL}/invitations/${token}`;

            const mailOptions = {
                from: `"Obtura" <${process.env.EMAIL_USERNAME}>`,
                to: invitation.email,
                subject: `${invitername} invited you to join ${companyname} on Obtura`,
                html: getCompanyInvitationEmailTemplate(invitation.email, invitername, companyname, inviteLink, invitation.roleName),
            };

            return transporter.sendMail(mailOptions);
        });

        await Promise.all(invitationPromises);

        res.status(200).json({
            success: true,
            message: `Invitations sent successfully to ${invitations.length} member(s)`,
        });
    } catch (error) {
        console.error('Invite user error:', error);
        res.status(500).json({ error: 'Failed to send invitation' });
    }
};

const AcceptInvitation = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        return res.status(401).json({ error: true, errors: errors.array() });
    }

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const userResult = await client.query(
            `
            SELECT u.id AS userid, u.email
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.access_token = $1
            `,
            [req.body.accessToken],
        );

        if (userResult.rowCount === 0) {
            return res.status(404).json({ error: 'User not found or invalid access' });
        }

        const { userid, email } = userResult.rows[0];

        const invitationResult = await client.query(
            `
            SELECT id, role_id as roleId 
            FROM company_invitations
            WHERE company_id = $1
              AND email = $2
              AND status = 'pending'
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [req.body.companyId, email],
        );

        if (invitationResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: 'Invitation not found or already accepted',
            });
        }

        const { id: invitationId, roleid } = invitationResult.rows[0];

        await client.query(
            `
            INSERT INTO company_users (company_id, user_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (company_id, user_id) DO NOTHING
            `,
            [req.body.companyId, userid, roleid],
        );

        await client.query(
            `
            UPDATE company_invitations
            SET status = 'accepted', updated_at = NOW()
            WHERE id = $1
            `,
            [invitationId],
        );

        await client.query('COMMIT');

        res.status(200).json({
            success: true,
            message: 'Invitation accepted successfully',
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Accept invitation error:', error);
        res.status(500).json({ error: 'Failed to accept invitation' });
    } finally {
        client.release();
    }
};

const SearchUsers = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const users = await db.query(
            `
            SELECT u_company.id, u_company.name, u_company.email, u_company.phone_number as phone, 
                   r.display_name AS roleName, r.hierarchy_level
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            JOIN company_users cu_requester ON cu_requester.user_id = s.user_id
            JOIN company_users cu ON cu.company_id = cu_requester.company_id
            JOIN users u_company ON u_company.id = cu.user_id
            JOIN roles r ON r.id = cu.role
            WHERE s.access_token = $1 
            AND u_company.status = 'active'
            AND u_company.id != s.user_id
            AND (
                u_company.name ILIKE $2 
                OR u_company.email ILIKE $2 
                OR r.display_name ILIKE $2
            )
            ORDER BY u_company.name ASC
            `,
            [req.params.accessToken, `%${req.params.searchTerm}%`],
        );
        console.log(users.rows);
        res.status(200).json({
            success: true,
            usersData: users.rows,
        });
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
};

export default { CompanyInit, CheckCompanyStatus, GetEmployees, InviteUser, AcceptInvitation, SearchUsers };
