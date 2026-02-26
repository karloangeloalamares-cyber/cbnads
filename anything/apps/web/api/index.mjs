import { handle } from 'hono/vercel';

const serverEntryUrl = new URL('../build/server/index.js', import.meta.url);
const REWRITE_PATHNAME_PARAM = '__pathname';

let cachedHandlerPromise;

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

async function createHandler() {
  // The react-router-hono-server builder compiles __create/index.ts into this output.
  // On Vercel (VERCEL=1), it exports a raw Hono app instead of starting a Node.js server.
  const serverModule = await import(serverEntryUrl.href);
  const app = serverModule?.default;

  if (!app) {
    const exportKeys = Object.keys(serverModule ?? {});
    throw new Error(
      `Server app export not found in ${serverEntryUrl.pathname}. Exports: ${exportKeys.join(', ')}`
    );
  }

  return handle(app);
}

async function getHandler() {
  if (!cachedHandlerPromise) {
    cachedHandlerPromise = createHandler().catch((error) => {
      cachedHandlerPromise = undefined;
      throw error;
    });
  }

  return cachedHandlerPromise;
}

export default async function vercelHandler(request, context) {
  try {
    const handler = await getHandler();
    return await handler(normalizeRequest(request), context);
  } catch (error) {
    console.error('Fatal error in Vercel function bootstrap', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        code: 'FUNCTION_BOOTSTRAP_FAILED',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
