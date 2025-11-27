import express, { NextFunction } from 'express';
import http from 'http';
import cors from 'cors';

import UserAccountManager from './routes/UserAccountManagerRoutes';
import config from './config/config';
import logging from './config/logging';

const NAMESPACE = 'CoreAPI';
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const allowedOrigins = ['http://localhost:3000', 'http://localhost'];
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

const httpServer = http.createServer(app);
httpServer.listen(config.server.port, () => {
    logging.info(NAMESPACE, `API running on http://${config.server.hostname}:${config.server.port}`);
});
