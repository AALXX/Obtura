import { Request, Response } from 'express';
import logging from '../config/logging';
import { CustomRequestValidationResult } from '../common/comon';
import db from '../config/postgresql';
import { formatDate, getDataRegion } from '../lib/utils';
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

        const region = getDataRegion(req);

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

        await db.query(
            `INSERT INTO team_members (team_id, user_id, role) 
   VALUES (
     $1, 
     (SELECT user_id FROM sessions WHERE access_token = $2), 
     'owner'
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
            `SELECT 
    t.*, 
    COUNT(tm.user_id) as member_count
  FROM teams t
  LEFT JOIN team_members tm ON t.id = tm.team_id
  WHERE t.owner_user_id = (
    SELECT user_id 
    FROM sessions 
    WHERE access_token = $1
  )
  GROUP BY t.id`,
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

        const token = jwt.sign(
            {
                type: 'TEAM_INVITATION',
                teamId: req.body.teamId,
                invitedEmail: req.body.userEmail,
                invitedBy: invitername,
                role: req.body.role,
                companyName: companyname,
            },
            process.env.CHANGE_GMAIL_SECRET as string,
            { expiresIn: '7d' },
        );

        const inviteLink = `${process.env.FRONTEND_URL}/invitations/${token}`;

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USERNAME,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: `"Obtura" <${process.env.EMAIL_USERNAME}>`,
            to: req.body.userEmail,
            subject: `${invitername} invited you to join ${teamname} on Obtura`,
            html: getTeamInvitationEmailTemplate(req.body.userEmail, invitername, teamname, companyname, inviteLink),
        };

        await transporter.sendMail(mailOptions);

        // TODO: Add team_invitations
        // await db.query(
        //     'INSERT INTO team_invitations (team_id, email, invited_by, created_at) VALUES ($1, $2, $3, $4, NOW())',
        //     [req.body.teamId, req.body.userEmail, token, inviter_name]
        // );

        res.status(200).json({ success: true, message: 'Invitation sent successfully' });
    } catch (error) {
        console.error('Invite user error:', error);
        res.status(500).json({ error: 'Failed to send invitation' });
    }
};

export default {
    CreateTeam,
    GetTeams,
    UpdateTeam,
    DeleteTeam,
    InviteUser,
};
