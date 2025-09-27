import { IdentifyPayload } from "./types";

export function getIdentifyPayload(token: string): IdentifyPayload {
    return {
        token: token,
        capabilities: 65,
        properties: {
            os: "Windows",
            browser: "Discord Client",
            device: "hieuxyz©rpc",
        },
        compress: false,
    };
}