// config/redis.ts
import { createClient } from 'redis';

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.error('Redis reconnection failed after 10 retries');
                return new Error('Redis reconnection failed');
            }
            return retries * 100; // reconnect after 100ms, 200ms, 300ms, etc.
        },
    },
});

redisClient.on('connect', () => {
    console.log('Redis client connected');
});

redisClient.on('error', (err) => {
    console.error('Redis client error:', err);
});

redisClient.on('ready', () => {
    console.log('Redis client ready');
});

// Connect immediately
redisClient.connect().catch(console.error);

export default redisClient;
