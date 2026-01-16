import { Router } from 'express';
import { rawBodyMiddleware } from '../middleware/raw-body.middleware';
import * as webhookController from '../controllers/webhook.controller';

export const webhookRouter = Router();

webhookRouter.post('/stripe', rawBodyMiddleware, webhookController.handleStripeWebhook);
