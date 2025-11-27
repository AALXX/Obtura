import express from 'express';
import { body, param } from 'express-validator';

import AccountServices from '../Services/UserAccountServces/RegstratonServces';
import UserAccountServices from '../Services/UserAccountServces/UserAccountData';

const router = express.Router();

//* Owner Account data
router.post('/register-account-google', body('idToken').not().isEmpty(), body('accessToken').not().isEmpty(), body('user').not().isEmpty(), AccountServices.RegisterUserWithGoogle);

// router.post('/register-account', body('userName').not().isEmpty(), body('userEmail').isEmail().not().isEmpty(), body('password').isLength({ min: 4 }).not().isEmpty().trim(), AccountServices.RegisterUser);

// router.post('/login-account', body('userEmail').isEmail().not().isEmpty(), body('password').isLength({ min: 6 }).not().isEmpty().trim(), AccountServices.LoginUser);

// router.post('/logout', body('userSessionToken').not().isEmpty(), AccountServices.LogoutUser);

router.get('/get-account-data/:accessToken', param('accessToken').not().isEmpty(), UserAccountServices.GetUserAccountData);

// router.get('/get-all-user-projects/:accountSessionToken', param('accountSessionToken').not().isEmpty(), AccountServices.GetAllUserProjects);

// router.post('/change-user-data', body('userName').not().isEmpty(), body('userDescription'), body('userSessionToken').not().isEmpty(), AccountServices.ChangeUserData);

// router.post('/get-change-email-link', body('userSessionToken').not().isEmpty(), AccountServices.GetChangeEmailLink);

// router.post('/change-email', body('userSessionToken').not().isEmpty(), body('token').not().isEmpty().trim(), body('newEmail').isEmail().not().isEmpty(), AccountServices.ChangeUserEmail);

// router.post('/get-change-password-link', body('userSessionToken').not().isEmpty(), AccountServices.GetChangePasswordLink);

// router.post('/change-password', body('userSessionToken').not().isEmpty(), body('token').not().isEmpty().trim(), body('newPassword').isLength({ min: 6 }).not().isEmpty().trim(), AccountServices.ChangeUserPassword);

// router.post(
//     '/change-user-password',
//     body('userSessionToken').not().isEmpty(),
//     body('oldPassword').isLength({ min: 6 }).not().isEmpty().trim(),
//     body('newPassword').isLength({ min: 6 }).not().isEmpty().trim(),
//     AccountServices.ChangeUserPassword,
// );

// router.post('/delete-user-account', body('userToken').not().isEmpty(), OwnerAccountServices.DeleteUserAccount);

// router.post('/change-user-icon', OwnerAccountServices.ChangeUserIcon);

export = router;
