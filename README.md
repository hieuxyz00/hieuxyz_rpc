# @hieuxyz/rpc

[![NPM Version](https://img.shields.io/npm/v/@hieuxyz/rpc.svg)](https://www.npmjs.com/package/@hieuxyz/rpc)
[![License](https://img.shields.io/npm/l/@hieuxyz/rpc.svg)](https://github.com/hieuxyz00/hieuxyz_rpc/blob/master/LICENSE)
[![Downloads](https://img.shields.io/npm/dt/@hieuxyz/rpc.svg)](https://www.npmjs.com/package/@hieuxyz/rpc)

An easy-to-use and powerful Discord Rich Presence (RPC) library built for the Node.js environment using TypeScript. This library is designed to simplify the creation and management of custom RPC states for Discord user accounts.

> [!WARNING]
> **I don't take any responsibility for blocked Discord accounts that used this module.**

> [!CAUTION]
> **Using this on a user account is prohibited by the [Discord TOS](https://discord.com/terms) and can lead to the account block.**
> **When using these libraries, you accept the risk of exposing your Discord Token.**

## Outstanding features

-   **Flexible Builder Pattern:** Easily build your RPC state with intuitive chainable methods.
-   **Easy to use:** The `Client` class abstracts away all the complex connection and setup logic, letting you get started with just a few lines of code.

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
import { Client, LocalImage, logger } from '@hieuxyz/rpc';

async function start() {
    const token = process.env.DISCORD_USER_TOKEN;

    if (!token) {
        logger.error("Token not found in .env file. Please set DISCORD_USER_TOKEN.");
        return;
    }

    // Initialize client with token
    const client = new Client({
        token,
        alwaysReconnect: true,
    });

    await client.run();

    client.rpc
        .setName("Visual Studio Code")
        .setDetails("Developing a new library")
        .setState("Workspace: @hieuxyz/rpc")
        .setPlatform('desktop')
        .setType(0) // 0: Playing
        .setTimestamps(Date.now())
        .setParty(1, 5)
        .setLargeImage("https://i.ibb.co/MDP0hfTM/typescript.png", "TypeScript")
        .setSmallImage(new LocalImage(path.join(__dirname, 'vscode.png')), "VS Code")
        .setButtons([
            { label: 'View on GitHub', url: 'https://github.com/hieuxyz00/hieuxyz_rpc' },
            { label: 'View on NPM', url: 'https://www.npmjs.com/package/@hieuxyz/rpc' }
        ]);

    await client.rpc.build();
    logger.info("Initial RPC has been set!");

    setTimeout(async () => {
        logger.info("Clearing RPC and resetting builder...");
        client.rpc.clear();

        client.rpc
            .setName("On a break")
            .setDetails("Thinking about the next feature")
            .setLargeImage("mp:external/dZwPAoMNVxT5qYqecH3Mfgxv1RQEdtGBU8nAspOcAo4/https/c.tenor.com/fvuYGhI1vgUAAAAC/tenor.gif", "Coffee Time");
        
        await client.rpc.build();
        logger.info("A new RPC has been set after clearing.");

    }, 20000);

    process.on('SIGINT', () => {
        logger.info("SIGINT received. Closing connection...");
        client.rpc.clear();
        client.close(true);
        process.exit(0);
    });
}

start().catch(err => {
    logger.error(`An unexpected error occurred: ${err}`);
});
```

## Advanced Usage

### Client Spoofing

You can make it appear as though you are using Discord from a different device (e.g., mobile) by providing the `properties` option during client initialization.

```typescript
import { Client } from '@hieuxyz/rpc';

const client = new Client({
    token: "YOUR_TOKEN",
    properties: {
        os: 'Android',
        browser: 'Discord Android',
        device: 'Android16',
    }
});

// ...
```

## Get Token ?

- Based: [findByProps](https://discord.com/channels/603970300668805120/1085682686607249478/1085682686607249478)

**Run code (Discord Console - [Ctrl + Shift + I])**

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
    -   `options.apiBaseUrl` (optional): Override the default image proxy service URL.
    -   `options.alwaysReconnect` (optional): If `true`, the client will attempt to reconnect even after a normal close. Defaults to `false`.
    -   `options.properties` (optional): An object to spoof client properties (OS, browser, device).
    -   `options.connectionTimeout` (optional): Timeout in milliseconds for the initial connection. Defaults to `30000`.
-   `client.run()`: Start connecting to Discord Gateway.
-   `client.rpc`: Access the instance of `HieuxyzRPC` to build the state.
-   `client.close(force?: boolean)`: Closes the connection to the Discord Gateway.
    -   `force` (optional, boolean): If `true`, the client closes permanently and will not reconnect.

### Class `HieuxyzRPC`

Main builder class for RPC.

#### Getter Properties
-   `.largeImageUrl`: Returns the resolved URL for the large image, or `null`.
-   `.smallImageUrl`: Returns the resolved URL for the small image, or `null`.

#### Setter Methods
-   `.setName(string)`: Sets the activity name (first line).
-   `.setDetails(string)`: Sets the activity details (second line).
-   `.setState(string)`: Sets the activity state (third line).
-   `.setTimestamps(start?, end?)`: Sets the start and/or end times.
-   `.setParty(current, max)`: Sets the party information.
-   `.setLargeImage(RpcImage, text?)`: Sets the large image and its tooltip text.
-   `.setSmallImage(RpcImage, text?)`: Sets the small image and its tooltip text.
-   `.setButtons(buttons[])`: Sets up to two clickable buttons. Each button is an object `{ label: string, url: string }`.
-   `.setSecrets({ join?, spectate?, match? })`: Sets secrets for game invites.
-   `.setSyncId(string)`: Sets the sync ID, used for features like Spotify track syncing.
-   `.setFlags(number)`: Sets activity flags (e.g., for instanced games). Use the `ActivityFlags` enum.
-   `.setPlatform(platform)`: Sets the platform (`'desktop'`, `'xbox'`, etc.).
-   `.setInstance(boolean)`: Marks the activity as a specific, joinable instance.
-   `.setApplicationId(string)`: Sets a custom Application ID.
-   `.setStatus('online' | ...)`: Sets the user's presence status.

#### Clearer Methods
-   `.clearDetails()`: Removes activity details.
-   `.clearState()`: Removes activity state.
-   `.clearTimestamps()`: Removes timestamps.
-   `.clearParty()`: Removes party information.
-   `.clearLargeImage()`: Removes the large image and text.
-   `.clearSmallImage()`: Removes the small image and text.
-   `.clearButtons()`: Removes all buttons.
-   `.clearSecrets()`: Removes all secrets.
-   `.clearInstance()`: Removes the instance flag.

#### Core Methods
-   `.build()`: Builds and sends the presence payload to Discord.
-   `.updateRPC()`: Alias for `build()`.
-   `.clear()`: Clears the Rich Presence from the user's profile and resets the builder.

### Types of images

-   `new ExternalImage(url)`: Use an image from an external URL (will be proxied).
-   `new LocalImage(filePath, fileName?)`: Upload a photo from your device.
-   `new RawImage(assetKey)`: Use an existing asset key directly (e.g., `spotify:track_id`).
-   `new DiscordImage(key)`: Use assets already on Discord (e.g., `mp:attachments/...`).
-   `new ApplicationImage(name)`: Use an asset name from your Discord Application (requires .setApplicationId()).
## Author

Developed by **hieuxyz**.

-   GitHub: [@hieuxyz00](https://github.com/hieuxyz00)

## Copyright

This project is licensed under the ISC License. See the `LICENSE` file for more details.