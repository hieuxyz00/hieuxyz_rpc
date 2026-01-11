import { Activity, SettableActivityType, ActivityTypeName, ActivityType } from '../gateway/entities/types';
import { ImageService } from './ImageService';
import { DiscordImage, ExternalImage, RawImage, RpcImage, ApplicationImage } from './RpcImage';
import { logger } from '../utils/logger';

/**
 * Flags for activities, used with `.setFlags()`.
 * @enum {number}
 */
export enum ActivityFlags {
    INSTANCE = 1 << 0,
    JOIN = 1 << 1,
    SPECTATE = 1 << 2,
    JOIN_REQUEST = 1 << 3,
    SYNC = 1 << 4,
    PLAY = 1 << 5,
}

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

interface RpcSecrets {
    join?: string;
    spectate?: string;
    match?: string;
}

export type DiscordPlatform = 'desktop' | 'android' | 'ios' | 'samsung' | 'xbox' | 'ps4' | 'ps5' | 'embedded';

type UpdateCallback = () => Promise<void>;

/**
 * Class built for creating and managing Discord Rich Presence states.
 */
export class HieuxyzRPC {
    private imageService: ImageService;
    private onUpdate: UpdateCallback;
    private activity: Partial<Activity> = {};
    private assets: RpcAssets = {};
    private status: 'online' | 'dnd' | 'idle' | 'invisible' | 'offline' = 'online';
    private applicationId: string = '1416676323459469363';

    private platform: DiscordPlatform = 'desktop';

    /**
     * Cache for resolved image assets to avoid re-uploading or re-fetching.
     * Key: A unique string from RpcImage.getCacheKey().
     * Value: The resolved asset key (e.g., "mp:attachments/...").
     */
    private resolvedAssetsCache: Map<string, string> = new Map();

    /**
     * Maximum number of items in cache to prevent memory leaks/bloat over long runtime.
     */
    private readonly MAX_CACHE_SIZE = 50;

    private renewalInterval: NodeJS.Timeout | null = null;

    /**
     * Cache for Application Assets (Bot Assets).
     * Map<ApplicationID, Map<AssetName, AssetID>>
     */
    private applicationAssetsCache: Map<string, Map<string, string>> = new Map();

    constructor(imageService: ImageService, onUpdate: UpdateCallback) {
        this.imageService = imageService;
        this.onUpdate = onUpdate;
        this.startBackgroundRenewal();
    }

    /**
     * Returns the URL of the large image asset, if available.
     * @type {string | null}
     * @readonly
     */
    public get largeImageUrl(): string | null {
        if (!this.assets.large_image) return null;
        const cacheKey = this.assets.large_image.getCacheKey();
        const resolvedAsset = this.resolvedAssetsCache.get(cacheKey);
        return resolvedAsset ? this._resolveAssetUrl(resolvedAsset) : null;
    }

    /**
     * Returns the URL of the small image asset, if available.
     * @type {string | null}
     * @readonly
     */
    public get smallImageUrl(): string | null {
        if (!this.assets.small_image) return null;
        const cacheKey = this.assets.small_image.getCacheKey();
        const resolvedAsset = this.resolvedAssetsCache.get(cacheKey);
        return resolvedAsset ? this._resolveAssetUrl(resolvedAsset) : null;
    }

    private _resolveAssetUrl(assetKey: string): string | null {
        if (assetKey.startsWith('mp:')) {
            return `https://media.discordapp.net/${assetKey.substring(3)}`;
        }
        if (assetKey.startsWith('spotify:')) {
            return `https://i.scdn.co/image/${assetKey.substring(8)}`;
        }
        if (assetKey.startsWith('youtube:')) {
            return `https://i.ytimg.com/vi/${assetKey.substring(8)}/hqdefault.jpg`;
        }
        if (assetKey.startsWith('twitch:')) {
            return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${assetKey.substring(7)}.png`;
        }
        if (this.applicationId && !assetKey.startsWith('http')) {
            return `https://cdn.discordapp.com/app-assets/${this.applicationId}/${assetKey}.png`;
        }
        return null;
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
            } catch {
                logger.warn(`Could not parse "${source}" into a valid URL. Treating as RawImage.`);
                return new RawImage(source);
            }
        }
        if (source.startsWith('attachments/') || source.startsWith('external/')) {
            return new DiscordImage(source);
        }
        if (/^[a-zA-Z0-9_]+$/.test(source) && !/^\d{17,20}$/.test(source)) {
            return new ApplicationImage(source);
        }
        return new RawImage(source);
    }

    private cleanupNulls<T extends object>(obj: T): Partial<T> {
        return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
    }

    private sanitize(str: string, length: number = 128): string {
        return str.length > length ? str.substring(0, length) : str;
    }

    /**
     * Name the operation (first line of RPC).
     * @param {string} name - Name to display.
     * @returns {this}
     */
    public setName(name: string): this {
        this.activity.name = this.sanitize(name);
        return this;
    }

    /**
     * Set details for the operation (second line of RPC).
     * @param {string} details - Details to display.
     * @returns {this}
     */
    public setDetails(details: string): this {
        this.activity.details = this.sanitize(details);
        return this;
    }

    /**
     * Set the state for the operation (third line of the RPC).
     * @param {string} state - State to display.
     * @returns {this}
     */
    public setState(state: string): this {
        this.activity.state = this.sanitize(state);
        return this;
    }

    /**
     * Set the activity type.
     * @param {SettableActivityType} type - The type of activity (e.g. 0, 'playing', or ActivityType.Playing).
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
     * @param {number} [start] - Unix timestamp (milliseconds) for start time.
     * @param {number} [end] - Unix timestamp (milliseconds) for the end time.
     * @returns {this}
     */
    public setTimestamps(start?: number, end?: number): this {
        this.activity.timestamps = { start, end };
        return this;
    }

    /**
     * Set party information for the activity.
     * @param {number} currentSize - Current number of players.
     * @param {number} maxSize - Maximum number of players.
     * @param {string} [id] - Optional custom party ID. Defaults to 'hieuxyz'.
     * @returns {this}
     */
    public setParty(currentSize: number, maxSize: number, id: string = 'hieuxyz'): this {
        this.activity.party = { id: id, size: [currentSize, maxSize] };
        return this;
    }

    /**
     * Set large image and its caption text.
     * @param {string | RpcImage} source - Image source (URL, asset key, Asset Name or RpcImage object).
     * @param {string} [text] - Text displayed when hovering over image.
     * @returns {this}
     */
    public setLargeImage(source: string | RpcImage, text?: string): this {
        this.assets.large_image = this._toRpcImage(source);
        if (text) this.assets.large_text = this.sanitize(text);
        return this;
    }

    /**
     * Set the small image and its caption text.
     * @param {string | RpcImage} source - Image source (URL, asset key, Asset Name or RpcImage object).
     * @param {string} [text] - Text displayed when hovering over image.
     * @returns {this}
     */
    public setSmallImage(source: string | RpcImage, text?: string): this {
        this.assets.small_image = this._toRpcImage(source);
        if (text) this.assets.small_text = this.sanitize(text);
        return this;
    }

    /**
     * Add a single button to the activity.
     * @param {string} label - The text displayed on the button.
     * @param {string} url - The URL opened when the button is clicked.
     * @returns {this}
     */
    public addButton(label: string, url: string): this {
        if (!this.activity.buttons) {
            this.activity.buttons = [];
        }
        if (!this.activity.metadata) {
            this.activity.metadata = { button_urls: [] };
        }
        if (!this.activity.metadata.button_urls) {
            this.activity.metadata.button_urls = [];
        }
        if (this.activity.buttons.length >= 2) {
            logger.warn('Cannot add more than 2 buttons. Button ignored.');
            return this;
        }
        this.activity.buttons.push(this.sanitize(label, 32));
        this.activity.metadata!.button_urls!.push(url);
        return this;
    }

    /**
     * Set clickable buttons for RPC (up to 2).
     * This will overwrite any existing buttons.
     * @param {RpcButton[]} buttons - An array of button objects, each with a `label` and `url`.
     * @returns {this}
     */
    public setButtons(buttons: RpcButton[]): this {
        const validButtons = buttons.slice(0, 2);
        this.activity.buttons = validButtons.map((b) => this.sanitize(b.label, 32));
        this.activity.metadata = { button_urls: validButtons.map((b) => b.url) };
        return this;
    }

    /**
     * Set secrets for joining, spectating, and matching games.
     * @param {RpcSecrets} secrets - An object with join, spectate, and/or match secrets.
     * @returns {this}
     */
    public setSecrets(secrets: RpcSecrets): this {
        this.activity.secrets = secrets;
        return this;
    }

    /**
     * Set the sync_id, typically used for Spotify track synchronization.
     * @param {string} syncId - The synchronization ID.
     * @returns {this}
     */
    public setSyncId(syncId: string): this {
        this.activity.sync_id = syncId;
        return this;
    }

    /**
     * Set activity flags. Use the ActivityFlags enum for convenience.
     * @param {number} flags - A number representing the bitwise flags.
     * @returns {this}
     */
    public setFlags(flags: number): this {
        this.activity.flags = flags;
        return this;
    }

    /**
     * Set custom application ID for RPC.
     * @param {string} id - Discord app ID (must be an 18 or 19 digit number string).
     * @throws {Error} If ID is invalid.
     * @returns {this}
     */
    public setApplicationId(id: string): this {
        if (!/^\d{17,20}$/.test(id)) {
            throw new Error('The app ID must be a valid number string (17-20 digits).');
        }
        this.applicationId = id;
        return this;
    }

    /**
     * Set the user's status (e.g. online, idle, dnd).
     * @param {'online' | 'dnd' | 'idle' | 'invisible' | 'offline'} status - Desired state.
     * @returns {this}
     */
    public setStatus(status: 'online' | 'dnd' | 'idle' | 'invisible' | 'offline'): this {
        this.status = status;
        return this;
    }

    /**
     * Set the platform on which the activity is running.
     * @param {DiscordPlatform} platform - Platform (e.g. 'desktop', 'xbox').
     * @returns {this}
     */
    public setPlatform(platform: DiscordPlatform): this {
        this.platform = platform;
        return this;
    }

    /**
     * Marks the activity as a joinable instance for the game.
     * @param {boolean} instance - Whether this activity is a specific instance.
     * @returns {this}
     */
    public setInstance(instance: boolean): this {
        this.activity.instance = instance;
        return this;
    }

    public clearDetails(): this {
        this.activity.details = undefined;
        return this;
    }
    public clearState(): this {
        this.activity.state = undefined;
        return this;
    }
    public clearTimestamps(): this {
        this.activity.timestamps = undefined;
        return this;
    }
    public clearParty(): this {
        this.activity.party = undefined;
        return this;
    }
    public clearButtons(): this {
        this.activity.buttons = undefined;
        this.activity.metadata = undefined;
        return this;
    }
    public clearSecrets(): this {
        this.activity.secrets = undefined;
        return this;
    }
    public clearInstance(): this {
        this.activity.instance = undefined;
        return this;
    }
    public clearLargeImage(): this {
        this.assets.large_image = undefined;
        this.assets.large_text = undefined;
        return this;
    }
    public clearSmallImage(): this {
        this.assets.small_image = undefined;
        this.assets.small_text = undefined;
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
        } catch {
            logger.error(`Could not parse asset URL for expiry check: ${assetKey}`);
        }
        return null;
    }

    private async renewAssetIfNeeded(cacheKey: string, assetKey: string): Promise<string> {
        const expiryTimeMs = this.getExpiryTime(assetKey);
        if (expiryTimeMs && expiryTimeMs < Date.now() + 3600000) {
            // logger.info(`Asset ${cacheKey} is expiring soon. Renewing...`);
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
            // logger.info('Running background asset renewal check...');
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
            // logger.info('Stopped background asset renewal process.');
        }
    }

    /**
     * Ensure assets are fetched for the current application ID.
     */
    private async ensureAppAssetsLoaded(): Promise<void> {
        if (!this.applicationAssetsCache.has(this.applicationId)) {
            logger.info(`Fetching assets for Application ID: ${this.applicationId}...`);
            const assets = await this.imageService.fetchApplicationAssets(this.applicationId);
            const assetMap = new Map<string, string>();
            assets.forEach((asset) => {
                assetMap.set(asset.name, asset.id);
            });
            this.applicationAssetsCache.set(this.applicationId, assetMap);
            logger.info(`Loaded ${assets.length} assets for Application ID: ${this.applicationId}.`);
        }
    }

    private async resolveImage(image: RpcImage | undefined): Promise<string | undefined> {
        if (!image) return undefined;
        const cacheKey = image.getCacheKey();
        if (cacheKey.startsWith('app_asset:')) {
            await this.ensureAppAssetsLoaded();
            const assetName = cacheKey.substring('app_asset:'.length);
            const appAssets = this.applicationAssetsCache.get(this.applicationId);
            const assetId = appAssets?.get(assetName);
            if (!assetId) {
                logger.warn(`Asset with name "${assetName}" not found for Application ID ${this.applicationId}.`);
                return undefined;
            }
            return assetId;
        }

        if (this.resolvedAssetsCache.size >= this.MAX_CACHE_SIZE && !this.resolvedAssetsCache.has(cacheKey)) {
            const oldestKey = this.resolvedAssetsCache.keys().next().value;
            if (oldestKey) {
                this.resolvedAssetsCache.delete(oldestKey);
            }
        }

        const cachedAsset = this.resolvedAssetsCache.get(cacheKey);

        if (cachedAsset) {
            return await this.renewAssetIfNeeded(cacheKey, cachedAsset);
        }

        const resolvedAsset = await image.resolve(this.imageService);
        if (resolvedAsset) {
            if (resolvedAsset.startsWith('app_asset:')) {
                return this.resolveImage(image);
            }

            this.resolvedAssetsCache.set(cacheKey, resolvedAsset);
        }
        return resolvedAsset;
    }

    /**
     * Publicly accessible method to build the Activity object.
     * Used by Client to aggregate activities from multiple RPC instances.
     * @returns {Promise<Activity | null>} The constructed activity or null if empty.
     */
    public async buildActivity(): Promise<Activity | null> {
        if (Object.keys(this.activity).length === 0 && !this.assets.large_image && !this.assets.small_image) {
            return null;
        }

        const large_image = await this.resolveImage(this.assets.large_image);
        const small_image = await this.resolveImage(this.assets.small_image);

        const finalAssets: { large_image?: string; large_text?: string; small_image?: string; small_text?: string } = {
            large_text: this.assets.large_text,
            small_text: this.assets.small_text,
        };
        if (large_image) finalAssets.large_image = large_image;
        if (small_image) finalAssets.small_image = small_image;

        const finalActivity = { ...this.activity };
        finalActivity.assets = large_image || small_image ? finalAssets : undefined;
        finalActivity.application_id = this.applicationId;
        finalActivity.platform = this.platform;
        if (!finalActivity.name) {
            finalActivity.name = 'hieuxyzRPC';
        }
        if (typeof finalActivity.type === 'undefined') {
            finalActivity.type = ActivityType.Playing;
        }

        return this.cleanupNulls(finalActivity) as Activity;
    }

    /**
     * Build the final Rich Presence payload and notify the Client to send it to Discord.
     * @returns {Promise<void>}
     */
    public async build(): Promise<void> {
        await this.onUpdate();
    }

    /**
     * Sends an update to an existing RPC.
     * This is essentially an alias for `build()`.
     * @returns {Promise<void>}
     */
    public async updateRPC(): Promise<void> {
        await this.build();
    }

    /**
     * Clears the current Rich Presence from the user's profile and resets the builder.
     */
    public clear(): void {
        this.activity = {};
        this.assets = {};
        this.applicationId = '1416676323459469363'; // Reset to default
        this.platform = 'desktop'; // Reset to default
        logger.info('RPC instance cleared.');
        this.onUpdate();
    }

    /**
     * Manually clear the asset cache to free memory.
     */
    public clearCache(): void {
        this.resolvedAssetsCache.clear();
        this.applicationAssetsCache.clear();
        logger.info('RPC Asset cache has been cleared.');
    }

    /**
     * Permanently destroy this RPC instance.
     * Stops renewal timers and clears memory.
     */
    public destroy(): void {
        this.stopBackgroundRenewal();
        this.clearCache();
        this.activity = {};
        this.assets = {};
    }

    /**
     * Get the current status set for this RPC instance.
     */
    public get currentStatus() {
        return this.status;
    }
}
