const bn = 453248;
const bv = "141.0.0.0";

export class HeaderBuilder {
    public userAgent: string;
    public superProperties: string;
    public clientHints: Record<string, string>;

    private constructor(
        public readonly bn: number,
        public readonly bv: string,
    ) {
        this.userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${bv} Safari/537.36`;
        
        const superPropsObject = {
            "os": "Windows",
            "browser": "Chrome",
            "device": "",
            "system_locale": "en-US",
            "browser_user_agent": this.userAgent,
            "browser_version": bv,
            "os_version": "10",
            "referrer": "",
            "referring_domain": "",
            "referrer_current": "",
            "referring_domain_current": "",
            "release_channel": "stable",
            "client_build_number": this.bn,
            "client_event_source": null,
        };
        this.superProperties = Buffer.from(JSON.stringify(superPropsObject)).toString('base64');
        
        const majorVersion = bv.split('.')[0];
        this.clientHints = {
            "sec-ch-ua": `"Not?A_Brand";v="8", "Chromium";v="${majorVersion}", "Google Chrome";v="${majorVersion}"`,
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": `"Windows"`,
        };
    }

    public static create(): HeaderBuilder {
        return new HeaderBuilder(bn, bv);
    }

    public getBaseHeaders(): Record<string, string> {
        return {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
            'Origin': 'https://discord.com',
            'Referer': 'https://discord.com/channels/@me',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': this.userAgent,
            'X-Super-Properties': this.superProperties,
            'X-Discord-Locale': 'en-US',
            'X-Debug-Options': 'bugReporterEnabled',
            ...this.clientHints
        };
    }
}