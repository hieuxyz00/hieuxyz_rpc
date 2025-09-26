import { ImageService } from './ImageService';

export abstract class RpcImage {
    abstract resolve(imageService: ImageService): Promise<string | undefined>;
}

export class DiscordImage extends RpcImage {
    constructor(private imageKey: string) {
        super();
    }

    async resolve(): Promise<string | undefined> {
        return this.imageKey.startsWith('mp:') ? this.imageKey : `mp:${this.imageKey}`;
    }
}

export class ExternalImage extends RpcImage {
    constructor(private url: string) {
        super();
    }

    async resolve(imageService: ImageService): Promise<string | undefined> {
        return imageService.getExternalUrl(this.url);
    }
}

export class LocalImage extends RpcImage {
    constructor(private filePath: string, private fileName: string) {
        super();
    }

    async resolve(imageService: ImageService): Promise<string | undefined> {
        return imageService.uploadImage(this.filePath, this.fileName);
    }
}

export class RawImage extends RpcImage {
    constructor(private assetKey: string) {
        super();
    }

    async resolve(imageService: ImageService): Promise<string | undefined> {
        return this.assetKey;
    }
}