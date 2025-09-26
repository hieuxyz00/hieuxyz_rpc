import { DiscordWebSocket } from './hieuxyz/gateway/DiscordWebSocket';
import { HieuxyzRPC } from './hieuxyz/rpc/HieuxyzRPC';
import { ImageService } from './hieuxyz/rpc/ImageService';
import { logger } from './hieuxyz/utils/logger';

export interface ClientOptions {
    token: string;
    apiBaseUrl?: string;
}

export class Client {
    public readonly rpc: HieuxyzRPC;
    private readonly websocket: DiscordWebSocket;
    private readonly imageService: ImageService;
    private readonly token: string;

    constructor(options: ClientOptions) {
        if (!options.token) {
            throw new Error("A token is required to connect to Discord.");
        }
        this.token = options.token;
        this.imageService = new ImageService(options.apiBaseUrl);
        this.websocket = new DiscordWebSocket(this.token);
        this.rpc = new HieuxyzRPC(this.websocket, this.imageService);
    }

    /**
     * Connects to the Discord Gateway and prepares the client for RPC updates.
     */
    public async run(): Promise<void> {
        this.websocket.connect();
        logger.info("Waiting for Discord session to be ready...");
        await this.websocket.readyPromise;
        logger.info("Client is ready to send Rich Presence updates.");
    }

    /**
     * Closes the connection to the Discord Gateway.
     */
    public close(): void {
        this.websocket.close();
    }
}