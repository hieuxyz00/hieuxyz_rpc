import { IdentifyPayload, IdentifyProperties } from './types';

/**
 * @typedef {object} ClientProperties
 * @property {string} [os] - The operating system. (e.g., 'Windows', 'Android')
 * @property {string} [browser] - The browser or client. (e.g., 'Discord Client', 'Discord Android')
 * @property {string} [device] - The device. (e.g., 'Android16')
 */
export interface ClientProperties {
    os?: string;
    browser?: string;
    device?: string;
}

export function getIdentifyPayload(token: string, properties?: ClientProperties): IdentifyPayload {
    const defaultProperties: IdentifyProperties = {
        os: 'Windows',
        browser: 'Discord Client',
        device: 'hieuxyz©rpc',
    };

    return {
        token: token,
        capabilities: 65,
        largeThreshold: 50,
        properties: { ...defaultProperties, ...properties },
        compress: true,
    };
}
