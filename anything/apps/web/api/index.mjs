// Static import so Vercel's NFT can trace all dependencies from build/server/index.js
import { handle } from 'hono/vercel';
import app from '../build/server/index.js';

const REWRITE_PATHNAME_PARAM = '__pathname';
const honoHandler = handle(app);

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
  return honoHandler(normalizeRequest(request), context);
}
