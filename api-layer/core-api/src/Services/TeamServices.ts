import { type Request, type Response } from 'express';
import logging from '../config/logging';
import { CustomRequestValidationResult } from '../common/comon';
import db from '../config/postgresql';
import { formatDate } from '../lib/utils';

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

const AddTeamMembers = async (req: Request, res: Response) => {
    const errors = CustomRequestValidationResult(req);
    if (!errors.isEmpty()) {
        errors.array().map((error) => {
            logging.error('ADD-TEAM-MEMBER', error.errorMsg);
        });

        return res.status(401).json({ error: true, errors: errors.array() });
    }

    try {
        const members = req.body.members || [];
        const membersPromises = members.map(async (member: { id: string }) => {
            await db.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [req.body.teamId, member.id]);
        });

        await Promise.all(membersPromises);

        res.status(200).json({ success: true, message: 'Member added successfully' });
    } catch (error) {
        console.error('Add team member error:', error);
        res.status(500).json({ error: 'Failed to add member' });
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
    PromoteMember,
    UpdateTeam,
    DeleteTeam,
    RemoveMember,
    AddTeamMembers,
};
