import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { CookieJar } from 'tough-cookie';
import { logger } from '../utils/logger';
import { buildRoute } from './APIRouter';
import { DiscordAPIError, HTTPError } from './errors';
import { InternalRequest } from './types';
import FormData from 'form-data';
import { HeaderBuilder } from './HeaderBuilder';
import { AsyncQueue } from '@sapphire/async-queue';

const DISCORD_API_VERSION = '9';
const BASE_URL = `https://discord.com/api/v${DISCORD_API_VERSION}`;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class HTTPClient {
    public readonly api: any;
    private apiClient: AxiosInstance;
    private cookieJar: CookieJar;
    private readonly buckets: Map<string, AsyncQueue> = new Map();
    private globalReset = 0;
    private headerBuilder?: HeaderBuilder;

    constructor(private token: string) {
        this.cookieJar = new CookieJar();
        this.api = buildRoute(this);
        this.apiClient = axios.create({
            baseURL: BASE_URL,
            validateStatus: () => true,
        });
    }

    public async initialize(): Promise<void> {
        if (this.headerBuilder) return;
        this.headerBuilder = await HeaderBuilder.create();
    }

    private getHeaders(): Record<string, string> {
        if (!this.headerBuilder) {
            throw new Error("HTTPClient not initialized. Call client.http.initialize() first.");
        }
        return {
            'Authorization': this.token,
            'Cookie': this.cookieJar.getCookieStringSync(BASE_URL),
            ...this.headerBuilder.getBaseHeaders()
        };
    }
    
    public async request(request: InternalRequest): Promise<any> {
        await this.initialize();

        const queue = this.buckets.get(request.route) ?? new AsyncQueue();
        if (!this.buckets.has(request.route)) this.buckets.set(request.route, queue);

        await queue.wait();

        try {
            return await this.execute(request);
        } finally {
            queue.shift();
        }
    }
    
    private async execute(request: InternalRequest): Promise<any> {
        if (Date.now() < this.globalReset) {
            const timeout = this.globalReset - Date.now();
            logger.warn(`[HTTP] Global rate limit active. Waiting ${timeout}ms.`);
            await sleep(timeout);
        }

        const headers = { ...this.getHeaders(), ...request.headers };
        let body = request.data;
        
        if (request.files) {
            const formData = new FormData();
            request.files.forEach((file, index) => {
                formData.append(`files[${index}]`, file.data, { filename: file.name });
            });
            if (body) {
                formData.append('payload_json', JSON.stringify(body));
            }
            body = formData;
            Object.assign(headers, formData.getHeaders());
        }

        const config: AxiosRequestConfig = {
            method: request.method,
            url: request.path,
            headers,
            data: body,
            params: request.query,
        };

        try {
            const response = await this.apiClient(config);
            return this.handleResponse(response, request);
        } catch (error: any) {
            if (axios.isAxiosError(error) && error.response) {
                return this.handleResponse(error.response, request);
            }
            request.retries = (request.retries || 0) + 1;
            if (request.retries < 3) {
                logger.warn(`[HTTP] Request failed with network error, retrying (${request.retries}/3)...`);
                await sleep(1000 * request.retries);
                return this.execute(request);
            }
            throw new HTTPError(error.message, 'NetworkError', error.response?.status ?? 500, request);
        }
    }
    
    private handleResponse(response: AxiosResponse, request: InternalRequest): Promise<any> {
        const { status, data } = response;
        
        if (status === 429) {
            const retryAfter = data.retry_after * 1000;
            logger.warn(`[HTTP] Rate limited on route ${request.route}. Retrying in ${retryAfter}ms. Global: ${data.global}`);
            if (data.global) {
                this.globalReset = Date.now() + retryAfter;
            }
            return sleep(retryAfter).then(() => this.execute(request));
        }

        if (status >= 500 && status < 600) {
             request.retries = (request.retries || 0) + 1;
             if (request.retries < 3) {
                 const sleepTime = 1000 * (request.retries ** 2);
                 logger.warn(`[HTTP] Server error ${status}. Retrying in ${sleepTime}ms.`);
                 return sleep(sleepTime).then(() => this.execute(request));
             }
        }
        
        if (status >= 200 && status < 300) {
            return Promise.resolve(data);
        }
        
        return Promise.reject(new DiscordAPIError(response, request));
    }
}