import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

function isApiRequest(url: string | undefined) {
	return url === '/api' || Boolean(url?.startsWith('/api/'));
}

async function loadApiHandler(server: ViteDevServer) {
	const apiModule = await server.ssrLoadModule('/api/index.js');
	const handler = apiModule?.default;

	if (typeof handler !== 'function') {
		throw new Error('api/index.js must export a default request handler.');
	}

	return handler as (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
}

export function devApiRoutes(): Plugin {
	return {
		name: 'dev-api-routes',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				if (!isApiRequest(req.url)) {
					return next();
				}

				try {
					// Buffer the request body synchronously because `ssrLoadModule` is async.
					// If we await before adding `data` listeners, the stream may silently drain and cause requests to hang.
					const chunks: Buffer[] = [];
					let bodyError: Error | undefined;
					let bodyEnded = false;

					req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
					req.on('end', () => { bodyEnded = true; });
					req.on('error', (err) => { bodyError = err; });

					const handler = await loadApiHandler(server);

					// If stream hasn't finished reading during the load time, wait for it
					if (!bodyEnded && !bodyError) {
						await new Promise((resolve, reject) => {
							req.on('end', resolve);
							req.on('error', reject);
						});
					}
					if (bodyError) throw bodyError;

					// Attach it so `adapter.js` can read it synchronously
					(req as any).body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

					await handler(req, res);
				} catch (error) {
					server.ssrFixStacktrace(error as Error);
					console.error('[dev-api-routes] request failed', error);

					if (!res.headersSent) {
						res.statusCode = 500;
						res.setHeader('content-type', 'application/json; charset=utf-8');
						res.end(JSON.stringify({ error: 'Internal Server Error' }));
					}
				}
			});
		},
	};
}
