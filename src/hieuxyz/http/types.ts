// src/hieuxyz/http/types.ts

import { Method } from 'axios';

export interface RequestOptions {
    headers?: Record<string, any>;
    data?: any;
    query?: Record<string, any>;
    files?: { name: string; data: Buffer | any }[];
    reason?: string;
    auth?: boolean;
}

export interface InternalRequest extends RequestOptions {
    method: Method;
    path: string;
    route: string;
    retries: number;
}