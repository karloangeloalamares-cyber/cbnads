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
function registerRoutes() {
  // Clear existing routes
  api.routes = [];

  // Use Vite's glob import to statically analyze and bundle route handlers.
  // Route modules are loaded lazily on first request to avoid slow serverless
  // bootstrap work for unrelated routes (for example loading native deps).
  const routeModules = import.meta.glob('../src/app/api/**/route.js');
  const paths = Object.keys(routeModules).sort((a, b) => b.length - a.length);

  for (const routeFile of paths) {
    try {
      const importer = routeModules[routeFile] as () => Promise<Record<string, Handler>>;
      let cachedRouteModule: Promise<Record<string, Handler>> | null = null;

      const loadRouteModule = () => {
        if (!cachedRouteModule) {
          cachedRouteModule = importer();
        }
        return cachedRouteModule;
      };

      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      const honoPath = getHonoPath(routeFile);

      for (const method of methods) {
        const handler: Handler = async (c) => {
          const route = await loadRouteModule();
          const routeHandler = route[method];
          if (typeof routeHandler !== 'function') {
            return c.json({ error: `Method ${method} Not Allowed` }, 405);
          }
          const params = c.req.param();
          return await routeHandler(c.req.raw, { params });
        };

        const methodLowercase = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';
        api[methodLowercase](honoPath, handler);
      }
    } catch (error) {
      console.error(`Error registering route ${routeFile}:`, error);
    }
  }
}

registerRoutes();

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
