const CACHE_VERSION = "v3";
const SHELL_CACHE = `cbn-ads-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `cbn-ads-assets-${CACHE_VERSION}`;
const OFFLINE_SHELL = "/";
const PRECACHE_URLS = [
  OFFLINE_SHELL,
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];
const OFFLINE_DOCUMENT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>CBN Ads</title>
    <style>
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }
      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      section {
        max-width: 480px;
        border: 1px solid #e2e8f0;
        border-radius: 24px;
        background: white;
        padding: 24px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 1.5rem;
      }
      p {
        margin: 0;
        line-height: 1.6;
        color: #475569;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>You're offline</h1>
        <p>CBN Ads can still open cached pages, but live dashboard data and form submissions need an internet connection.</p>
      </section>
    </main>
  </body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          const response = await fetch(url, { cache: "no-cache" });
          if (response.ok) {
            await cache.put(url, response);
          }
        }),
      );
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const allowedCaches = [SHELL_CACHE, ASSET_CACHE];
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !allowedCaches.includes(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_create/")) {
    return;
  }

  if (
    url.pathname.startsWith("/@vite/") ||
    url.pathname.startsWith("/@id/") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/node_modules/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithShellFallback(request));
    return;
  }

  if (isStaticAsset(url.pathname, request.destination)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
  }
});

async function networkFirstWithShellFallback(request) {
  try {
    const response = await fetch(request);
    if (response?.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(OFFLINE_SHELL, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(OFFLINE_SHELL, { cacheName: SHELL_CACHE });
    if (cached) {
      return cached;
    }

    return new Response(OFFLINE_DOCUMENT, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response?.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || networkPromise;
}

function isStaticAsset(pathname, destination = "") {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/icons/") ||
    ["style", "script", "font", "image"].includes(destination) ||
    /\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|webp|ico)$/.test(pathname)
  );
}
