import amqp, { Connection, Channel, Options } from 'amqplib';

interface RabbitMQConfig {
    protocol: string;
    hostname: string;
    port: number;
    username: string;
    password: string;
    vhost: string;
    heartbeat: number;
    frameMax: number;
}

/**
 * Singleton class for RabbitMQ connection
 */
class RabbitMQConnection {
    private static instance: RabbitMQConnection;
    private connection: Connection | null = null;
    private channel: Channel | null = null;
    private isConnecting: boolean = false;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private reconnectAttempts: number = 0;
    private readonly maxReconnectAttempts: number = 10;
    private readonly reconnectDelay: number = 5000; // 5 seconds

    private config: RabbitMQConfig = {
        protocol: process.env.RABBITMQ_PROTOCOL || 'amqp',
        hostname: process.env.RABBITMQ_HOST || 'localhost',
        port: parseInt(process.env.RABBITMQ_PORT || '5672'),
        username: process.env.RABBITMQ_USER || 'guest',
        password: process.env.RABBITMQ_PASSWORD || 'guest',
        vhost: process.env.RABBITMQ_VHOST || '/',
        heartbeat: parseInt(process.env.RABBITMQ_HEARTBEAT || '60'),
        frameMax: parseInt(process.env.RABBITMQ_FRAME_MAX || '0'),
    };

    /**
     * Private constructor to prevent direct instantiation
     */
    private constructor() {}

    /**
     * Singleton instance getter
     * @return {RabbitMQConnection}
     */
    public static getInstance(): RabbitMQConnection {
        if (!RabbitMQConnection.instance) {
            RabbitMQConnection.instance = new RabbitMQConnection();
        }
        return RabbitMQConnection.instance;
    }

    /**
     * Connects to RabbitMQ server
     * @return {Promise<void>}
     */
    public async connect(): Promise<void> {
        if (this.connection || this.isConnecting) {
            return;
        }

        this.isConnecting = true;

        try {
            const connectionUrl = `${this.config.protocol}://${this.config.username}:${this.config.password}@${this.config.hostname}:${this.config.port}${this.config.vhost}`;

            const socketOptions: Options.Connect = {
                heartbeat: this.config.heartbeat,
                ...(this.config.frameMax > 0 && { frameMax: this.config.frameMax }),
            };

            this.connection = await amqp.connect(connectionUrl, socketOptions);
            this.channel = await this.connection.createChannel();

            await this.channel.prefetch(parseInt(process.env.RABBITMQ_PREFETCH || '10'));

            this.setupEventHandlers();
            this.reconnectAttempts = 0;
            this.isConnecting = false;

            console.log('RabbitMQ connected successfully');
        } catch (error) {
            this.isConnecting = false;
            console.error('Failed to connect to RabbitMQ:', error);
            this.scheduleReconnect();
        }
    }

    /**
     * Sets up event handlers for the RabbitMQ connection and channel
     * The event handlers are responsible for handling connection and channel errors,
     * as well as connection and channel closures.
     */
    private setupEventHandlers(): void {
        if (!this.connection || !this.channel) {
            return;
        }

        this.connection.on('error', (err) => {
            console.error('RabbitMQ connection error:', err);
            this.handleConnectionFailure();
        });

        this.connection.on('close', () => {
            console.warn('RabbitMQ connection closed');
            this.handleConnectionFailure();
        });

        this.channel.on('error', (err) => {
            console.error('RabbitMQ channel error:', err);
        });

        this.channel.on('close', () => {
            console.warn('RabbitMQ channel closed');
        });
    }

    /**
     * Handles a RabbitMQ connection failure by setting the connection and channel to null
     * and scheduling a reconnect attempt.
     */
    private handleConnectionFailure(): void {
        this.connection = null;
        this.channel = null;
        this.scheduleReconnect();
    }

    /**
     * Schedules a reconnection attempt to the RabbitMQ server after a failure.
     * The reconnection attempt will be delayed by a time that is proportional to the number of reconnection attempts.
     * If the maximum number of reconnection attempts is reached, the process will exit with an error.
     */
    private scheduleReconnect(): void {
        if (this.reconnectTimeout) {
            return;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached. Exiting process.`);
            process.exit(1);
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;

        console.log(`Scheduling RabbitMQ reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.connect();
        }, delay);
    }

    /**
     * Retrieves the RabbitMQ channel.
     * If the channel does not exist, this method will attempt to connect to the RabbitMQ server
     * and establish a channel.
     * If the channel cannot be established, this method will throw an error.
     * @return {Promise<Channel>} A promise that resolves with the RabbitMQ channel.
     * @throws {Error} If the channel cannot be established.
     */
    public async getChannel(): Promise<Channel> {
        if (!this.channel) {
            await this.connect();
            if (!this.channel) {
                throw new Error('Failed to establish RabbitMQ channel');
            }
        }
        return this.channel;
    }

    /**
     * Closes the RabbitMQ connection and channel gracefully.
     * This method will first cancel any scheduled reconnection attempts,
     * then close the channel and connection if they exist.
     * If any errors occur while closing the connection or channel,
     * they will be logged to the console.
     * @return {Promise<void>} A promise that resolves when the connection and channel have been closed.
     */
    public async close(): Promise<void> {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        try {
            if (this.channel) {
                await this.channel.close();
                this.channel = null;
            }
            if (this.connection) {
                await this.connection.close();
                this.connection = null;
            }
            console.log('RabbitMQ connection closed gracefully');
        } catch (error) {
            console.error('Error closing RabbitMQ connection:', error);
        }
    }

    /**
     * Returns a boolean indicating whether the RabbitMQ connection and channel are established.
     * @return {boolean} True if the connection and channel are established, false otherwise.
     */
    public isConnected(): boolean {
        return this.connection !== null && this.channel !== null;
    }
}

const rabbitmq = RabbitMQConnection.getInstance();

process.on('SIGINT', async () => {
    console.log('SIGINT received, closing RabbitMQ connection...');
    await rabbitmq.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing RabbitMQ connection...');
    await rabbitmq.close();
    process.exit(0);
});

export default rabbitmq;
