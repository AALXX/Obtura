import { Request, Response } from 'express';
import logging from '../config/logging';
import { CustomRequestValidationResult } from '../common/comon';
import db from '../config/postgresql';
import { formatDate } from '../lib/utils';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { getTeamInvitationEmailTemplate } from '../config/HTML_email_Templates';

/**
 * Creates a new team
 * @param {Request} req
 * @param {Response} res
 * @return {Response}
 */
const CreateTeam = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('CREATE-TEAM', error.errorMsg);
        });

        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const { accessToken, teamName, teamDescription } = req.body;

        const region = 'eu-central';

        const baseSlug = teamName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        const randomSuffix = Math.random().toString(36).substr(2, 6);
        const teamSlug = `${baseSlug}-${randomSuffix}`;
        const insertNewTeam = await db.query(
            `INSERT INTO teams (name, team_description, company_id, owner_user_id, data_region, slug) 
   VALUES (
     $1, 
     $2, 
     (SELECT c.id 
      FROM companies c 
      JOIN sessions s ON c.owner_user_id = s.user_id 
      WHERE s.access_token = $3), 
     (SELECT user_id FROM sessions WHERE access_token = $3), 
     $4,
     $5
   ) 
   RETURNING id`,
            [teamName, teamDescription, accessToken, region, teamSlug],
        );
        console.log(insertNewTeam.rows[0]);

        await db.query(
            `INSERT INTO team_members (team_id, user_id) 
   VALUES (
     $1, 
     (SELECT user_id FROM sessions WHERE access_token = $2) 
   )`,
            [insertNewTeam.rows[0].id, accessToken],
        );

        if (!insertNewTeam) {
            return res.status(401).json({
                error: true,
                errmsg: 'Something went wrong',
            });
        }

        res.status(200).json({ id: insertNewTeam.rows[0].id });
    } catch (error) {
        console.error('create team error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

const GetTeams = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('GET-TEAMS', error.errorMsg);
        });

        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const teams = await db.query(
            `
  SELECT 
    t.*, 
    COUNT(tm2.user_id) AS member_count
  FROM teams t
  JOIN team_members tm ON tm.team_id = t.id
  LEFT JOIN team_members tm2 ON tm2.team_id = t.id
  WHERE tm.user_id = (
    SELECT user_id 
    FROM sessions 
    WHERE access_token = $1
  )
  GROUP BY t.id
  `,
            [req.params.accessToken],
        );

        const formatedTeams = teams.rows.map((team) => {
            return {
                id: team.id,
                name: team.name,
                updated_at: formatDate(team.updated_at),
                memberCount: team.member_count,
                is_active: team.is_active,
            };
        });

        res.status(200).json({ teams: formatedTeams });
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

const UpdateTeam = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('REGISTER-USER-WITH-GOOGLE', error.errorMsg);
        });

        return res.status(200).json({ error: true, errors: errors.array() });
    }

    try {
        const { teamId, teamName, teamDescription } = req.body;

        await db.query('UPDATE teams SET name = $1, team_description = $2 WHERE id = $3', [teamName, teamDescription, teamId]);

        res.status(200).json({});
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

const DeleteTeam = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('REGISTER-USER-WITH-GOOGLE', error.errorMsg);
        });

        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        res.status(200).json({});
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
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
                c.name as companyName,
                t.name as teamName,
                u.name as inviterName
            FROM teams t
            JOIN companies c ON c.id = t.company_id
            JOIN sessions s ON s.user_id = (SELECT user_id FROM sessions WHERE access_token = $1 LIMIT 1)
            JOIN users u ON u.id = s.user_id
            WHERE t.id = $2
            LIMIT 1`,
            [req.body.accessToken, req.body.teamId],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Team not found or invalid access' });
        }

        const { companyname, teamname, invitername } = result.rows[0];

        const invitations = req.body.invitations || [];
        console.log(invitations);

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
                    type: 'TEAM_INVITATION',
                    teamId: req.body.teamId,
                    invitedEmail: invitation.email,
                    invitedBy: invitername,
                    role: invitation.roleName,
                    companyName: companyname,
                },
                process.env.TEAM_INVITATION_SECRET as string,
                { expiresIn: '7d' },
            );
            const insertPromises = invitations.map((invitation: { email: string; role: string }) =>
                db.query(
                    'INSERT INTO team_invitations (team_id, email, role, invited_by, created_at) VALUES ($1, $2, (SELECT id FROM roles WHERE name = $3), (SELECT user_id FROM sessions WHERE access_token = $4), NOW())',
                    [req.body.teamId, invitation.email, invitation.role, req.body.accessToken],
                ),
            );
            await Promise.all(insertPromises);

            const inviteLink = `${process.env.FRONTEND_URL}/invitations/${token}`;

            const mailOptions = {
                from: `"Obtura" <${process.env.EMAIL_USERNAME}>`,
                to: invitation.email,
                subject: `${invitername} invited you to join ${teamname} on Obtura`,
                html: getTeamInvitationEmailTemplate(invitation.email, invitername, teamname, companyname, inviteLink, invitation.roleName),
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
            SELECT id, role
            FROM team_invitations
            WHERE team_id = $1
              AND email = $2
              AND status = 'pending'
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [req.body.teamId, email],
        );

        if (invitationResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: 'Invitation not found or already accepted',
            });
        }

        const { id: invitationId, role } = invitationResult.rows[0];

        await client.query(
            `
            INSERT INTO team_members (team_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            `,
            [req.body.teamId, userid],
        );

        const teamResult = await client.query(`SELECT company_id FROM teams WHERE id = $1`, [req.body.teamId]);

        if (teamResult.rowCount === 0) {
            throw new Error('Team not found');
        }

        const companyId = teamResult.rows[0].company_id;

        await client.query(
            `
            INSERT INTO company_users (company_id, user_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (company_id, user_id) DO NOTHING
            `,
            [companyId, userid, role],
        );

        await client.query(
            `
            UPDATE team_invitations
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

const GetTeamData = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('GET-TEAM-DATA', error.errorMsg);
        });

        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const { teamId, accessToken } = req.params;

        const result = await db.query(
            `SELECT 
    u.id,
    u.name, 
    u.email, 
    r.display_name AS roleName,
    t.name AS teamName,
    CASE 
        WHEN u.id = s.user_id THEN true 
        ELSE false 
    END AS is_you,
    CASE
        WHEN r.hierarchy_level < 6 THEN true 
        ELSE false
    END AS can_edit
FROM team_members AS tm 
JOIN users u ON u.id = tm.user_id 
JOIN teams t ON t.id = tm.team_id
JOIN company_users cu ON cu.user_id = u.id
JOIN roles r ON r.id = cu.role
CROSS JOIN sessions s
WHERE tm.team_id = $1 
  AND s.access_token = $2 
  AND s.expires_at > NOW();
`,
            [teamId, accessToken],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Team not found or invalid access token' });
        }

        res.status(200).json({
            members: result.rows,
        });
    } catch (error) {
        console.error('Get team data error:', error);
        res.status(500).json({ error: 'Failed to fetch team data' });
    }
};

const PromoteMember = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('PROMOTE-MEMBER', error.errorMsg);
        });

        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        await db.query('UPDATE team_members SET role=$1 WHERE team_id=$2 AND user_id=$3', [req.body.role, req.body.teamId, req.body.userId]);

        res.status(200).json({ success: true, message: 'Member promoted successfully' });
    } catch (error) {
        console.error('Promote member error:', error);
        res.status(500).json({ error: 'Failed to promote member' });
    }
};

const RemoveMember = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('REMOVE-MEMBER', error.errorMsg);
        });

        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        await db.query('DELETE FROM team_members WHERE team_id=$1 AND user_id=$2', [req.body.teamId, req.body.userId]);

        res.status(200).json({ success: true, message: 'Member removed successfully' });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ error: 'Failed to remove member' });
    }
};

export default {
    CreateTeam,
    GetTeams,
    GetTeamData,
    AcceptInvitation,
    PromoteMember,
    UpdateTeam,
    DeleteTeam,
    RemoveMember,
    InviteUser,
};
