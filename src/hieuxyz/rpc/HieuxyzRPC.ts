import { DiscordWebSocket } from "../gateway/DiscordWebSocket";
import { Activity, PresenceUpdatePayload, SettableActivityType, ActivityTypeName, ActivityType } from "../gateway/entities/types";
import { ImageService } from "./ImageService";
import { DiscordImage, ExternalImage, RawImage, RpcImage } from "./RpcImage";
import { logger } from "../utils/logger";

interface RpcAssets {
    large_image?: RpcImage;
    large_text?: string;
    small_image?: RpcImage;
    small_text?: string;
}

interface RpcButton {
    label: string;
    url: string;
}

export type DiscordPlatform = 'desktop' | 'android' | 'ios' | 'samsung' | 'xbox' | 'ps4' | 'ps5' | 'embedded';

/**
 * Class built for creating and managing Discord Rich Presence states.
 */
export class HieuxyzRPC {
    private websocket: DiscordWebSocket;
    private imageService: ImageService;
    private activity: Partial<Activity> = {};
    private assets: RpcAssets = {};
    private status: 'online' | 'dnd' | 'idle' | 'invisible' | 'offline' = 'online';
    private applicationId: string = '1416676323459469363'; // Default ID, can be changed

    private platform: DiscordPlatform = 'desktop';
    
    /**
     * Cache for resolved image assets to avoid re-uploading or re-fetching.
     * Key: A unique string from RpcImage.getCacheKey().
     * Value: The resolved asset key (e.g., "mp:attachments/...").
     */
    private resolvedAssetsCache: Map<string, string> = new Map();
    private renewalInterval: NodeJS.Timeout | null = null;

    constructor(websocket: DiscordWebSocket, imageService: ImageService) {
        this.websocket = websocket;
        this.imageService = imageService;
        this.startBackgroundRenewal();
    }

    private _toRpcImage(source: string | RpcImage): RpcImage {
        if (typeof source !== 'string') {
            return source;
        }
        if (source.startsWith('https://') || source.startsWith('http://')) {
            try {
                const url = new URL(source);
                if (url.hostname === 'cdn.discordapp.com' || url.hostname === 'media.discordapp.net') {
                    const discordAssetPath = url.pathname.substring(1);
                    return new DiscordImage(discordAssetPath);
                } else {
                    return new ExternalImage(source);
                }
            } catch (e) {
                logger.warn(`Could not parse "${source}" into a valid URL. Treating as RawImage.`);
                return new RawImage(source);
            }
        }
        if (source.startsWith('attachments/') || source.startsWith('external/')) {
            return new DiscordImage(source);
        }
        return new RawImage(source);
    }

    private sanitize(str: string, length: number = 128): string {
        return str.length > length ? str.substring(0, length) : str;
    }

    /**
     * Name the operation (first line of RPC).
     * @param name - Name to display.
     * @returns {this}
     */
    public setName(name: string): this {
        this.activity.name = this.sanitize(name);
        return this;
    }

    /**
     * Set details for the operation (second line of RPC).
     * @param details - Details to display.
     * @returns {this}
     */
    public setDetails(details: string): this {
        this.activity.details = this.sanitize(details);
        return this;
    }

    /**
     * Set the state for the operation (third line of the RPC).
     * @param state - State to display.
     * @returns {this}
     */
    public setState(state: string): this {
        this.activity.state = this.sanitize(state);
        return this;
    }
    
    /**
     * Set the activity type.
     * @param type - The type of activity (e.g. 0, 'playing', or ActivityType.Playing).
     * @returns {this}
     */
    public setType(type: SettableActivityType): this {
        if (typeof type === 'string') {
            const typeMap: { [key in ActivityTypeName]: number } = {
                playing: ActivityType.Playing,
                streaming: ActivityType.Streaming,
                listening: ActivityType.Listening,
                watching: ActivityType.Watching,
                custom: ActivityType.Custom,
                competing: ActivityType.Competing,
            };
            this.activity.type = typeMap[type.toLowerCase() as ActivityTypeName] ?? ActivityType.Playing;
        } else {
            this.activity.type = type;
        }
        return this;
    }

    /**
     * Set a start and/or end timestamp for the activity.
     * @param start - Unix timestamp (milliseconds) for start time.
     * @param end - Unix timestamp (milliseconds) for the end time.
     * @returns {this}
     */
    public setTimestamps(start?: number, end?: number): this {
        this.activity.timestamps = { start, end };
        return this;
    }

    /**
     * Set party information for the activity.
     * @param currentSize - Current number of players.
     * @param maxSize - Maximum number of players.
     * @returns {this}
     */
    public setParty(currentSize: number, maxSize: number): this {
        this.activity.party = { id: 'hieuxyz', size: [currentSize, maxSize] };
        return this;
    }

    /**
     * Set large image and its caption text.
     * @param source - Image source (URL, asset key, or RpcImage object).
     * @param text - Text displayed when hovering over image.
     * @returns {this}
     */
    public setLargeImage(source: string | RpcImage, text?: string): this {
        this.assets.large_image = this._toRpcImage(source);
        if (text) this.assets.large_text = this.sanitize(text);
        return this;
    }

    /**
     * Set the small image and its caption text.
     * @param source - Image source (URL, asset key, or RpcImage object).
     * @param text - Text displayed when hovering over image.
     * @returns {this}
     */
    public setSmallImage(source: string | RpcImage, text?: string): this {
        this.assets.small_image = this._toRpcImage(source);
        if (text) this.assets.small_text = this.sanitize(text);
        return this;
    }

    /**
     * Set clickable buttons for RPC (up to 2).
     * @param buttons - An array of button objects.
     * @returns {this}
     */
    public setButtons(buttons: RpcButton[]): this {
        const validButtons = buttons.slice(0, 2);
        this.activity.buttons = validButtons.map(b => this.sanitize(b.label, 32));
        this.activity.metadata = { button_urls: validButtons.map(b => b.url) };
        return this;
    }

    /**
     * Set custom application ID for RPC.
     * @param id - Discord app ID (must be an 18 or 19 digit number string).
     * @throws {Error} If ID is invalid.
     * @returns {this}
     */
    public setApplicationId(id: string): this {
        if (!/^\d{18,19}$/.test(id)) {
            throw new Error("The app ID must be an 18 or 19 digit number.");
        }
        this.applicationId = id;
        return this;
    }

    /**
     * Set the user's status (e.g. online, idle, dnd).
     * @param status - Desired state.
     * @returns {this}
     */
    public setStatus(status: 'online' | 'dnd' | 'idle' | 'invisible' | 'offline'): this {
        this.status = status;
        return this;
    }
    
    /**
     * Set the platform on which the activity is running.
     * @param platform - Platform (e.g. 'desktop', 'xbox').
     * @returns {this}
     */
    public setPlatform(platform: DiscordPlatform): this {
        this.platform = platform;
        return this;
    }

    private getExpiryTime(assetKey: string): number | null {
        if (!assetKey.startsWith('mp:attachments')) return null;

        const urlPart = assetKey.substring(3);
        try {
            const parsedUrl = new URL(`https://cdn.discordapp.com/${urlPart}`);
            const expiresTimestamp = parsedUrl.searchParams.get('ex');
            if (expiresTimestamp) {
                return parseInt(expiresTimestamp, 16) * 1000;
            }
        } catch (e) {
            logger.error(`Could not parse asset URL for expiry check: ${assetKey}`);
        }
        return null;
    }

    private async renewAssetIfNeeded(cacheKey: string, assetKey: string): Promise<string> {
        const expiryTimeMs = this.getExpiryTime(assetKey);
        if (expiryTimeMs && expiryTimeMs < (Date.now() + 3600000)) {
            logger.info(`Asset ${cacheKey} is expiring soon. Renewing...`);
            const assetId = assetKey.split('mp:attachments/')[1];
            const newAsset = await this.imageService.renewImage(assetId);
            if (newAsset) {
                this.resolvedAssetsCache.set(cacheKey, newAsset);
                return newAsset;
            }
            logger.warn(`Failed to renew asset, will use the old one.`);
        }
        return assetKey;
    }
    
    private startBackgroundRenewal(): void {
        if (this.renewalInterval) {
            clearInterval(this.renewalInterval);
        }
        this.renewalInterval = setInterval(async () => {
            logger.info("Running background asset renewal check...");
            for (const [cacheKey, assetKey] of this.resolvedAssetsCache.entries()) {
                await this.renewAssetIfNeeded(cacheKey, assetKey);
            }
        }, 600000);
    }

    /**
     * Stops the background process that checks for asset renewal.
     */
    public stopBackgroundRenewal(): void {
        if (this.renewalInterval) {
            clearInterval(this.renewalInterval);
            this.renewalInterval = null;
            logger.info("Stopped background asset renewal process.");
        }
    }

    private async resolveImage(image: RpcImage | undefined): Promise<string | undefined> {
        if (!image) return undefined;

        const cacheKey = image.getCacheKey();
        let cachedAsset = this.resolvedAssetsCache.get(cacheKey);

        if (cachedAsset) {
            return await this.renewAssetIfNeeded(cacheKey, cachedAsset);
        }

        const resolvedAsset = await image.resolve(this.imageService);
        if (resolvedAsset) {
            this.resolvedAssetsCache.set(cacheKey, resolvedAsset);
        }
        return resolvedAsset;
    }

    private async buildActivity(): Promise<Activity> {
        const large_image = await this.resolveImage(this.assets.large_image);
        const small_image = await this.resolveImage(this.assets.small_image);
        
        const finalAssets: { large_image?: string; large_text?: string; small_image?: string; small_text?: string } = {
            large_text: this.assets.large_text,
            small_text: this.assets.small_text,
        };
        if (large_image) finalAssets.large_image = large_image;
        if (small_image) finalAssets.small_image = small_image;

        const finalActivity = { ...this.activity };
        finalActivity.assets = (large_image || small_image) ? finalAssets : undefined;
        finalActivity.application_id = this.applicationId;
        finalActivity.platform = this.platform;
        if (!finalActivity.name) {
            finalActivity.name = "hieuxyzRPC";
        }
        if (typeof finalActivity.type === 'undefined') {
            finalActivity.type = ActivityType.Playing;
        }

        return finalActivity as Activity;
    }

    /**
     * Build the final Rich Presence payload and send it to Discord.
     * @returns {Promise<void>}
     */
    public async build(): Promise<void> {
        const activity = await this.buildActivity();
        const presencePayload: PresenceUpdatePayload = {
            since: 0,
            activities: [activity],
            status: this.status,
            afk: true,
        };
        this.websocket.sendActivity(presencePayload);
    }

    /**
     * Sends an update to an existing RPC.
     * This is essentially an alias for `build()`.
     * @returns {Promise<void>}
     */
    public async updateRPC(): Promise<void> {
        await this.build();
    }
}