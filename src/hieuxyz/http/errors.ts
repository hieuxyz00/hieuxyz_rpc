import { AxiosResponse } from 'axios';
import { InternalRequest } from './types';

function flattenErrors(errors: any, key = ''): string[] {
    let messages: string[] = [];
    if (!errors) return messages;

    for (const fieldName in errors) {
        if (fieldName === 'message' || fieldName === 'code') continue;
        const newKey = key ? `${key}.${fieldName}` : fieldName;

        if (errors[fieldName]._errors) {
            messages.push(`${newKey}: ${errors[fieldName]._errors.map((e: any) => e.message).join(' ')}`);
        } else if (typeof errors[fieldName] === 'object') {
            messages = messages.concat(flattenErrors(errors[fieldName], newKey));
        }
    }
    return messages;
}

export class HTTPError extends Error {
    public readonly request: InternalRequest;
    public readonly status: number;

    constructor(message: string, name: string, status: number, request: InternalRequest) {
        super(message);
        this.name = name;
        this.status = status;
        this.request = request;
    }
}

export class DiscordAPIError extends HTTPError {
    public readonly code: number;

    constructor(response: AxiosResponse, request: InternalRequest) {
        const errorData = response.data || {};
        const message = errorData.message || 'An unknown API error occurred.';
        const flattened = flattenErrors(errorData.errors).join('\n');

        super(flattened ? `${message}\n${flattened}` : message, 'DiscordAPIError', response.status, request);

        this.code = errorData.code;
    }
}
