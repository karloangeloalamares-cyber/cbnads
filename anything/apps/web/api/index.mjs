import { handle } from 'hono/vercel';

// Lazy-load the server on first request. NO top-level await — Vercel's
// bundler converts ESM → CJS which doesn't support top-level await.
let cachedHandler;

function getHandler() {
  if (!cachedHandler) {
    cachedHandler = import('../build/server/index.js').then(async (mod) => {
      // mod.default is a Promise (from createServer()) — await it to get the Hono app.
      const app = await mod.default;
      if (!app) {
        throw new Error(
          'Server export not found. Exports: ' + Object.keys(mod).join(', ')
        );
      }
      return handle(app);
    });
  }
  return cachedHandler;
}

export default async function handler(request, context) {
  try {
    const h = await getHandler();

    // Vercel routes send /(.*) → /api?__pathname=/$1
    // Restore the original pathname before passing to Hono.
    const url = new URL(request.url);
    const pathname = url.searchParams.get('__pathname');
    if (pathname) {
      url.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
      url.searchParams.delete('__pathname');
      request = new Request(url, request);
    }

    return await h(request, context);
  } catch (error) {
    console.error('Vercel function error:', error);
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
