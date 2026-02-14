import dotenv from 'dotenv';

dotenv.config();

//* MySql Config
const MYSQL_HOST = process.env.MYSQL_HOST || '0.0.0.0';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || '_platform_db';
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'root';

const MYSQL = {
    host: MYSQL_HOST,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
};

//* API config
const SERVER_HSOTNAME = process.env.SERVER_HSOTNAME || 'localhost';
const SERVER_PORT = process.env.PORT || 5080;

const SERVER = {
    hostname: SERVER_HSOTNAME,
    port: SERVER_PORT,
};

//* Stripe Config

const STRIPE = {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    apiVersion: '2025-12-15.clover' as const,
};

const config = {
    mysql: MYSQL,
    server: SERVER,
    stripe: STRIPE,
};

export default config;
