import express, { type NextFunction } from 'express';
import http from 'http';
import cors from 'cors';

import PaymentRoutes from './routes/subscriptionRoutes'

import config from './config/config';
import logging from './config/logging';
import redisClient from './config/redis';

const NAMESPACE = 'PaymentService';
const app = express();

// app.use('/webhooks', webhookRouter);

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

app.use('/payments', PaymentRoutes);

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'payment-service',
        timestamp: new Date().toISOString(),
    });
});

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
