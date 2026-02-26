import { handle } from 'hono/vercel';

// Dynamic import with string literal – NFT still traces this.
// Wrapped in try/catch so we can surface the actual error if the server fails to load.
let honoHandler;
let initError;

try {
  const { default: app } = await import('../build/server/index.js');
  honoHandler = handle(app);
} catch (err) {
  console.error('FATAL: Server module failed to load:', err);
  initError = err;
}

const REWRITE_PATHNAME_PARAM = '__pathname';

function normalizeRequest(request) {
  const url = new URL(request.url);
  const rewrittenPathname = url.searchParams.get(REWRITE_PATHNAME_PARAM);

  if (rewrittenPathname) {
    url.pathname = rewrittenPathname.startsWith('/') ? rewrittenPathname : `/${rewrittenPathname}`;
    url.searchParams.delete(REWRITE_PATHNAME_PARAM);
    return new Request(url, request);
  }

  return request;
}

export default async function vercelHandler(request, context) {
  if (initError) {
    return new Response(
      JSON.stringify({
        error: 'Server initialization failed',
        message: initError.message,
        stack: initError.stack,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return honoHandler(normalizeRequest(request), context);
}
