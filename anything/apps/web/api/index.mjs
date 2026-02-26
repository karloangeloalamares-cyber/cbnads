import { handle } from 'hono/vercel';

let cachedHandler;

async function getHandler() {
  if (cachedHandler) {
    return cachedHandler;
  }

  // The react-router-hono-server builder compiles __create/index.ts into this output.
  // On Vercel (VERCEL=1), it exports a raw Hono app instead of starting a Node.js server.
  const serverModule = await import('../build/server/index.js');
  const app = serverModule?.default;
  if (!app) {
    throw new Error('Server app export not found');
  }

  cachedHandler = handle(app);
  return cachedHandler;
}

export default async function vercelHandler(request, context) {
  try {
    const handler = await getHandler();
    return await handler(request, context);
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
