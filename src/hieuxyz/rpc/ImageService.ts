import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import FormData from 'form-data';
import { logger } from '../utils/logger';

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
                    ...form.getHeaders()
                }
            });

            if (response.data && response.data.id) {
                return response.data.id;
            }
        } catch (error) {
            logger.error(`Unable to upload image ${fileName}: ${error}`);
        }
        return undefined;
    }
}