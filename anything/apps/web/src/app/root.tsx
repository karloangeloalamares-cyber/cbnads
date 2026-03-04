import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import './global.css';
import AppToaster from "@/components/AppToaster";

const SITE_DESCRIPTION =
  'Get your product or services seen by over 30,000 customers daily.';

export const links = () => [];

function AppHydrationFallback() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(17,24,39,0.08),_transparent_42%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-6 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-3 rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
              <img
                src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
                alt="CBN Ads"
                className="h-9 w-9 rounded-xl"
              />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  CBN Ads
                </p>
                <p className="text-sm font-medium text-slate-900">Loading workspace</p>
              </div>
            </div>

            <div className="space-y-4">
              <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Preparing your dashboard and syncing the latest ad data.
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-600">
                Route modules and client-side data are loading now. The app shell
                stays visible so startup does not drop to React Router&apos;s default
                fallback screen.
              </p>
            </div>

            <div className="max-w-xl space-y-3">
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-slate-900" />
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                <span className="rounded-full bg-white/90 px-3 py-1 shadow-sm">
                  Booting UI
                </span>
                <span className="rounded-full bg-white/90 px-3 py-1 shadow-sm">
                  Restoring session
                </span>
                <span className="rounded-full bg-white/90 px-3 py-1 shadow-sm">
                  Loading route bundle
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-white/80 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Startup Status
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  Initializing core panels
                </p>
              </div>
              <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
            </div>

            <div className="space-y-4">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="mb-3 h-3 w-24 animate-pulse rounded-full bg-slate-200" />
                  <div className="mb-2 h-8 animate-pulse rounded-2xl bg-slate-200/90" />
                  <div className="h-3 w-2/3 animate-pulse rounded-full bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* SEO - Issue #9 */}
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta property="og:site_name" content="CBN Ads" />
        <meta property="og:title" content="CBN Ads" />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="CBN Ads" />
        <meta name="twitter:description" content={SITE_DESCRIPTION} />
        <title>CBN Ads</title>
        <Meta />
        <Links />
        {/* Favicon */}
        <link
          rel="icon"
          href="https://ucarecdn.com/a2982e14-2f62-440f-a8fc-8d1ae2c48c20/-/format/auto/"
          type="image/png"
        />
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#111827" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CBN Ads" />
      </head>
      <body>
        {children}
        <AppToaster />
        <ScrollRestoration />
        <Scripts />
        {/* Service Worker registration - runs after page load, never blocks rendering */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .catch(function (err) { console.warn('[SW] Registration failed:', err); });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function HydrateFallback() {
  return <AppHydrationFallback />;
}
