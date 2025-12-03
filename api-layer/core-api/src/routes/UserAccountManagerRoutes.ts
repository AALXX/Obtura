import express from 'express';
import { body, param } from 'express-validator';

import AccountRegistrationServices from '../Services/UserAccountServces/RegstratonServces';
import UserAccountServices from '../Services/UserAccountServces/UserAccountData';

const router = express.Router();

router.post('/register-account-google', body('idToken').not().isEmpty(), body('accessToken').not().isEmpty(), body('user').not().isEmpty(), AccountRegistrationServices.RegisterUserWithGoogle);

router.get('/check-company-status/:accessToken', body('accessToken').not().isEmpty(), AccountRegistrationServices.CheckCompanyStatus);

// In your routes file
router.post(
    '/complete-company-setup',
    [
        body('companyName').notEmpty().withMessage('Company name is required'),
        body('companySize').notEmpty().withMessage('Company size is required'),
        body('accessToken').notEmpty().withMessage('Access token is required'),
        body('userRole').notEmpty().withMessage('User role is required'),
        body('subscriptionPlan').optional().isIn(['starter', 'professional', 'business', 'enterprise']).withMessage('Invalid subscription plan'),
    ],
    AccountRegistrationServices.CompleteCompanySetup,
);

// router.post('/register-account', body('userName').not().isEmpty(), body('userEmail').isEmail().not().isEmpty(), body('password').isLength({ min: 4 }).not().isEmpty().trim(), AccountServices.RegisterUser);

// router.post('/login-account', body('userEmail').isEmail().not().isEmpty(), body('password').isLength({ min: 6 }).not().isEmpty().trim(), AccountServices.LoginUser);

router.post('/logout', body('accessToken').not().isEmpty(), AccountRegistrationServices.LogoutUser);

router.get('/get-account-data/:accessToken', param('accessToken').not().isEmpty(), UserAccountServices.GetUserAccountData);

router.put('/change-user-data', body('name').not().isEmpty(), body('accessToken').not().isEmpty().isString(), UserAccountServices.ChangeUserData);

router.post('/get-change-email-link', body('accessToken').not().isEmpty(), UserAccountServices.GetChangeEmailLink);

router.post('/change-email', body('accessToken').not().isEmpty(), body('token').not().isEmpty().trim(), body('newEmail').isEmail().not().isEmpty(), UserAccountServices.ChangeUserEmail);

router.post('/get-change-password-link', body('accessToken').not().isEmpty(), UserAccountServices.GetChangePasswordLink);

router.post('/change-password', body('accessToken').not().isEmpty(), body('token').not().isEmpty().trim(), body('newPassword').isLength({ min: 6 }).not().isEmpty().trim(), UserAccountServices.ChangeUserPassword);

router.delete('/delete-user-account', body('accessToken').not().isEmpty(), UserAccountServices.DeleteUserAccount);

// TODO IMPLEMENT IT IF NECESSARY
// router.post('/change-user-icon', UserAccountServices.ChangeUserIcon);

export = router;
