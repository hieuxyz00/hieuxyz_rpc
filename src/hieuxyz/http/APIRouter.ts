import { HTTPClient } from './HTTPClient';
import { RequestOptions } from './types';

const methods = ['get', 'post', 'delete', 'patch', 'put'];
const reflectors = [
    'toString',
    'valueOf',
    'inspect',
    'constructor',
    Symbol.toPrimitive,
    Symbol.for('nodejs.util.inspect.custom'),
];

// This function creates a dynamic proxy to build API routes.
// e.g., client.http.api.users('@me').get() becomes a GET request to /users/@me
export function buildRoute(manager: HTTPClient): any {
    const route = [''];

    const handler = {
        get(target: any, name: string) {
            if (reflectors.includes(name)) return () => route.join('/');

            if (methods.includes(name)) {
                return (options: RequestOptions = {}) => {
                    const routePath = route.join('/');
                    const bucketRoute = routePath.replace(/\d{17,20}/g, ':id');
                    const majorParams = /^\/(?:channels|guilds|webhooks)\/(\d{17,20})/.exec(routePath);
                    const bucket = `${name.toUpperCase()}:${bucketRoute}:${majorParams?.[1] ?? 'global'}`;

                    return manager.request({
                        method: name.toUpperCase() as any,
                        path: routePath,
                        route: bucket,
                        retries: 0,
                        ...options,
                    });
                };
            }

            route.push(name);
            return new Proxy(() => {}, handler);
        },
        apply(target: any, _: any, args: any[]) {
            route.push(...args.filter((x) => x != null));
            return new Proxy(() => {}, handler);
        },
    };

    return new Proxy(() => {}, handler);
}
