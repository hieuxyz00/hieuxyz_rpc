import { Client } from "../Client";
import { logger } from "../utils/logger";

/**
 * Represents the options for setting a persistent custom status.
 */
export interface CustomStatusOptions {
    /** The text content of the status. Set to `null` or an empty string to clear. */
    text: string | null;
    /** (Optional) The emoji for the status. Can be a unicode character or a custom emoji name. */
    emojiName?: string;
    /** (Optional) The ID of the custom emoji. Required if `emojiName` is a custom emoji. */
    emojiId?: string;
    /** 
     * (Optional) The expiration time for the status. Can be an ISO 8601 string or a Date object. 
     * Set to `null` for no expiration. 
     */
    expiresAt?: string | Date | null;
}

/**
 * Manages interactions with the user settings API endpoint.
 * This allows for setting persistent states like custom statuses.
 */
export class UserSettings {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    /**
     * Sets a persistent custom status for the user account, visible across all sessions.
     * This mimics the behavior of setting a status from the official Discord client.
     * @param {CustomStatusOptions} options - The options for the custom status.
     * @returns {Promise<void>} A promise that resolves when the status has been set.
     * @example
     * // Set a status that expires in 1 hour
     * await client.settings.setCustomStatus({
     *   text: "Working on my project!",
     *   emojiName: "💻",
     *   expiresAt: new Date(Date.now() + 60 * 60 * 1000)
     * });
     * 
     * // Set a status that never expires
     * await client.settings.setCustomStatus({
     *   text: "Always online",
     *   emojiName: "😎",
     *   expiresAt: null
     * });
     * 
     * // Clear the custom status
     * await client.settings.setCustomStatus({ text: null });
     */
    public async setCustomStatus(options: CustomStatusOptions): Promise<void> {
        let expires_at: string | null = null;
        if (options.expiresAt) {
            expires_at = options.expiresAt instanceof Date 
                ? options.expiresAt.toISOString() 
                : options.expiresAt;
        }

        const payload = {
            custom_status: {
                text: options.text,
                emoji_id: options.emojiId,
                emoji_name: options.emojiName,
                expires_at: expires_at,
            },
        };

        try {
            await this.client.http.api.users('@me').settings.patch({ data: payload });
            logger.info("Successfully set persistent custom status.");
        } catch (error) {
            logger.error(`Failed to set persistent custom status: ${error}`);
            throw error;
        }
    }
}