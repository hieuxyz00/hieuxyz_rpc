import * as path from 'path';
import { Client, logger } from '../src';

async function start() {
    const token = process.env.DISCORD_USER_TOKEN;

    if (!token) {
        logger.error('Token not found in .env file. Please set DISCORD_USER_TOKEN.');
        return;
    }

    const client = new Client({ token });
    await client.run();

    client.rpc
        .setName('Visual Studio Code')
        .setDetails('Update rpc library')
        .setState('Workspace: @hieuxyz/rpc')
        .setPlatform('desktop')
        .setType(0) // Playing
        .setTimestamps(Date.now())
        .setParty(1, 5)
        .setApplicationId('914622396630175855')
        .setLargeImage('ts_file')
        .setSmallImage('vs_2026')
        .setButtons([
            { label: 'View on GitHub', url: 'https://github.com/hieuxyz00/hieuxyz_rpc' },
            { label: 'View on NPM', url: 'https://www.npmjs.com/package/@hieuxyz/rpc' },
        ]);

    await client.rpc.build();
    logger.info('Initial Rich Presence has been updated. Check your Discord profile.');
    logger.info('An update will occur in 15 seconds. Press Ctrl+C to exit.');

    setTimeout(async () => {
        logger.info('Updating RPC details dynamically...');

        client.rpc.setDetails('Idle').setState('...').setParty(2, 5);
        await client.rpc.updateRPC();

        logger.info('RPC has been dynamically updated. Check your Discord profile again!');
    }, 15000);

    process.on('SIGINT', () => {
        logger.info('SIGINT received. Closing connection...');
        client.close(true);
        process.exit(0);
    });
}

start().catch((err) => {
    logger.error(`An unexpected error occurred: ${err}`);
});
