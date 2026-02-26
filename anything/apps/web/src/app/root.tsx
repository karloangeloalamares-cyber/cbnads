import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import './global.css';

export const links = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <link
          rel="icon"
          href="https://ucarecdn.com/a2982e14-2f62-440f-a8fc-8d1ae2c48c20/-/format/auto/"
          type="image/png"
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
