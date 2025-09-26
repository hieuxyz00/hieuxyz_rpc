import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import FormData from 'form-data';
import { logger } from '../utils/logger';

export class ImageService {
    private apiClient: AxiosInstance;

    constructor(apiBaseUrl: string = 'https://rpc.hieuxyz.fun') {
        this.apiClient = axios.create({
            baseURL: apiBaseUrl,
        });
    }

    public async getExternalUrl(url: string): Promise<string | undefined> {
        try {
            const response = await this.apiClient.get('/image', { params: { url } });
            if (response.data && response.data.id) {
                return response.data.id;
            }
        } catch (error) {
            logger.error(`Failed to get external proxy URL for ${url}: ${error}`);
        }
        return undefined;
    }

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
            logger.error(`Failed to upload image ${fileName}: ${error}`);
        }
        return undefined;
    }
}