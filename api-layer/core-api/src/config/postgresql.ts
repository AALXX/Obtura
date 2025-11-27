import { Pool } from 'pg';

const pool = new Pool({
    host: process.env.POSTGRESQL_HOST || '0.0.0.0',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRESQL_USER || 'postgres',
    password: process.env.POSTGRESQL_PASSWORD || 'postgres',
    database: process.env.POSTGRESQL_DATABASE || 'platform_db',
    max: 20, // maximum number of connections
    idleTimeoutMillis: 30000, // close idle clients after 30s
    connectionTimeoutMillis: 2000, // return error after 2s if cannot connect
});

pool.on('connect', () => {
    console.log('Postgres pool connected');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

export default pool;
