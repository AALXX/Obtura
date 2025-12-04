import express from 'express';
import { body, param } from 'express-validator';

import TeamServices from '../Services/TeamServices';

const router = express.Router();

router.post('/create-team', body('accessToken').not().isEmpty(), body('teamName').not().isEmpty(), body('teamDescription'), TeamServices.CreateTeam);

router.get('/get-teams/:accessToken', param('accessToken').not().isEmpty(), TeamServices.GetTeams);
router.put('/update-team', body('accessToken').not().isEmpty(), body('teamId').not().isEmpty(), body('teamName').not().isEmpty(), body('teamDescription').not().isEmpty(), TeamServices.UpdateTeam);

router.post('/invite-user', body('accessToken').not().isEmpty(), body('userEmail').not().isEmpty(), body('teamId').not().isEmpty(), body('role').not().isEmpty(), TeamServices.InviteUser);

router.delete('/delete-team', body('accessToken').not().isEmpty(), body('teamId').not().isEmpty(), TeamServices.DeleteTeam);

export = router;
