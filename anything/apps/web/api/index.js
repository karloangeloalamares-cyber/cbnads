import { handle } from 'hono/vercel';
// Import the built production node server directly.
// The react-router-hono-server builder compiles the __create/index.ts into this output file.
import app from '../build/server/index.js';

export default handle(app);
