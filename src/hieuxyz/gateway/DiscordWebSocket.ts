import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { getIdentifyPayload } from './entities/identify';
import { OpCode } from './entities/OpCode';
import { GatewayPayload, PresenceUpdatePayload } from './entities/types';

interface DiscordWebSocketOptions {
    alwaysReconnect: boolean;
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
    private resolveReady: () => void = () => {};
    /**
     * A promise will be resolved when the Gateway connection is ready.
     * and received the READY event.
     */
    public readyPromise: Promise<void>;

    /**
     * Create a DiscordWebSocket instance.
     * @param token - Discord user token for authentication.
     * @param options - Configuration options for the WebSocket client.
     * @throws {Error} If the token is invalid.
     */
    constructor(token: string, options: DiscordWebSocketOptions) {
        if (!this.isTokenValid(token)) {
            throw new Error("Invalid token provided.");
        }
        this.token = token;
        this.options = options;
        this.readyPromise = new Promise<void>(resolve => (this.resolveReady = resolve));
    }
    
    private resetReadyPromise() {
        this.readyPromise = new Promise<void>(resolve => (this.resolveReady = resolve));
    }

    private isTokenValid(token: string): boolean {
        return /^[a-zA-Z0-9_-]{24}\.[a-zA-Z0-9_-]{6}\.[a-zA-Z0-9_-]{38}$/.test(token) || /^mfa\.[a-zA-Z0-9_-]{84}$/.test(token);
    }

    /**
     * Initiate connection to Discord Gateway.
     * If there was a previous session, it will try to resume.
     */
    public connect() {
        if (this.isReconnecting) {
            logger.info("Connection attempt aborted: reconnection already in progress.");
            return;
        }
        this.isReconnecting = true;
        this.resetReadyPromise();
        const url = this.resumeGatewayUrl || "wss://gateway.discord.gg/?v=10&encoding=json";
        
        logger.info(`Attempting to connect to ${url}...`);
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            logger.info(`Successfully connected to Discord Gateway at ${url}.`);
            this.isReconnecting = false;
        });
        
        this.ws.on('message', this.onMessage.bind(this));
        
        this.ws.on('close', (code, reason) => {
            logger.warn(`Connection closed: ${code} - ${reason.toString('utf-8')}`);
            this.cleanupHeartbeat();
            if (this.isReconnecting) return;
            if (this.shouldReconnect(code)) {
                setTimeout(() => {
                    const canResume = code !== 4004 && !!this.sessionId;
                    if (!canResume) {
                        this.sessionId = null;
                        this.sequence = null;
                        this.resumeGatewayUrl = null;
                    }
                    this.connect();
                }, 500);
            } else {
                 logger.info("Not attempting to reconnect based on close code and client options.");
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
                    this.resumeGatewayUrl = payload.d.resume_gateway_url + "/?v=10&encoding=json";
                    logger.info(`Session READY. Session ID: ${this.sessionId}. Resume URL set.`);
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
                logger.warn(`Received INVALID_SESSION. Resumable: ${payload.d}`);
                if (payload.d) {
                    this.ws?.close(4000, "Invalid session, attempting to resume.");
                } else {
                    this.ws?.close(4004, "Invalid session, starting a new session.");
                }
                break;
                
            case OpCode.RECONNECT:
                logger.info("Gateway requested RECONNECT. Closing to reconnect and resume.");
                this.ws?.close(4000, "Gateway requested reconnect.");
                break;

            default:
                break;
        }
    }

    private startHeartbeating() {
        this.cleanupHeartbeat();
        setTimeout(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.sendHeartbeat();
            }
            
            this.heartbeatInterval = setInterval(() => {
                if (this.ws?.readyState !== WebSocket.OPEN) {
                    logger.warn("Heartbeat skipped: WebSocket is not open.");
                    this.cleanupHeartbeat();
                    return;
                }
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
        const identifyPayload = getIdentifyPayload(this.token);
        this.sendJson({ op: OpCode.IDENTIFY, d: identifyPayload });
        logger.info("Identify payload sent.");
    }

    private resume() {
        if (!this.sessionId || this.sequence === null) {
            logger.error("Attempted to resume without session ID or sequence. Falling back to identify.");
            this.identify();
            return;
        }
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
    public close(code: number = 1000, reason: string = "Client closed connection") {
        logger.info(`Closing connection manually with code ${code}: ${reason}`);
        this.isReconnecting = false;
        if (this.ws) {
            this.ws.close(code, reason);
        }
    }

    private cleanupHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private shouldReconnect(code: number): boolean {
        const fatalErrorCodes = [4010, 4011, 4013, 4014];
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