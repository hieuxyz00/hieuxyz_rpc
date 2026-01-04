import { Client, logger, ActivityType } from '../src';

async function start() {
    const token = process.env.DISCORD_USER_TOKEN;
    if (!token) {
        logger.error('Token not found in .env file.');
        return;
    }
    const client = new Client({
        token,
        alwaysReconnect: true,
    });
    await client.run();

    client.rpc.setName('playing').setType(ActivityType.Playing);

    const musicRpc = client.createRPC();
    musicRpc.setName('listening').setType(ActivityType.Listening).setApplicationId('914622396630175855'); // Use a different ID than the existing RPCs so Discord displays them

    await client.rpc.build();
    logger.info('Multi-RPC has been sent! Check Discord Profile.');

    setTimeout(async () => {
        logger.info('Updating listening...');
        musicRpc.setDetails('Sandstorm').setState('Darude');
        await musicRpc.build();
    }, 10000);

    setTimeout(() => {
        logger.info('Removing listening RPC...');
        client.removeRPC(musicRpc);
    }, 20000);

    process.on('SIGINT', () => {
        client.close(true);
        process.exit(0);
    });
}

start().catch((err) => logger.error(err));
