import { DiscordWebSocket } from './gateway/DiscordWebSocket';
import { HieuxyzRPC } from './rpc/HieuxyzRPC';
import { ImageService } from './rpc/ImageService';
import { logger } from './utils/logger';

/**
 * Option to initialize Client.
 */
export interface ClientOptions {
    /** Your Discord user token. */
    token: string;
    /** (Optional) Base URL of the image proxy service. */
    apiBaseUrl?: string;
    /**
     * (Optional) If true, the client will attempt to reconnect even after a normal close (code 1000).
     * Defaults to false.
     */
    alwaysReconnect?: boolean;
}

/**
 * The main Client class for interacting with Discord Rich Presence.
 * This is the starting point for creating and managing your RPC state.
 * @example
 * const client = new Client({
 *   token: "YOUR_DISCORD_TOKEN",
 *   alwaysReconnect: true // Keep the RPC alive no matter what
 * });
 * await client.run();
 * client.rpc.setName("Visual Studio Code");
 * await client.rpc.build();
 */
export class Client {
    /**
     * Provides access to RPC constructor methods.
     * Use this property to set your Rich Presence state details.
     */
    public readonly rpc: HieuxyzRPC;
    private readonly websocket: DiscordWebSocket;
    private readonly imageService: ImageService;
    private readonly token: string;

    /**
     * Create a new Client instance.
     * @param options - Options to configure the client.
     * @throws {Error} If no token is provided in the options.
     */
    constructor(options: ClientOptions) {
        if (!options.token) {
            throw new Error("Tokens are required to connect to Discord.");
        }
        this.token = options.token;
        this.imageService = new ImageService(options.apiBaseUrl);

        this.websocket = new DiscordWebSocket(this.token, {
            alwaysReconnect: options.alwaysReconnect ?? false,
        });

        this.rpc = new HieuxyzRPC(this.websocket, this.imageService);
    }

    /**
     * Connect to Discord Gateway and prepare the client for RPC updates.
     * This method must be called before sending any Rich Presence updates.
     * @returns {Promise<void>} A promise will be resolved when the client is ready.
     */
    public async run(): Promise<void> {
        this.websocket.connect();
        logger.info("Waiting for Discord session to be ready...");
        await this.websocket.readyPromise;
        logger.info("Client is ready to send Rich Presence updates.");
    }

    /**
     * Close the connection to Discord Gateway.
     * @param {boolean} [force=false] - If true, the client will close permanently and will not attempt to reconnect,
     * even if `alwaysReconnect` is enabled. Defaults to false.
     */
    public close(force: boolean = false): void {
        this.rpc.stopBackgroundRenewal();
        this.websocket.close(force);
    }
}