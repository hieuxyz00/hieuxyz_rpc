import WebSocket from 'ws';
import * as zlib from 'zlib';
import { logger } from '../utils/logger';
import { ClientProperties, getIdentifyPayload } from './entities/identify';
import { OpCode } from './entities/OpCode';
import { GatewayPayload, PresenceUpdatePayload, DiscordUser } from './entities/types';

interface DiscordWebSocketOptions {
    alwaysReconnect: boolean;
    properties?: ClientProperties;
    connectionTimeout?: number;
}

/**
 * Manage WebSocket connections to Discord Gateway.
 * Handles low-level operations like heartbeating, identifying, and resuming.
 */
export class DiscordWebSocket {
    private token: string;
    private ws: WebSocket | null = null;
    private sequence: number | null = null;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private heartbeatIntervalValue: number = 0;
    private sessionId: string | null = null;
    private resumeGatewayUrl: string | null = null;
    private options: DiscordWebSocketOptions;
    private isReconnecting: boolean = false;
    private permanentClose: boolean = false;
    private connectTimeout: NodeJS.Timeout | null = null;
    private resolveReady: (user: DiscordUser) => void = () => {};
    private lastHeartbeatAck: boolean = true;

    /**
     * Current logged in user info.
     */
    public user: DiscordUser | null = null;

    /**
     * A promise will be resolved when the Gateway connection is ready.
     * and received the READY event.
     */
    public readyPromise: Promise<DiscordUser>;

    /**
     * Create a DiscordWebSocket instance.
     * @param {string} token - Discord user token for authentication.
     * @param {DiscordWebSocketOptions} options - Configuration options for the WebSocket client.
     * @throws {Error} If the token is invalid.
     */
    constructor(token: string, options: DiscordWebSocketOptions) {
        if (!this.isTokenValid(token)) {
            throw new Error('Invalid token provided.');
        }
        this.token = token;
        this.options = {
            alwaysReconnect: options.alwaysReconnect ?? false,
            properties: options.properties,
            connectionTimeout: options.connectionTimeout ?? 30000,
        };
        this.readyPromise = new Promise<DiscordUser>((resolve) => (this.resolveReady = resolve));
    }

    private resetReadyPromise() {
        this.readyPromise = new Promise<DiscordUser>((resolve) => (this.resolveReady = resolve));
    }

    private isTokenValid(token: string): boolean {
        return token.split('.').length >= 3;
    }

    /**
     * Initiate connection to Discord Gateway.
     * If there was a previous session, it will try to resume.
     */
    public connect() {
        if (this.isReconnecting) {
            logger.info('Connection attempt aborted: reconnection already in progress.');
            return;
        }
        this.permanentClose = false;
        this.isReconnecting = true;
        this.resetReadyPromise();
        const url = this.resumeGatewayUrl || 'wss://gateway.discord.gg/?v=10&encoding=json';

        logger.info(`Attempting to connect to ${url}...`);
        this.ws = new WebSocket(url);

        this.connectTimeout = setTimeout(() => {
            logger.error('Connection timed out. Terminating connection attempt.');
            if (this.ws) {
                this.ws.terminate();
            }
        }, this.options.connectionTimeout);

        this.ws.on('open', () => {
            logger.info(`Successfully connected to Discord Gateway at ${url}.`);
            this.isReconnecting = false;
            if (this.connectTimeout) {
                clearTimeout(this.connectTimeout);
                this.connectTimeout = null;
            }
        });

        this.ws.on('message', this.onMessage.bind(this));
        this.ws.on('close', this.handleClose.bind(this));
        this.ws.on('error', (err) => {
            if (err.message !== 'WebSocket was closed before the connection was established') {
                logger.error(`WebSocket Error: ${err.message}`);
            }
        });
    }

    private handleClose(code: number, reason: Buffer) {
        logger.warn(`Connection closed: ${code} - ${reason.toString('utf-8')}`);
        this.cleanupHeartbeat();
        if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
        }
        this.isReconnecting = false;
        if (code === 4004 || code === 4999) {
            this.sessionId = null;
            this.sequence = null;
            this.resumeGatewayUrl = null;
        }
        if (this.permanentClose) {
            logger.info('Connection permanently closed by client. Not reconnecting.');
            return;
        }
        if (this.shouldReconnect(code)) {
            logger.info('Attempting to reconnect in 5 seconds...');
            setTimeout(() => this.connect(), 5000);
        } else {
            logger.info('Not attempting to reconnect based on close code and client options.');
        }
    }

    private onMessage(data: WebSocket.RawData, isBinary: boolean) {
        let decompressedData: string;
        if (isBinary) {
            decompressedData = zlib.inflateSync(data as Buffer).toString('utf-8');
        } else {
            decompressedData = data.toString('utf-8');
        }

        const payload: GatewayPayload = JSON.parse(decompressedData);

        if (payload.s) {
            this.sequence = payload.s;
        }

        switch (payload.op) {
            case OpCode.HELLO:
                if (this.connectTimeout) {
                    clearTimeout(this.connectTimeout);
                    this.connectTimeout = null;
                }
                this.heartbeatIntervalValue = payload.d.heartbeat_interval;
                logger.info(`Received HELLO. Setting heartbeat interval to ${this.heartbeatIntervalValue}ms.`);
                this.startHeartbeating();
                if (this.sessionId && this.sequence) {
                    this.resume();
                } else {
                    this.identify();
                }
                break;

            case OpCode.DISPATCH:
                if (payload.t === 'READY') {
                    this.sessionId = payload.d.session_id;
                    this.resumeGatewayUrl = payload.d.resume_gateway_url + '/?v=10&encoding=json';
                    this.user = payload.d.user as DiscordUser;

                    logger.info(`Session READY. Session ID: ${this.sessionId}. Resume URL set.`);
                    this.resolveReady(this.user);
                } else if (payload.t === 'RESUMED') {
                    logger.info('The session has been successfully resumed.');
                    if (this.user) {
                        this.resolveReady(this.user);
                    }
                }
                break;

            case OpCode.HEARTBEAT_ACK:
                logger.info('Heartbeat acknowledged.');
                this.lastHeartbeatAck = true;
                break;

            case OpCode.INVALID_SESSION:
                logger.warn(`Received INVALID_SESSION. Resumable: ${payload.d}`);
                if (payload.d) {
                    this.ws?.close(4000, 'Invalid session, attempting to resume.');
                } else {
                    this.sessionId = null;
                    this.sequence = null;
                    this.ws?.close(4004, 'Invalid session, starting a new session.');
                }
                break;

            case OpCode.RECONNECT:
                logger.info('Gateway requested RECONNECT. Closing to reconnect and resume.');
                this.ws?.close(4000, 'Gateway requested reconnect.');
                break;

            default:
                break;
        }
    }

    private startHeartbeating() {
        this.cleanupHeartbeat();
        this.lastHeartbeatAck = true;
        setTimeout(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.sendHeartbeat();
            }

            this.heartbeatInterval = setInterval(() => {
                if (!this.lastHeartbeatAck) {
                    logger.warn('Heartbeat ACK missing. Connection is zombie. Terminating to resume...');
                    this.ws?.terminate();
                    return;
                }

                if (this.ws?.readyState !== WebSocket.OPEN) {
                    logger.warn('Heartbeat skipped: WebSocket is not open.');
                    this.cleanupHeartbeat();
                    return;
                }

                this.lastHeartbeatAck = false;
                this.sendHeartbeat();
            }, this.heartbeatIntervalValue);
        }, this.heartbeatIntervalValue * Math.random());
    }

    private sendHeartbeat() {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        this.sendJson({ op: OpCode.HEARTBEAT, d: this.sequence });
        logger.info(`Heartbeat sent with sequence ${this.sequence}.`);
    }

    private identify() {
        const identifyPayload = getIdentifyPayload(this.token, this.options.properties);
        this.sendJson({ op: OpCode.IDENTIFY, d: identifyPayload });
        logger.info('Identify payload sent.');
    }

    private resume() {
        if (!this.sessionId || this.sequence === null) {
            logger.error('Attempted to resume without session ID or sequence. Falling back to identify.');
            this.identify();
            return;
        }
        const resumePayload = {
            token: this.token,
            session_id: this.sessionId,
            seq: this.sequence,
        };
        this.sendJson({ op: OpCode.RESUME, d: resumePayload });
        logger.info('Resume payload sent.');
    }

    /**
     * Send presence update payload to Gateway.
     * @param {PresenceUpdatePayload} presence - Payload update status to send.
     */
    public sendActivity(presence: PresenceUpdatePayload) {
        this.sendJson({ op: OpCode.PRESENCE_UPDATE, d: presence });
        logger.info('Presence update sent.');
    }

    private sendJson(data: any) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            logger.warn('Attempted to send data while WebSocket was not open.');
        }
    }

    /**
     * Closes the WebSocket connection.
     * @param {boolean} force If true, prevents any automatic reconnection attempts.
     */
    public close(force: boolean = false): void {
        if (force) {
            logger.info('Forcing permanent closure. Reconnects will be disabled.');
            this.permanentClose = true;
        } else {
            logger.info('Closing connection manually...');
        }

        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close(1000, 'Client initiated closure');
            } else {
                this.ws.terminate();
            }
        }
    }

    private cleanupHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private shouldReconnect(code: number): boolean {
        const fatalErrorCodes = [4004, 4010, 4011, 4013, 4014];
        if (fatalErrorCodes.includes(code)) {
            logger.error(`Fatal WebSocket error received (code: ${code}). Will not reconnect.`);
            return false;
        }
        if (this.options.alwaysReconnect) {
            return true;
        }
        return code !== 1000;
    }
}
