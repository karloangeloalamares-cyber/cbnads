import { Hono } from 'hono';
import type { Handler } from 'hono/types';

const API_BASENAME = '/api';
const api = new Hono();

// Helper function to transform file path to Hono route path
function getHonoPath(routeFile: string): string {
  let relativePath = routeFile.replace('../src/app/api', '');
  relativePath = relativePath.replace('/route.js', '');

  if (!relativePath || relativePath === '') {
    return '/';
  }

  const parts = relativePath.split('/').filter(Boolean);
  const transformedParts = parts.map((segment) => {
    const match = segment.match(/^\[(\.{3})?([^\]]+)\]$/);
    if (match) {
      const [_, dots, param] = match;
      return dots === '...' ? `:${param}{.+}` : `:${param}`;
    }
    return segment;
  });

  return `/${transformedParts.join('/')}`;
}

// Import and register all routes
async function registerRoutes() {
  // Clear existing routes
  api.routes = [];

  // Use Vite's glob import to statically analyze and bundle the route handlers
  // This avoids fs.readdir which crashes in Vercel's Serverless environment
  const routeModules = import.meta.glob('../src/app/api/**/route.js', { eager: true });
  const paths = Object.keys(routeModules).sort((a, b) => b.length - a.length);

  for (const routeFile of paths) {
    try {
      const route = routeModules[routeFile] as any;
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      const honoPath = getHonoPath(routeFile);

      for (const method of methods) {
        if (route[method]) {
          const handler: Handler = async (c) => {
            const params = c.req.param();
            return await route[method](c.req.raw, { params });
          };

          const methodLowercase = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';
          api[methodLowercase](honoPath, handler);
        }
      }
    } catch (error) {
      console.error(`Error registering route ${routeFile}:`, error);
    }
  }
}

await registerRoutes();

// Hot reload routes in development
if (import.meta.env.DEV) {
  if (import.meta.hot) {
    import.meta.hot.accept(() => {
      registerRoutes().catch((err) => {
        console.error('Error reloading routes:', err);
      });
    });
  }
}

export { api, API_BASENAME };
