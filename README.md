# @hieuxyz/rpc

[![NPM Version](https://img.shields.io/npm/v/@hieuxyz/rpc.svg)](https://www.npmjs.com/package/@hieuxyz/rpc)
[![License](https://img.shields.io/npm/l/@hieuxyz/rpc.svg)](https://github.com/hieuxyz/rpc/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dt/@hieuxyz/rpc.svg)](https://www.npmjs.com/package/@hieuxyz/rpc)

An easy-to-use Discord Rich Presence (RPC) library built for the Node.js environment using TypeScript. This library is designed to simplify the creation and management of custom RPC states for Discord user accounts.

> [!WARNING]
> **I don't take any responsibility for blocked Discord accounts that used this module.**

> [!CAUTION]
> **Using this on a user account is prohibited by the [Discord TOS](https://discord.com/terms) and can lead to the account block.**
> **When using these libraries, you accept the risk of exposing your Discord Token.**

## Outstanding features

-   **Flexible Builder Pattern:** Easily build your RPC state with intuitive chainable methods.
-   **Easy to use:** The `Client` class abstracts away all the complex connection and setup logic, letting you get started with just a few lines of code.
-   **Auto Resume:** Built-in auto reconnect and session recovery mechanism in case of network failure, ensuring your RPC is always stable.

## Install

Use `npm` or `yarn` to install libraries:

```bash
npm i @hieuxyz/rpc
```

## How to use

Here is a complete example to get you started.

**1. Create a `.env` file**

In the root directory of your project, create a file called `.env` and paste your Discord token into it.

```
DISCORD_USER_TOKEN="YOUR_DISCORD_USER_TOKEN_HERE"
```

**2. Write your source code (e.g. `index.ts`)**

```typescript
import * as path from 'path';
import { Client, RawImage, LocalImage, logger } from '@hieuxyz/rpc';

async function start() {
    const token = process.env.DISCORD_USER_TOKEN;

    if (!token) {
        logger.error("Token not found in .env file. Please set DISCORD_USER_TOKEN.");
        return;
    }

    // Initialize client with token
    const client = new Client({ token });

    await client.run();

    client.rpc
        .setName("Visual Studio Code")
        .setDetails("Developing a new library")
        .setState("Workspace: @hieuxyz/rpc")
        .setPlatform('desktop') // 'desktop', 'xbox', 'ps5', etc.
        .setType(0) // 0: Playing
        .setTimestamps(Date.now())
        .setParty(1, 5)
        .setLargeImage(new RawImage("mp:external/b7uybXM7LoJRB6_ig-65aX6dCHm2qGCEe8CiS5j7c2M/https/cdn.worldvectorlogo.com/logos/typescript.svg"), "TypeScript")
        .setSmallImage(new LocalImage(path.join(__dirname, 'vscode.png'), 'vscode.png'), "VS Code")
        .setButtons([
            { label: "View on GitHub", url: "https://github.com/hieuxyz00/hieuxyz_rpc" }
        ]);

    await client.rpc.build();

    setTimeout(async () => {
        logger.info("Updating RPC details dynamically...");

        // Change the necessary information
        client.rpc
            .setDetails("Reviewing pull requests")
            .setState("PR #01: Feature enhancement")
            .setParty(2, 5);

        await client.rpc.updateRPC();
        
        logger.info("RPC has been dynamically updated!");

    }, 15000);

    process.on('SIGINT', () => {
        logger.info("SIGINT received. Closing connection...");
        client.close();
        process.exit(0);
    });
}

start().catch(err => {
    logger.error(`An unexpected error occurred: ${err}`);
});
```

## Get Token ?

- Based: [findByProps](https://discord.com/channels/603970300668805120/1085682686607249478/1085682686607249478)

<strong>Run code (Discord Console - [Ctrl + Shift + I])</strong>

```js
window.webpackChunkdiscord_app.push([
	[Symbol()],
	{},
	req => {
		if (!req.c) return;
		for (let m of Object.values(req.c)) {
			try {
				if (!m.exports || m.exports === window) continue;
				if (m.exports?.getToken) return copy(m.exports.getToken());
				for (let ex in m.exports) {
					if (m.exports?.[ex]?.getToken && m.exports[ex][Symbol.toStringTag] !== 'IntlMessagesProxy') return copy(m.exports[ex].getToken());
				}
			} catch {}
		}
	},
]);

window.webpackChunkdiscord_app.pop();
console.log('%cWorked!', 'font-size: 50px');
console.log(`%cYou now have your token in the clipboard!`, 'font-size: 16px');
```

## API Reference

### The `Client` Class

This is the main starting point.

-   `new Client(options)`: Create a new instance.
    -   `options.token` (required): Your Discord user token.
    -   `options.imageBaseUrl` (optional): Override the default image proxy service URL.
-   `client.run()`: Start connecting to Discord Gateway.
-   `client.rpc`: Access the instance of `HieuxyzRPC` to build the state.

### Class `HieuxyzRPC`

Main builder class for RPC.

-   `.setName(string)`: Activity name (first line).
-   `.setDetails(string)`: Activity details (second line).
-   `.setState(string)`: Activity status (third line).
-   `.setTimestamps(start?, end?)`: Set start/end time.
-   `.setParty(current, max)`: Set group information.
-   `.setLargeImage(RpcImage, text?)`: Set large image and caption.
-   `.setSmallImage(RpcImage, text?)`: Set thumbnail and caption.
-   `.setButtons(buttons[])`: Set buttons (up to 2).
-   `.setPlatform(platform)`: Lay the platform (`'desktop'`, `'xbox'`, `'ps5'`).
-   `.build()`: First RPC send.
-   `.updateRPC()`: Send updates to an existing RPC.(it just call build() lol)

### Types of images

-   `new ExternalImage(url)`: Use image from an external URL (will be proxy).
-   `new LocalImage(filePath, fileName)`: Upload a photo from your device.
-   `new RawImage(assetKey)`: Use an existing asset key directly.
-   `new DiscordImage(key)`: Use assets already on Discord.

## Author

Developed by **hieuxyz**.

-   GitHub: [@hieuxyz00](https://github.com/hieuxyz00)

## Copyright

This project is licensed under the ISC License. See the `LICENSE` file for more details.