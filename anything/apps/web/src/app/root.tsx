import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import './global.css';
import AppToaster from "@/components/AppToaster";

export const links = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
        {/* Service Worker registration — runs after page load, never blocks rendering */}
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
