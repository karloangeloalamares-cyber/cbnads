import { AsyncLocalStorage } from 'node:async_hooks';
import nodeConsole from 'node:console';
import { skipCSRFCheck } from '@auth/core';
import Credentials from '@auth/core/providers/credentials';
import { authHandler, initAuthConfig } from '@hono/auth-js';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { Hono } from 'hono';
import { contextStorage, getContext } from 'hono/context-storage';
import { cors } from 'hono/cors';
import { proxy } from 'hono/proxy';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { createRequestHandler } from 'react-router';
import { serializeError } from 'serialize-error';
import NeonAdapter from './adapter';
import { getHTMLForErrorPage } from './get-html-for-error-page';
import { isAuthAction } from './is-auth-action';
import { API_BASENAME, api } from './route-builder';

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

// ws is only needed for Neon WebSocket in Node.js environments.
// On Vercel, Neon uses fetch natively.
if (!process.env.VERCEL) {
  const ws = (await import('ws')).default;
  neonConfig.webSocketConstructor = ws;
}

const als = new AsyncLocalStorage<{ requestId: string }>();
let argon2ModulePromise: Promise<typeof import('@node-rs/argon2')> | null = null;

const getArgon2 = async () => {
  if (!argon2ModulePromise) {
    argon2ModulePromise = import('@node-rs/argon2');
  }
  return argon2ModulePromise;
};

for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = nodeConsole[method].bind(console);

  console[method] = (...args: unknown[]) => {
    const requestId = als.getStore()?.requestId;
    if (requestId) {
      original(`[traceId:${requestId}]`, ...args);
    } else {
      original(...args);
    }
  };
}

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
    })
  : null;
const adapter = pool ? NeonAdapter(pool) : null;

const app = new Hono();

app.use('*', async (c, next) => {
  Object.defineProperty(c, 'env', { value: process.env, writable: true });
  await next();
});

app.use('*', requestId());

app.use('*', (c, next) => {
  const requestId = c.get('requestId');
  return als.run({ requestId }, () => next());
});

app.use(contextStorage());

app.onError((err, c) => {
  if (c.req.method !== 'GET') {
    return c.json(
      {
        error: 'An error occurred in your app',
        details: serializeError(err),
      },
      500
    );
  }
  return c.html(getHTMLForErrorPage(err), 200);
});

if (process.env.CORS_ORIGINS) {
  app.use(
    '/*',
    cors({
      origin: process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    })
  );
}
for (const method of ['post', 'put', 'patch'] as const) {
  app[method](
    '*',
    bodyLimit({
      maxSize: 4.5 * 1024 * 1024, // 4.5mb to match vercel limit
      onError: (c) => {
        return c.json({ error: 'Body size limit exceeded' }, 413);
      },
    })
  );
}

const authSecret = process.env.AUTH_SECRET;

if (authSecret && adapter) {
  const authAdapter = adapter;
  app.use(
    '*',
    initAuthConfig((c) => ({
      secret: authSecret,
      pages: {
        signIn: '/account/signin',
        signOut: '/account/logout',
      },
      skipCSRFCheck,
      session: {
        strategy: 'jwt',
      },
      callbacks: {
        session({ session, token }) {
          if (token.sub) {
            session.user.id = token.sub;
          }
          return session;
        },
      },
      cookies: {
        csrfToken: {
          options: {
            secure: true,
            sameSite: 'none',
          },
        },
        sessionToken: {
          options: {
            secure: true,
            sameSite: 'none',
          },
        },
        callbackUrl: {
          options: {
            secure: true,
            sameSite: 'none',
          },
        },
      },
      providers: [
        Credentials({
          id: 'credentials-signin',
          name: 'Credentials Sign in',
          credentials: {
            email: {
              label: 'Email',
              type: 'email',
            },
            password: {
              label: 'Password',
              type: 'password',
            },
          },
          authorize: async (credentials) => {
            const { email, password } = credentials;
            if (!email || !password) {
              return null;
            }
            if (typeof email !== 'string' || typeof password !== 'string') {
              return null;
            }

            // logic to verify if user exists
            const user = await authAdapter.getUserByEmail(email);
            if (!user) {
              return null;
            }
            const matchingAccount = user.accounts.find(
              (account) => account.provider === 'credentials'
            );
            const accountPassword = matchingAccount?.password;
            if (!accountPassword) {
              return null;
            }

            const { verify } = await getArgon2();
            const isValid = await verify(accountPassword, password);
            if (!isValid) {
              return null;
            }

            // return user object with the their profile data
            return user;
          },
        }),
        Credentials({
          id: 'credentials-signup',
          name: 'Credentials Sign up',
          credentials: {
            email: {
              label: 'Email',
              type: 'email',
            },
            password: {
              label: 'Password',
              type: 'password',
            },
            name: { label: 'Name', type: 'text' },
            image: { label: 'Image', type: 'text', required: false },
          },
          authorize: async (credentials) => {
            const { email, password, name, image } = credentials;
            if (!email || !password) {
              return null;
            }
            if (typeof email !== 'string' || typeof password !== 'string') {
              return null;
            }

            // logic to verify if user exists
            const user = await authAdapter.getUserByEmail(email);
            if (!user) {
              const newUser = await authAdapter.createUser({
                id: crypto.randomUUID(),
                emailVerified: null,
                email,
                name: typeof name === 'string' && name.length > 0 ? name : undefined,
                image: typeof image === 'string' && image.length > 0 ? image : undefined,
              });
              await authAdapter.linkAccount({
                extraData: {
                  password: await (await getArgon2()).hash(password),
                },
                type: 'credentials',
                userId: newUser.id,
                providerAccountId: newUser.id,
                provider: 'credentials',
              });
              return newUser;
            }
            return null;
          },
        }),
      ],
    }))
  );
}
app.all('/integrations/:path{.+}', async (c, next) => {
  const queryParams = c.req.query();
  const url = `${process.env.NEXT_PUBLIC_CREATE_BASE_URL ?? 'https://www.create.xyz'}/integrations/${c.req.param('path')}${Object.keys(queryParams).length > 0 ? `?${new URLSearchParams(queryParams).toString()}` : ''}`;
  const createHost = process.env.NEXT_PUBLIC_CREATE_HOST;
  const projectGroupId = process.env.NEXT_PUBLIC_PROJECT_GROUP_ID;
  const headers: Record<string, string> = {
    ...c.req.header(),
  };

  if (createHost) {
    headers['X-Forwarded-For'] = createHost;
    headers['x-createxyz-host'] = createHost;
    headers.Host = createHost;
  }
  if (projectGroupId) {
    headers['x-createxyz-project-group-id'] = projectGroupId;
  }

  return proxy(url, {
    method: c.req.method,
    body: c.req.raw.body ?? null,
    // @ts-ignore - this key is accepted even if types not aware and is
    // required for streaming integrations
    duplex: 'half',
    redirect: 'manual',
    headers,
  });
});

if (authSecret && adapter) {
  app.use('/api/auth/*', async (c, next) => {
    if (isAuthAction(c.req.path)) {
      return authHandler()(c, next);
    }
    return next();
  });
} else {
  app.use('/api/auth/*', async (c, next) => {
    if (isAuthAction(c.req.path)) {
      return c.json({ error: 'Auth is not configured' }, 503);
    }
    return next();
  });
}
app.route(API_BASENAME, api);

let server;

if (process.env.VERCEL) {
  // On Vercel: attach React Router handler directly and export the Hono app.
  // The api/index.js Vercel function wraps this with hono/vercel's handle().
  const build = await import('virtual:react-router/server-build');
  app.use('*', async (c) => {
    const handler = createRequestHandler(build, 'production');
    return handler(c.req.raw);
  });
  server = app;
} else {
  // Local dev / Node.js: use react-router-hono-server to start HTTP server
  const { createHonoServer } = await import('react-router-hono-server/node');
  server = await createHonoServer({
    app,
    defaultLogger: false,
  });
}

export default server;
