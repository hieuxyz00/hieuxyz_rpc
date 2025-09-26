import { DiscordWebSocket } from "../gateway/DiscordWebSocket";
import { Activity, PresenceUpdatePayload } from "../gateway/entities/types";
import { ImageService } from "./ImageService";
import { RpcImage } from "./RpcImage";

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

export class HieuxyzRPC {
    private websocket: DiscordWebSocket;
    private imageService: ImageService;
    private activity: Partial<Activity> = {};
    private assets: RpcAssets = {};
    private status: 'online' | 'dnd' | 'idle' | 'invisible' | 'offline' = 'online';
    private applicationId: string = '1416676323459469363';
    private platform: DiscordPlatform = 'desktop';
    private resolvedAssetsCache: {
        large_image?: string;
        small_image?: string;
    } = {};

    constructor(websocket: DiscordWebSocket, imageService: ImageService) {
        this.websocket = websocket;
        this.imageService = imageService;
    }

    private sanitize(str: string, length: number = 128): string {
        return str.length > length ? str.substring(0, length) : str;
    }

    public setName(name: string): this {
        this.activity.name = this.sanitize(name);
        return this;
    }

    public setDetails(details: string): this {
        this.activity.details = this.sanitize(details);
        return this;
    }

    public setState(state: string): this {
        this.activity.state = this.sanitize(state);
        return this;
    }
    
    public setType(type: number): this {
        this.activity.type = type;
        return this;
    }

    public setTimestamps(start?: number, end?: number): this {
        this.activity.timestamps = { start, end };
        return this;
    }

    public setParty(currentSize: number, maxSize: number): this {
        this.activity.party = { id: 'hieuxyz', size: [currentSize, maxSize] };
        return this;
    }

    public setLargeImage(image: RpcImage, text?: string): this {
        this.assets.large_image = image;
        if (text) this.assets.large_text = this.sanitize(text);
        delete this.resolvedAssetsCache.large_image;
        return this;
    }

    public setSmallImage(image: RpcImage, text?: string): this {
        this.assets.small_image = image;
        if (text) this.assets.small_text = this.sanitize(text);
        delete this.resolvedAssetsCache.small_image;
        return this;
    }

    public setButtons(buttons: RpcButton[]): this {
        const validButtons = buttons.slice(0, 2);
        this.activity.buttons = validButtons.map(b => this.sanitize(b.label, 32));
        this.activity.metadata = { button_urls: validButtons.map(b => b.url) };
        return this;
    }

    public setApplicationId(id: string): this {
        if (!/^\d{18,19}$/.test(id)) {
            throw new Error("Application ID must be an 18 or 19-digit number.");
        }
        this.applicationId = id;
        return this;
    }

    public setStatus(status: 'online' | 'dnd' | 'idle' | 'invisible' | 'offline'): this {
        this.status = status;
        return this;
    }
    
    public setPlatform(platform: DiscordPlatform): this {
        this.platform = platform;
        return this;
    }

    private async buildActivity(): Promise<Activity> {
        if (this.assets.large_image && !this.resolvedAssetsCache.large_image) {
            this.resolvedAssetsCache.large_image = await this.assets.large_image.resolve(this.imageService);
        }

        if (this.assets.small_image && !this.resolvedAssetsCache.small_image) {
            this.resolvedAssetsCache.small_image = await this.assets.small_image.resolve(this.imageService);
        }

        const finalAssets: { large_image?: string; large_text?: string; small_image?: string; small_text?: string } = {
            large_text: this.assets.large_text,
            small_text: this.assets.small_text,
        };
        if (this.resolvedAssetsCache.large_image) {
            finalAssets.large_image = this.resolvedAssetsCache.large_image;
        }
        if (this.resolvedAssetsCache.small_image) {
            finalAssets.small_image = this.resolvedAssetsCache.small_image;
        }

        const finalActivity = { ...this.activity };
        finalActivity.assets = finalAssets;
        finalActivity.application_id = this.applicationId;
        finalActivity.platform = this.platform;

        if (!finalActivity.name) {
            finalActivity.name = "Custom Status";
        }

        return finalActivity as Activity;
    }

    public async build(): Promise<void> {
        const activity = await this.buildActivity();
        const presencePayload: PresenceUpdatePayload = {
            since: 0,
            activities: [activity],
            status: this.status,
            afk: false,
        };
        this.websocket.sendActivity(presencePayload);
    }

    public async updateRPC(): Promise<void> {
        await this.build();
    }
}