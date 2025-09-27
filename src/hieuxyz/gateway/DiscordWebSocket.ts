import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { getIdentifyPayload } from './entities/identify';
import { OpCode } from './entities/OpCode';
import { GatewayPayload, PresenceUpdatePayload } from './entities/types';

/**
 * Manage WebSocket connections to Discord Gateway.
 * Handles low-level operations like heartbeating, identifying, and resuming.
 */
export class DiscordWebSocket {
    private token: string;
    private ws: WebSocket | null = null;
    private sequence: number | null = null;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private sessionId: string | null = null;
    private resumeGatewayUrl: string | null = null;

    private resolveReady: () => void = () => {};
    /**
     * A promise will be resolved when the Gateway connection is ready.
     * and received the READY event.
     */
    public readyPromise = new Promise<void>(resolve => (this.resolveReady = resolve));

    /**
     * Create a DiscordWebSocket instance.
     * @param token - Discord user token for authentication.
     * @throws {Error} If the token is invalid.
     */
    constructor(token: string) {
        if (!this.isTokenValid(token)) {
            throw new Error("Invalid token provided.");
        }
        this.token = token;
    }

    private isTokenValid(token: string): boolean {
        return /^[a-zA-Z0-9_-]{24}\.[a-zA-Z0-9_-]{6}\.[a-zA-Z0-9_-]{38}$/.test(token) || /^mfa\.[a-zA-Z0-9_-]{84}$/.test(token);
    }

    /**
     * Initiate connection to Discord Gateway.
     * If there was a previous session, it will try to resume.
     */
    public connect() {
        const url = this.resumeGatewayUrl || "wss://gateway.discord.gg/?v=10&encoding=json";
        this.ws = new WebSocket(url);
        this.ws.on('open', () => logger.info(`Connected to Discord Gateway at ${url}.`));
        this.ws.on('message', this.onMessage.bind(this));
        this.ws.on('close', (code, reason) => {
            logger.warn(`Connection closed: ${code} - ${reason.toString()}`);
            this.cleanupHeartbeat();
            if (this.shouldReconnect(code)) {
                logger.info("Trying to reconnect...");
                setTimeout(() => this.connect(), 350);
            } else {
                this.sessionId = null;
                this.resumeGatewayUrl = null;
            }
        });
        this.ws.on('error', (err) => {
            logger.error(`WebSocket Error: ${err.message}`);
        });
    }

    private onMessage(data: WebSocket.RawData) {
        const payload: GatewayPayload = JSON.parse(data.toString());
        if (payload.s) {
            this.sequence = payload.s;
        }

        switch (payload.op) {
            case OpCode.HELLO:
                this.startHeartbeating(payload.d.heartbeat_interval);
                if (this.sessionId) {
                    this.resume();
                } else {
                    this.identify();
                }
                break;
            case OpCode.DISPATCH:
                if (payload.t === 'READY') {
                    this.sessionId = payload.d.session_id;
                    this.resumeGatewayUrl = payload.d.resume_gateway_url;
                    logger.info(`Session is READY. Session ID: ${this.sessionId}`);
                    this.resolveReady();
                } else if (payload.t === 'RESUMED') {
                    logger.info("The session has been successfully resumed.");
                    this.resolveReady();
                }
                break;
            case OpCode.HEARTBEAT_ACK:
                logger.info("Heartbeat acknowledged.");
                break;
            case OpCode.INVALID_SESSION:
                logger.warn("Invalid session. Re-identifying after 3 seconds.");
                this.sessionId = null;
                this.resumeGatewayUrl = null;
                setTimeout(() => this.connect(), 3000);
                break;
            case OpCode.RECONNECT:
                logger.info("Gateway requested reconnect. Closing and reconnecting.");
                this.ws?.close(4000, "Reconnect request");
                break;
            default:
                break;
        }
    }

    private startHeartbeating(interval: number) {
        this.cleanupHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            this.sendJson({ op: OpCode.HEARTBEAT, d: this.sequence });
            logger.info(`Heartbeat sent with sequence ${this.sequence}.`);
        }, interval);
    }

    private identify() {
        const identifyPayload = getIdentifyPayload(this.token);
        this.sendJson({ op: OpCode.IDENTIFY, d: identifyPayload });
        logger.info("Identify payload sent.");
    }

    private resume() {
        const resumePayload = {
            token: this.token,
            session_id: this.sessionId,
            seq: this.sequence
        };
        this.sendJson({ op: OpCode.RESUME, d: resumePayload });
        logger.info("Resume payload sent.");
    }

    /**
     * Send presence update payload to Gateway.
     * @param presence - Payload update status to send.
     */
    public sendActivity(presence: PresenceUpdatePayload) {
        this.sendJson({ op: OpCode.PRESENCE_UPDATE, d: presence });
        logger.info("Presence update sent.");
    }

    private sendJson(data: any) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            logger.warn("Attempted to send data while WebSocket was not open.");
        }
    }
    
    /**
     * Close the WebSocket connection and clean up the resources.
     */
    public close() {
        if (this.ws) {
            this.ws.close(1000, "Client closed connection");
        }
        this.cleanupHeartbeat();
        this.sessionId = null;
        this.resumeGatewayUrl = null;
    }

    private cleanupHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private shouldReconnect(code: number): boolean {
        return code !== 1000 && code !== 4004;
    }
}