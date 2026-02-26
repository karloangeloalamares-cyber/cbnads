import { handle } from 'hono/vercel';

let cachedHandler;

function getHandler() {
  if (!cachedHandler) {
    console.log('[vercel-fn] Importing server module...');
    cachedHandler = import('../build/server/index.js')
      .then(async (mod) => {
        console.log('[vercel-fn] Module loaded. Awaiting createServer()...');
        console.log('[vercel-fn] mod.default type:', typeof mod.default);

        const app = await Promise.race([
          Promise.resolve(mod.default),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('createServer() timed out after 25s')), 25000)
          ),
        ]);

        console.log('[vercel-fn] App resolved. Type:', typeof app, 'fetch:', typeof app?.fetch);
        if (!app || typeof app.fetch !== 'function') {
          throw new Error(
            'Expected Hono app with .fetch(), got: ' +
              typeof app +
              ' keys: ' +
              Object.keys(app || {}).join(', ')
          );
        }
        return handle(app);
      })
      .catch((err) => {
        cachedHandler = null; // allow retry on next request
        throw err;
      });
  }
  return cachedHandler;
}

export default async function handler(request, context) {
  try {
    const h = await getHandler();

    // Vercel routes send /(.*) → /api?__pathname=/$1
    const url = new URL(request.url, `https://${request.headers.get('host') || 'localhost'}`);
    const pathname = url.searchParams.get('__pathname');
    if (pathname) {
      url.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
      url.searchParams.delete('__pathname');
      request = new Request(url, request);
    }

    return await h(request, context);
  } catch (error) {
    console.error('[vercel-fn] Handler error:', error);
    return new Response(
      JSON.stringify({
        error: 'Function crashed',
        message: error?.message,
        stack: error?.stack,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
