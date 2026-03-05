/**
 * CBN Ads — Service Worker
 *
 * Strategy:
 * - Navigation requests: network-first, fall back to cached shell
 * - Static assets (JS/CSS/fonts/images): stale-while-revalidate
 * - API requests (/api/*): always network-only — never cached
 */

const CACHE_VERSION = 'v2';
const SHELL_CACHE = `cbn-ads-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `cbn-ads-assets-${CACHE_VERSION}`;

// Minimal offline shell — a simple HTML page the user sees when fully offline
const OFFLINE_SHELL = '/';

// On install: pre-cache the app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll([OFFLINE_SHELL])),
    );
    // Activate immediately without waiting for old SW to be gone
    self.skipWaiting();
});

// On activate: clean up old caches from previous versions
self.addEventListener('activate', (event) => {
    const allowedCaches = [SHELL_CACHE, ASSET_CACHE];
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => !allowedCaches.includes(key))
                    .map((key) => caches.delete(key)),
            ),
        ),
    );
    // Take control of all pages immediately
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Skip non-GET requests
    if (request.method !== 'GET') return;

    // 2. Skip cross-origin requests (CDN, Supabase, external APIs)
    if (url.origin !== self.location.origin) return;

    // 3. API routes — always network-only, never intercept
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_create/')) return;

    // 3b. Dev/HMR routes — never intercept
    if (
        url.pathname.startsWith('/@vite/') ||
        url.pathname.startsWith('/@id/') ||
        url.pathname.startsWith('/src/') ||
        url.pathname.startsWith('/node_modules/')
    ) return;

    // 4. Static assets (JS, CSS, fonts, images) — stale-while-revalidate
    if (isStaticAsset(url.pathname)) {
        event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
        return;
    }

    // 5. Navigation requests (HTML) — network-first, fall back to shell
    if (request.mode === 'navigate') {
        event.respondWith(networkFirstWithShellFallback(request));
        return;
    }
});

// ─── Strategies ────────────────────────────────────────────────────────────

async function networkFirstWithShellFallback(request) {
    try {
        const response = await fetch(request);
        // Update the shell cache with the fresh response
        const cache = await caches.open(SHELL_CACHE);
        cache.put(OFFLINE_SHELL, response.clone());
        return response;
    } catch {
        // Network failed — return the cached shell so the React app can still boot
        const cached = await caches.match(OFFLINE_SHELL, { cacheName: SHELL_CACHE });
        return cached ?? Response.error();
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    // Kick off network request in the background regardless
    const networkPromise = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    });

    // Return cached immediately if available, otherwise wait for network
    return cached ?? networkPromise;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isStaticAsset(pathname) {
    return (
        pathname.startsWith('/assets/') ||
        pathname.startsWith('/icons/') ||
        /\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|webp|ico)$/.test(pathname)
    );
}
