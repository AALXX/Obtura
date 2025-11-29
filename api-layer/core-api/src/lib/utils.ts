import db from '../config/postgresql';
import bcrypt from 'bcrypt';

export const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
};

export const getUserIdFromSessionToken = async (sessionToken: string): Promise<string | null> => {
    try {
        const session = await db.query('SELECT user_id FROM sessions WHERE session_token = $1', [sessionToken]);
        if (session.rows.length === 0) {
            return null;
        }

        return session.rows[0].user_id;
    } catch (error) {
        return null;
    }
};

export const hashPassword = async (password: string): Promise<string> => {
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
};
