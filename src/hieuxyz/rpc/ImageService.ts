import axios, { AxiosInstance, AxiosError } from 'axios';
import * as fs from 'fs';
import FormData from 'form-data';
import { logger } from '../utils/logger';

export interface DiscordAsset {
    id: string;
    type: number;
    name: string;
}

/**
 * A service to handle external image proxying and local image uploading.
 * Interact with a backend API service to manage image assets.
 */
export class ImageService {
    private apiClient: AxiosInstance;

    /**
     * Create an ImageService instance.
     * @param apiBaseUrl - The base URL of the image upload/proxy API.
     */
    constructor(apiBaseUrl: string = 'https://rpc.hieuxyz.fun') {
        this.apiClient = axios.create({
            baseURL: apiBaseUrl,
        });
    }

    /**
     * Get an asset key proxy for an external image URL.
     * @param url - URL of external image.
     * @returns {Promise<string | undefined>} Asset key resolved or undefined if failed.
     */
    public async getExternalUrl(url: string): Promise<string | undefined> {
        try {
            const response = await this.apiClient.get('/image', { params: { url } });
            if (response.data && response.data.id) {
                return response.data.id;
            }
        } catch (error) {
            logger.error(`Unable to get external proxy URL for ${url}: ${error}`);
        }
        return undefined;
    }

    /**
     * Upload an image from the local file system to the image service.
     * @param filePath - Path to the image file.
     * @param fileName - File name to use when uploading.
     * @returns {Promise<string | undefined>} Asset key resolved or undefined if failed.
     */
    public async uploadImage(filePath: string, fileName: string): Promise<string | undefined> {
        try {
            if (!fs.existsSync(filePath)) {
                logger.error(`File not found at path: ${filePath}`);
                return undefined;
            }

            const form = new FormData();
            form.append('file', fs.createReadStream(filePath));
            form.append('file_name', fileName);

            const response = await this.apiClient.post('/upload', form, {
                headers: {
                    ...form.getHeaders(),
                },
            });

            if (response.data && response.data.id) {
                return response.data.id;
            }
        } catch (error) {
            logger.error(`Unable to upload image ${fileName}: ${error}`);
        }
        return undefined;
    }

    /**
     * Requests a new signed URL for an expired or expiring attachment asset.
     * @param assetId The asset ID part of the URL (e.g., "channel_id/message_id/filename.ext...")
     * @returns {Promise<string | undefined>} The new asset key or undefined if it failed.
     */
    public async renewImage(assetId: string): Promise<string | undefined> {
        try {
            const response = await this.apiClient.post('/renew', { asset_id: assetId });
            if (response.data && response.data.id) {
                logger.info(`Successfully renewed asset: ${assetId}`);
                return response.data.id;
            }
        } catch (error) {
            const err = error as AxiosError;
            logger.error(`Failed to renew asset ${assetId}: ${err.response?.data || err.message}`);
        }
        return undefined;
    }

    /**
     * Fetch all assets for a specific Discord Application.
     * @param applicationId - The ID of the application.
     * @returns {Promise<DiscordAsset[]>} List of assets (id, name, type).
     */
    public async fetchApplicationAssets(applicationId: string): Promise<DiscordAsset[]> {
        try {
            const url = `https://discord.com/api/v9/oauth2/applications/${applicationId}/assets`;
            const response = await axios.get<DiscordAsset[]>(url);
            return response.data;
        } catch (error) {
            const err = error as AxiosError;
            logger.error(
                `Failed to fetch assets for application ${applicationId}: ${err.message}. Ensure the App ID is correct.`,
            );
            return [];
        }
    }
}
