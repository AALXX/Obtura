import { type Request, type Response } from 'express';
import logging from '../config/logging';
import { stripe } from '../config/stripe';
import db from '../config/postgresql';
import { getCompanyIdFromSessionToken, getUserIdFromSessionToken, mapStripeStatus } from '../lib/utils';
import { get } from 'node:http';

// export async function getSubscription(req: Request, res: Response) {
//     try {

//         // Get or create customer
//         let subscription = await subscriptionRepo.findSubscriptionByUserId(userId);
//         let customerId = subscription?.stripeCustomerId;

//         if (!customerId) {
//             const user = await prisma.user.findUnique({
//                 where: { id: userId },
//             });

//             if (!user) {
//                 throw new Error('User not found');
//             }

//             const customer = await stripeService.createStripeCustomer(userId, user.email, user.name);
//             customerId = customer.id;
//             subscription = await subscriptionRepo.findSubscriptionByUserId(userId);
//         }

//         // Create Stripe subscription
//         const stripeSubscription = await stripeService.createStripeSubscription(customerId, priceId, paymentMethodId);

//         const tier = getTierFromPriceId(priceId);

//         // Update subscription in database
//         await subscriptionRepo.updateSubscriptionByUserId(userId, {
//             stripeSubscriptionId: stripeSubscription.id,
//             stripePriceId: priceId,
//             tier,
//             status: stripeSubscription.status as any,
//             currentPeriodStart: timestampToDate(stripeSubscription.current_period_start),
//             currentPeriodEnd: timestampToDate(stripeSubscription.current_period_end),
//             trialEnd: stripeSubscription.trial_end ? timestampToDate(stripeSubscription.trial_end) : null,
//         });

//         // Publish event
//         await publishEvent('subscription.created', {
//             userId,
//             tier,
//             subscriptionId: stripeSubscription.id,
//         });

//         // logging.info('Subscription created', { userId, tier });

//         res.json(subscription);
//     } catch (error: any) {
//         logging.error('Error getting subscription:', error);
//         res.status(500).json({ error: error.message });
//     }
// }

const createSubscription = async (req: Request, res: Response) => {
    const client = await db.connect();

    try {
        const { companyId, email, companyName, planId, paymentMethodId, address, vatNumber, dataRegion, userRole, accessToken } = req.body;

        const userId = await getUserIdFromSessionToken(accessToken);

        if (!userId) {
            logging.error('CREATE SUBSCRIPTION', 'Invalid access token');
            return res.status(401).json({
                error: 'Invalid access token',
            });
        }

        const planResult = await client.query('SELECT id, name, stripe_price_id FROM subscription_plans WHERE id = $1', [planId]);

        if (planResult.rows.length === 0) {
            logging.error('CREATE SUBSCRIPTION', `Subscription plan not found: ${planId}`);
            return res.status(400).json({
                error: `Subscription plan not found: ${planId}`,
            });
        }

        const planDetails = planResult.rows[0];
        const stripePriceId = planDetails.stripe_price_id;

        if (!stripePriceId) {
            logging.error('CREATE SUBSCRIPTION', `Stripe price ID not configured for plan: ${planId}`);
            return res.status(400).json({
                error: `Stripe price ID not configured for plan: ${planId}`,
            });
        }

        let customer;
        try {
            const existingCustomers = await stripe.customers.list({
                email: email,
                limit: 1,
            });

            if (existingCustomers.data.length > 0) {
                customer = existingCustomers.data[0];

                try {
                    await stripe.paymentMethods.attach(paymentMethodId, {
                        customer: customer!.id,
                    });
                } catch (attachError: any) {
                    if (attachError.code !== 'resource_already_exists') {
                        throw attachError;
                    }
                }

                await stripe.customers.update(customer!.id, {
                    invoice_settings: {
                        default_payment_method: paymentMethodId,
                    },
                    name: companyName,
                    address: address
                        ? {
                              line1: address.line1,
                              city: address.city,
                              country: address.country,
                              postal_code: address.postalCode,
                              state: address.state,
                          }
                        : null,
                    metadata: {
                        company_id: companyId,
                        vat_number: vatNumber,
                    },
                });
            } else {
                customer = await stripe.customers.create({
                    email: email,
                    name: companyName,
                    payment_method: paymentMethodId,
                    invoice_settings: {
                        default_payment_method: paymentMethodId,
                    },
                    address: address
                        ? {
                              line1: address.line1,
                              city: address.city,
                              country: address.country,
                              postal_code: address.postalCode,
                              state: address.state,
                          }
                        : null,
                    metadata: {
                        company_id: companyId,
                        vat_number: vatNumber || '',
                    },
                });
            }
        } catch (error: any) {
            logging.error('STRIPE-CUSTOMER-ERROR', error.message);
            return res.status(500).json({
                error: 'Failed to create/retrieve Stripe customer',
                details: error.message,
            });
        }

        let subscription;
        try {
            subscription = await stripe.subscriptions.create({
                customer: customer!.id,
                items: [
                    {
                        price: stripePriceId,
                    },
                ],
                default_payment_method: paymentMethodId,
                payment_behavior: 'error_if_incomplete', // This will attempt payment immediately
                payment_settings: {
                    payment_method_types: ['card'],
                    save_default_payment_method: 'on_subscription',
                },
                expand: ['latest_invoice.payment_intent'],
                metadata: {
                    company_id: companyId,
                    plan_id: planId,
                },
            });
        } catch (error: any) {
            logging.error('STRIPE-SUBSCRIPTION-ERROR', error.message);

            if (error.code === 'resource_missing' || error.type === 'card_error') {
                return res.status(400).json({
                    error: 'Payment failed',
                    details: error.message,
                    decline_code: error.decline_code,
                });
            }

            return res.status(500).json({
                error: 'Failed to create Stripe subscription',
                details: error.message,
            });
        }

        await client.query('BEGIN');

        try {
            const priceDetails = await stripe.prices.retrieve(stripePriceId);
            const billingCycle = priceDetails.recurring?.interval === 'month' ? 'monthly' : 'annually';

            const currentPeriodStart = new Date(subscription.start_date * 1000);
            const currentPeriodEnd = new Date(currentPeriodStart);

            if (billingCycle === 'monthly') {
                currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
            } else {
                currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
            }

            const nextPaymentAt = currentPeriodEnd;

            const dbStatus = mapStripeStatus(subscription.status);

            const teamResult = await client.query(
                `INSERT INTO teams (company_id, owner_user_id, name, slug, data_region, is_active)
                VALUES ($1, $2, 'Default Team', 'default', $3, true)
                RETURNING id`,
                [companyId, userId, dataRegion || 'us-east-1'],
            );

            const teamId = teamResult.rows[0].id;

            await client.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [teamId, userId]);

            await client.query(
                `INSERT INTO company_users (company_id, user_id, role)
                VALUES ($1, $2, (SELECT id FROM roles WHERE name = $3))
                ON CONFLICT (company_id, user_id) DO UPDATE SET role = (SELECT id FROM roles WHERE name = $3)`,
                [companyId, userId, userRole || 'owner'],
            );

            // Calculate reset timestamps
            const now = new Date();
            const buildsHourReset = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
            const buildsDayReset = new Date(now);
            buildsDayReset.setHours(24, 0, 0, 0); // Next midnight
            const buildsMonthReset = new Date(now.getFullYear(), now.getMonth() + 1, 1); // First day of next month
            const bandwidthReset = buildsMonthReset;

            // Insert subscription into database with mapped status
            await client.query(
                `INSERT INTO subscriptions (
                    company_id,
                    plan_id,
                    status,
                    billing_cycle,
                    current_period_start,
                    current_period_end,
                    stripe_price_id,
                    stripe_customer_id,
                    stripe_subscription_id,
                    stripe_payment_method_id,
                    next_payment_at,
                    builds_hour_reset_at,
                    builds_day_reset_at,
                    builds_month_reset_at,
                    bandwidth_reset_at,
                    created_at,
                    updated_at,
                    last_usage_reset_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW(), NOW())`,
                [companyId, planId, dbStatus, billingCycle, currentPeriodStart, currentPeriodEnd, stripePriceId, customer!.id, subscription.id, paymentMethodId, nextPaymentAt, buildsHourReset, buildsDayReset, buildsMonthReset, bandwidthReset],
            );

            await client.query('UPDATE companies SET status = $1 WHERE id = $2', ['active', companyId]);

            await client.query('COMMIT');
            logging.info('SUBSCRIPTION-CREATED', `Subscription ${subscription.id} created successfully for company ${companyId}`);

            const invoice = subscription.latest_invoice as any;
            const paymentIntent = invoice?.payment_intent;
            const clientSecret = paymentIntent?.client_secret || null;

            res.status(200).json({
                success: true,
                customerId: customer!.id,
                subscriptionId: subscription.id,
                paymentMethodId: paymentMethodId,
                status: subscription.status,
                currentPeriodStart: currentPeriodStart,
                currentPeriodEnd: currentPeriodEnd,
                clientSecret: clientSecret,
                requiresAction: subscription.status === 'incomplete' && paymentIntent?.status === 'requires_action',
            });
        } catch (dbError: any) {
            await client.query('ROLLBACK');

            try {
                await stripe.subscriptions.cancel(subscription.id);
                logging.info('STRIPE-SUBSCRIPTION-CANCELED', `Canceled subscription ${subscription.id} due to database error`);
            } catch (cancelError: any) {
                logging.error('STRIPE-CANCEL-ERROR', `Failed to cancel subscription ${subscription.id}: ${cancelError.message}`);
            }

            logging.error('DATABASE-ERROR', dbError.message);
            return res.status(500).json({
                error: 'Failed to create subscription in database',
                details: dbError.message,
            });
        }
    } catch (error: any) {
        logging.error('CREATE-SUBSCRIPTION-ERROR', error.message);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message,
        });
    } finally {
        client.release();
    }
};

// export async function updateSubscription(req: Request, res: Response) {
//     try {
//         const { userId, newPriceId } = req.body;
//         const result = await subscriptionService.updateSubscription({
//             userId,
//             newPriceId,
//         });
//         res.json(result);
//     } catch (error: any) {
//         logging.error('Error updating subscription:', error);
//         res.status(500).json({ error: error.message });
//     }
// }

// export async function cancelSubscription(req: Request, res: Response) {
//     try {
//         const { userId, immediately } = req.body;
//         const result = await subscriptionService.cancelSubscription({
//             userId,
//             immediately,
//         });
//         res.json(result);
//     } catch (error: any) {
//         logging.error('Error canceling subscription:', error);
//         res.status(500).json({ error: error.message });
//     }
// }

// export async function createPortalSession(req: Request, res: Response) {
//     try {
//         const { userId, returnUrl } = req.body;
//         const session = await subscriptionService.createPortalSession(userId, returnUrl);
//         res.json(session);
//     } catch (error: any) {
//         logging.error('Error creating portal session:', error);
//         res.status(500).json({ error: error.message });
//     }
// }

export { createSubscription };
