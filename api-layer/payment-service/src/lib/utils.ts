import db from '../config/postgresql';

export const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
};

export const getUserIdFromSessionToken = async (sessionToken: string): Promise<string | null> => {
    try {
        const session = await db.query('SELECT user_id FROM sessions WHERE access_token = $1', [sessionToken]);
        if (session.rows.length === 0) {
            return null;
        }

        return session.rows[0].user_id;
    } catch (error) {
        return null;
    }
};

export const getCompanyIdFromSessionToken = async (sessionToken: string): Promise<string | null> => {
    try {
        const session = await db.query('SELECT company_id FROM company_users WHERE user_id = (SELECT user_id FROM sessions WHERE access_token = $1)', [sessionToken]);
        if (session.rows.length === 0) {
            return null;
        }

        return session.rows[0].company_id;
    } catch (error) {
        return null;
    }
};

export const mapStripeStatus = (stripeStatus: string): string => {
    const statusMap: Record<string, string> = {
        incomplete: 'pending',
        incomplete_expired: 'expired',
        trialing: 'trial',
        active: 'active',
        past_due: 'past_due',
        canceled: 'canceled',
        unpaid: 'unpaid',
    };

    return statusMap[stripeStatus] || 'pending';
};