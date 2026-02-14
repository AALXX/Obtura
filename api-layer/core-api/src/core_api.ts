import express, { type NextFunction } from 'express';
import http from 'http';
import cors from 'cors';

import UserAccountManager from './routes/UserAccountManagerRoutes';
import TeamManager from './routes/TeamManagerRoutes';
import CompanyManager from './routes/CompanyManagerRoutes';
import ProjectManager from './routes/ProjectsManagerRoutes';
import GithubRoutes from './routes/GithubRoutes';
import config from './config/config';
import logging from './config/logging';
import redisClient from './config/redis';

const NAMESPACE = 'CoreAPI';
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const allowedOrigins = ['http://localhost:3000', 'http://localhost', 'https://s3rbvn.org'];
app.use(
    cors({
        origin: allowedOrigins,
        credentials: true,
    }),
);

app.use((req, res, next) => {
    logging.info(NAMESPACE, `${req.method} ${req.url}`);
    next();
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

app.use('/account-manager', UserAccountManager);
app.use('/teams-manager', TeamManager);
app.use('/company-manager', CompanyManager);
app.use('/projects-manager', ProjectManager);
app.use('/github', GithubRoutes);

app.use((req, res, next: NextFunction) => {
    const error = new Error('Not Found');
    return res.status(404).json({ message: error.message });
});

app.use((err: any, req: any, res: any, next: NextFunction) => {
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    logging.error(NAMESPACE, `${req.method} ${req.url} - ${message}`);
    res.status(status).json({ message });
});

process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing Redis connection...');
    await redisClient.quit();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, closing Redis connection...');
    await redisClient.quit();
    process.exit(0);
});

const httpServer = http.createServer(app);
httpServer.listen(config.server.port, () => {
    logging.info(NAMESPACE, `API running on http://${config.server.hostname}:${config.server.port}`);
});
