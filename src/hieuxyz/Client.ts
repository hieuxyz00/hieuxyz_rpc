import { DiscordWebSocket } from './gateway/DiscordWebSocket';
import { HieuxyzRPC } from './rpc/HieuxyzRPC';
import { ImageService } from './rpc/ImageService';
import { logger } from './utils/logger';
import { ClientProperties } from './gateway/entities/identify';
import { DiscordUser, UserFlags, Activity } from './gateway/entities/types';

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
    /**
     * (Optional) Client properties to send to Discord gateway.
     * Used for client spoofing (e.g., appearing as on mobile).
     */
    properties?: ClientProperties;
    /**
     * (Optional) The timeout in milliseconds for the initial gateway connection.
     * Defaults to 30000 (30 seconds).
     */
    connectionTimeout?: number;
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
     * The default RPC instance.
     * Use this to set your main Rich Presence state details.
     */
    public readonly rpc: HieuxyzRPC;

    /**
     * List of all RPC instances managed by this client.
     */
    private rpcs: HieuxyzRPC[] = [];

    /**
     * Information about the logged-in user.
     * Populated after run() resolves.
     */
    public user: DiscordUser | null = null;

    private readonly websocket: DiscordWebSocket;
    private readonly imageService: ImageService;
    private readonly token: string;

    /**
     * Create a new Client instance.
     * @param {ClientOptions} options - Options to configure the client.
     * @throws {Error} If no token is provided in the options.
     */
    constructor(options: ClientOptions) {
        if (!options.token) {
            throw new Error('Tokens are required to connect to Discord.');
        }
        this.token = options.token;
        this.imageService = new ImageService(options.apiBaseUrl);

        this.websocket = new DiscordWebSocket(this.token, {
            alwaysReconnect: options.alwaysReconnect ?? false,
            properties: options.properties,
            connectionTimeout: options.connectionTimeout,
        });
        this.rpc = this.createRPC();
        this.printAbout();
    }

    /**
     * Create a new RPC instance.
     * Use this if you want to display multiple activities simultaneously (Multi-RPC).
     * @returns {HieuxyzRPC} A new RPC builder instance.
     */
    public createRPC(): HieuxyzRPC {
        const newRpc = new HieuxyzRPC(this.imageService, async () => {
            await this.sendAllActivities();
        });
        this.rpcs.push(newRpc);
        return newRpc;
    }

    /**
     * Removes an RPC instance and cleans up its resources.
     * @param {HieuxyzRPC} rpcInstance The RPC instance to remove.
     */
    public removeRPC(rpcInstance: HieuxyzRPC): void {
        const index = this.rpcs.indexOf(rpcInstance);
        if (index > -1) {
            rpcInstance.destroy();
            this.rpcs.splice(index, 1);
            this.sendAllActivities();
        }
    }

    /**
     * Aggregates activities from all RPC instances and sends them to Discord.
     * Uses Promise.all for parallel asset resolution.
     */
    private async sendAllActivities(): Promise<void> {
        const potentialActivities = await Promise.all(this.rpcs.map((rpc) => rpc.buildActivity()));
        const activities = potentialActivities.filter((a): a is Activity => a !== null);
        let status = 'online';
        for (let i = this.rpcs.length - 1; i >= 0; i--) {
            if (this.rpcs[i].currentStatus) {
                status = this.rpcs[i].currentStatus;
                break;
            }
        }
        this.websocket.sendActivity({
            since: 0,
            activities: activities,
            status: status as 'online' | 'dnd' | 'idle' | 'invisible' | 'offline',
            afk: true,
        });
    }

    /**
     * Displays information about the library.
     */
    private printAbout(): void {
        const version = '1.2.4';
        console.log(`
  _     _                               
 | |__ (_) ___ _   ___  ___   _ ______  
 | '_ \\| |/ _ \\ | | \\ \\/ / | | |_  /  
 | | | | |  __/ |_| |>  <| |_| |/ /   
 |_| |_|_|\\___|\\__,_/_/\\_\\\\__, /___|  
                          |___/       
  @hieuxyz/rpc v${version}
  A powerful Discord Rich Presence library.
  Developed by: hieuxyz
        `);
    }

    /**
     * Connect to Discord Gateway and prepare the client for RPC updates.
     * This method must be called before sending any Rich Presence updates.
     * @returns {Promise<DiscordUser>} A promise will be resolved when the client is ready.
     */
    public async run(): Promise<DiscordUser> {
        this.websocket.connect();
        logger.info('Waiting for Discord session to be ready...');
        const user = await this.websocket.readyPromise;
        this.user = user;
        this.logUserProfile(user);
        logger.info('Client is ready to send Rich Presence updates.');
        return user;
    }

    private formatters: Record<string, (val: any, parent?: any) => string> = {
        email: (val) => (val ? `\x1b[90m<Hidden>\x1b[0m` : 'null'),
        phone: (val) => (val ? `\x1b[90m<Hidden>\x1b[0m` : 'null'),
        avatar: (val, parent) => {
            if (!val) return 'null';
            const ext = val.startsWith('a_') ? 'gif' : 'png';
            const userId = parent?.id;
            const url = userId ? `https://cdn.discordapp.com/avatars/${userId}/${val}.${ext}` : '';
            return `"${val}" ${url ? `(\x1b[34m${url}\x1b[0m)` : ''}`;
        },
        banner: (val, parent) => {
            if (!val) return 'null';
            const ext = val.startsWith('a_') ? 'gif' : 'png';
            const userId = parent?.id;
            const url = userId ? `https://cdn.discordapp.com/banners/${userId}/${val}.${ext}` : '';
            return `"${val}" ${url ? `(\x1b[34m${url}\x1b[0m)` : ''}`;
        },
        asset: (val) => {
            const url = `https://cdn.discordapp.com/avatar-decoration-presets/${val}.png`;
            return `"${val}" (\x1b[34m${url}\x1b[0m)`;
        },
        accent_color: (val) => `${val} (\x1b[33m#${val.toString(16).padStart(6, '0').toUpperCase()}\x1b[0m)`,
        banner_color: (val) => `\x1b[33m${val}\x1b[0m`,
        expires_at: (val) => (val ? `${val} (${new Date(val).toLocaleString()})` : 'Never'),
        premium_type: (val) => {
            const map: Record<number, string> = { 0: 'None', 1: 'Classic', 2: 'Nitro', 3: 'Basic' };
            return `${val} (\x1b[32m${map[val] || 'Unknown'}\x1b[0m)`;
        },
        flags: (val) => this.formatFlags(val),
        public_flags: (val) => this.formatFlags(val),
        purchased_flags: (val) => `\x1b[33m${val}\x1b[0m`,
    };

    private formatFlags(flags: number): string {
        const flagNames: string[] = [];
        if (flags & UserFlags.STAFF) flagNames.push('Staff');
        if (flags & UserFlags.PARTNER) flagNames.push('Partner');
        if (flags & UserFlags.HYPESQUAD) flagNames.push('HypeSquad');
        if (flags & UserFlags.BUG_HUNTER_LEVEL_1) flagNames.push('BugHunter I');
        if (flags & UserFlags.HYPESQUAD_ONLINE_HOUSE_1) flagNames.push('Bravery');
        if (flags & UserFlags.HYPESQUAD_ONLINE_HOUSE_2) flagNames.push('Brilliance');
        if (flags & UserFlags.HYPESQUAD_ONLINE_HOUSE_3) flagNames.push('Balance');
        if (flags & UserFlags.PREMIUM_EARLY_SUPPORTER) flagNames.push('EarlySupporter');
        if (flags & UserFlags.BUG_HUNTER_LEVEL_2) flagNames.push('BugHunter II');
        if (flags & UserFlags.VERIFIED_DEVELOPER) flagNames.push('VerifiedDev');
        if (flags & UserFlags.CERTIFIED_MODERATOR) flagNames.push('CertifiedMod');
        if (flags & UserFlags.ACTIVE_DEVELOPER) flagNames.push('ActiveDev');

        return `${flags} \x1b[36m[${flagNames.length > 0 ? flagNames.join(', ') : 'None'}]\x1b[0m`;
    }

    private printDynamicTree(obj: any, prefix: string = '') {
        const entries = Object.entries(obj);
        entries.forEach(([key, value], index) => {
            const isLastItem = index === entries.length - 1;
            const connector = isLastItem ? '└── ' : '├── ';
            const childPrefix = prefix + (isLastItem ? '    ' : '│   ');
            let displayValue = '';
            let isObject = false;

            if (value === null) {
                displayValue = '\x1b[90mnull\x1b[0m';
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                isObject = true;
                console.log(`${prefix}${connector}\x1b[1m${key}\x1b[0m`);
                this.printDynamicTree(value, childPrefix);
            } else if (Array.isArray(value)) {
                if (value.length > 0 && typeof value[0] !== 'object') {
                    displayValue = `[ ${value.join(', ')} ]`;
                } else {
                    displayValue = `[Array(${value.length})]`;
                }
            } else {
                if (this.formatters[key]) {
                    displayValue = this.formatters[key](value, obj);
                } else {
                    if (typeof value === 'string') displayValue = `"\x1b[32m${value}\x1b[0m"`;
                    else if (typeof value === 'boolean')
                        displayValue = value ? '\x1b[32mtrue\x1b[0m' : '\x1b[31mfalse\x1b[0m';
                    else if (typeof value === 'number') displayValue = `\x1b[33m${value}\x1b[0m`;
                    else displayValue = String(value);
                }
            }
            if (!isObject) {
                console.log(`${prefix}${connector}${key}: ${displayValue}`);
            }
        });
    }

    private logUserProfile(user: DiscordUser) {
        logger.info('-> User Data:');
        this.printDynamicTree(user);
        /*logger.info('-> Raw JSON:');
        console.log(JSON.stringify(user));*/
    }

    /**
     * Close the connection to Discord Gateway.
     * @param {boolean} [force=false] - If true, the client closes permanently and will not reconnect.
     * even if `alwaysReconnect` is enabled. Defaults to false.
     */
    public close(force: boolean = false): void {
        this.rpcs.forEach((rpc) => rpc.destroy());
        this.websocket.close(force);
    }
}
