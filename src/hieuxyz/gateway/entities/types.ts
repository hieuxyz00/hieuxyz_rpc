import { OpCode } from './OpCode';

export enum ActivityType {
    Playing = 0,
    Streaming = 1,
    Listening = 2,
    Watching = 3,
    Custom = 4,
    Competing = 5,
}

export type ActivityTypeName = 'playing' | 'streaming' | 'listening' | 'watching' | 'custom' | 'competing';

export type SettableActivityType = ActivityType | ActivityTypeName | number;

export interface GatewayPayload {
    op: OpCode;
    d: any;
    s?: number | null;
    t?: string | null;
}

export interface IdentifyPayload {
    token: string;
    capabilities: number;
    properties: {
        os: string;
        browser: string;
        device: string;
    };
    compress: boolean;
}

export interface Activity {
    name: string;
    type: number;
    application_id?: string;
    details?: string;
    state?: string;
    platform?: string;
    party?: {
        id?: string;
        size?: [number, number];
    };
    timestamps?: {
        start?: number;
        end?: number;
    };
    assets?: {
        large_image?: string;
        large_text?: string;
        small_image?: string;
        small_text?: string;
    };
    buttons?: string[];
    metadata?: {
        button_urls?: string[];
    };
}

export interface PresenceUpdatePayload {
    since: number;
    activities: Activity[];
    status: 'online' | 'dnd' | 'idle' | 'invisible' | 'offline';
    afk: boolean;
}
