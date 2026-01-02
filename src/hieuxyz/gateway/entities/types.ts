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

export interface IdentifyProperties {
    os: string;
    browser: string;
    device: string;
}

export interface IdentifyPayload {
    token: string;
    capabilities: number;
    largeThreshold: number;
    properties: IdentifyProperties;
    compress: boolean;
}

export enum UserFlags {
    STAFF = 1 << 0,
    PARTNER = 1 << 1,
    HYPESQUAD = 1 << 2,
    BUG_HUNTER_LEVEL_1 = 1 << 3,
    HYPESQUAD_ONLINE_HOUSE_1 = 1 << 6, // Bravery
    HYPESQUAD_ONLINE_HOUSE_2 = 1 << 7, // Brilliance
    HYPESQUAD_ONLINE_HOUSE_3 = 1 << 8, // Balance
    PREMIUM_EARLY_SUPPORTER = 1 << 9,
    TEAM_PSEUDO_USER = 1 << 10,
    BUG_HUNTER_LEVEL_2 = 1 << 14,
    VERIFIED_BOT = 1 << 16,
    VERIFIED_DEVELOPER = 1 << 17,
    CERTIFIED_MODERATOR = 1 << 18,
    BOT_HTTP_INTERACTIONS = 1 << 19,
    ACTIVE_DEVELOPER = 1 << 22,
}

export interface DiscordUser {
    id: string;
    username: string;
    discriminator: string;
    global_name?: string | null;
    avatar?: string | null;
    bot?: boolean;
    system?: boolean;
    mfa_enabled?: boolean;
    banner?: string | null;
    accent_color?: number | null;
    locale?: string;
    verified?: boolean;
    email?: string | null;
    flags?: number;
    premium_type?: number; // 0: None, 1: Nitro Classic, 2: Nitro, 3: Nitro Basic
    public_flags?: number;
    bio?: string;
    phone?: string | null;
    nsfw_allowed?: boolean;
    pronouns?: string;
    mobile?: boolean;
    desktop?: boolean;
    clan?: {
        tag: string;
        identity_guild_id: string;
        badge: string;
        identity_enabled?: boolean;
    } | null;
    primary_guild?: {
        tag: string;
        identity_guild_id: string;
        badge: string;
        identity_enabled?: boolean;
    } | null;
    purchased_flags?: number;
    premium_usage_flags?: number;
    premium?: boolean;
    premium_state?: {
        premium_subscription_type?: number;
        premium_subscription_group_role?: number;
        premium_source?: number;
    } | null;
    avatar_decoration_data?: {
        asset: string;
        sku_id: string;
        expires_at: number | null;
    } | null;
    collectibles?: {
        nameplate?: {
            asset: string;
            label: string;
            sku_id: string;
            palette?: string;
            expires_at?: number | null;
        };
    } | null;
    display_name_styles?: {
        font_id?: number;
        effect_id?: number;
        colors?: number[];
    } | null;
    banner_color?: string | null;
    age_verification_status?: number;
}

export interface Activity {
    name: string;
    type: number;
    application_id?: string;
    details?: string;
    state?: string;
    platform?: string;
    instance?: boolean;
    flags?: number;
    sync_id?: string;
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
    secrets?: {
        join?: string;
        spectate?: string;
        match?: string;
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
