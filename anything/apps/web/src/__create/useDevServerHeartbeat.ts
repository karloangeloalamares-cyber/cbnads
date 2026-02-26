'use client';

import { useEffect } from 'react';

export function useDevServerHeartbeat() {
  useEffect(() => {
    // Keep-alive is only needed in local/dev preview sessions.
    if (import.meta.env.PROD) {
      return;
    }

    const throttleMs = 60_000 * 3;
    let lastPingAt = 0;

    const ping = () => {
      const now = Date.now();
      if (now - lastPingAt < throttleMs) {
        return;
      }

      lastPingAt = now;
      fetch('/', { method: 'GET' }).catch(() => {
        // no-op: this is only a lightweight keep-alive request
      });
    };

    const onUserAction = () => {
      ping();
    };

    const interval = window.setInterval(ping, throttleMs);
    window.addEventListener('pointerdown', onUserAction, { passive: true });
    window.addEventListener('keydown', onUserAction, { passive: true });
    window.addEventListener('touchstart', onUserAction, { passive: true });
    window.addEventListener('scroll', onUserAction, { passive: true });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pointerdown', onUserAction);
      window.removeEventListener('keydown', onUserAction);
      window.removeEventListener('touchstart', onUserAction);
      window.removeEventListener('scroll', onUserAction);
    };
  }, []);
}
