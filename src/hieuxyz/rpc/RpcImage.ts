import { ImageService } from './ImageService';
import * as path from 'path';

/**
 * Base abstract class for all RPC image types.
 */
export abstract class RpcImage {
    /**
     * Resolve the image into an asset key that Discord can understand.
     * @param imageService - An instance of ImageService to handle uploads or proxies.
     * @returns {Promise<string | undefined>} Asset key has been resolved.
     */
    abstract resolve(imageService: ImageService): Promise<string | undefined>;
}

/**
 * Represents an image that already exists on Discord's servers (e.g., via proxy or previous upload).
 */
export class DiscordImage extends RpcImage {
    constructor(private imageKey: string) {
        super();
    }

    async resolve(): Promise<string | undefined> {
        return this.imageKey.startsWith('mp:') ? this.imageKey : `mp:${this.imageKey}`;
    }
}

/**
 * Represents an image from an external URL.
 */
export class ExternalImage extends RpcImage {
    constructor(private url: string) {
        super();
    }

    async resolve(imageService: ImageService): Promise<string | undefined> {
        return imageService.getExternalUrl(this.url);
    }
}

/**
 * Represents an image from the local file system.
 * Images will be uploaded via ImageService.
 */
export class LocalImage extends RpcImage {
    private fileName: string;

    constructor(private filePath: string, fileName?: string) {
        super();
        this.fileName = fileName || path.basename(filePath);
    }

    async resolve(imageService: ImageService): Promise<string | undefined> {
        return imageService.uploadImage(this.filePath, this.fileName);
    }
}

/**
 * Represents a resolved raw asset key.
 * No further processing required.
 */
export class RawImage extends RpcImage {
    constructor(private assetKey: string) {
        super();
    }

    async resolve(imageService: ImageService): Promise<string | undefined> {
        return this.assetKey;
    }
}