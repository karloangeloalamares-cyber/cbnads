import { handle } from 'hono/vercel';
// The react-router-hono-server builder compiles __create/index.ts into this output.
// On Vercel (VERCEL=1), it exports a raw Hono app instead of starting a Node.js server.
import app from '../build/server/index.js';

export default handle(app);
