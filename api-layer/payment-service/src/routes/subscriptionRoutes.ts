import express from 'express';
import { createSubscription } from '../services/subscriptionServices';
import { body } from 'express-validator';

const router = express.Router();

// router.get('/subscription/:userId', subscriptionController.getSubscription);

router.post(
    '/create-subscription',
    body('companyId').not().isEmpty().withMessage('User ID is required'),
    body('email').not().isEmpty().withMessage('Price ID is required'),
    body(' companyName').not().isEmpty().withMessage('Price ID is required'),
    body('planId').not().isEmpty().withMessage('Price ID is required'),
    body('paymentMethodId').not().isEmpty().withMessage('PaymentMethod Id is required'),
    body('address').not().isEmpty().withMessage('Address is required'),
    body('vatNumber').not().isEmpty().withMessage('VAT number is required'),
    body('dataRegion').not().isEmpty().withMessage('Data region is required'),
    body('accessToken').not().isEmpty().withMessage('access token is required'),

    createSubscription,
);

// router.post('/subscription/update', subscriptionController.updateSubscription);

// router.post('/subscription/cancel', subscriptionController.cancelSubscription);

// // Invoice routes
// router.get('/invoices/:userId', invoiceController.getInvoices);

export default router;
