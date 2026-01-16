import db from '../config/postgresql';
import bcrypt from 'bcrypt';
import { type Request } from 'express';
import gl from 'geoip-lite';

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

export const hashPassword = async (password: string): Promise<string> => {
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
};

export const getDataRegion = (req: Request): string => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.ip || req.socket.remoteAddress;

    const countryCode = req.headers['cf-ipcountry'] || req.headers['cloudfront-viewer-country'];

    if (countryCode) {
        return mapCountryToRegion(countryCode as string);
    }

    const geo = gl.lookup(ip as string);

    if (geo?.country) {
        return mapCountryToRegion(geo.country);
    }

    return 'eu-central';
};

const mapCountryToRegion = (countryCode: string): string => {
    const countryUpper = countryCode.toUpperCase();

    const euCentral = ['DE', 'AT', 'CH', 'PL', 'CZ', 'SK', 'HU', 'SI', 'HR', 'LI'];

    const euWest = ['FR', 'BE', 'NL', 'LU', 'GB', 'IE', 'MC'];

    const euNorth = ['SE', 'NO', 'DK', 'FI', 'IS', 'EE', 'LV', 'LT'];

    if (euCentral.includes(countryUpper)) {
        return 'eu-central';
    } else if (euWest.includes(countryUpper)) {
        return 'eu-west';
    } else if (euNorth.includes(countryUpper)) {
        return 'eu-north';
    }

    return 'eu-central';
};

export const normalizeServiceName = (path: string): string => {
    if (path === '.' || path === '') {
        return 'app';
    }

    let name = path.replace(/^[./]+|[./]+$/g, '');

    name = name.replace(/[^a-zA-Z0-9-_]+/g, '-');

    name = name.replace(/-+/g, '-');

    name = name.replace(/^-+|-+$/g, '');

    console.log(`Normalizing ${path} to ${name}`);

    return name.toLowerCase();
};
