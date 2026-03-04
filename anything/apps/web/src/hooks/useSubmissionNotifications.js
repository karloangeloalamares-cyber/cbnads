"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";
import { appToast } from "@/lib/toast";

export function useSubmissionNotifications(enabled = true, { onViewPending } = {}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const previousCountRef = useRef(0);
  const initializedRef = useRef(false);
  const audioRef = useRef(null);

  const resetNotificationState = useCallback(() => {
    setUnreadCount(0);
    previousCountRef.current = 0;
    initializedRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) {
      audioRef.current = null;
      return undefined;
    }

    audioRef.current = new Audio(
      "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjGH0fPTgjMGHm7A7+OZSA0PVKzn77BeGAg+ltrywnAjBS18zPDXijkIHWi57ueaTxALTqXh7rdgGAg7ktXvzHwmBS5+y+/ajT0HGGe26+eYTQ8LTqTi77RcGAg5jdLvynojBSl6xu7dkUELElyx6+uqVxQJQ5zd8r90IQUwgtD1w2w"
    );

    return () => {
      audioRef.current = null;
    };
  }, [enabled]);

  const fetchPreferences = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const response = await fetchWithAdminAuth("/api/admin/notification-preferences");
      if (!response?.ok) {
        return;
      }

      const data = await response.json();
      setSoundEnabled(data.preferences?.sound_enabled ?? true);
    } catch (_error) {
      // Preference refresh failures should not disable unread polling.
    }
  }, [enabled]);

  const markAllAsRead = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const response = await fetchWithAdminAuth("/api/admin/pending-ads/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response?.ok) {
        return;
      }

      setUnreadCount(0);
      previousCountRef.current = 0;
      initializedRef.current = true;
    } catch (_error) {
      // Ignore and allow the next refresh cycle to retry.
    }
  }, [enabled]);

  const fetchUnreadCount = useCallback(async () => {
    if (!enabled) {
      resetNotificationState();
      return;
    }

    try {
      const response = await fetchWithAdminAuth("/api/admin/pending-ads/unread-count");
      if (!response?.ok) {
        return;
      }

      const data = await response.json();
      const newCount = Math.max(0, Number(data.count) || 0);
      const previousCount = previousCountRef.current;

      if (initializedRef.current && newCount > previousCount) {
        if (soundEnabled && audioRef.current) {
          audioRef.current.play().catch(() => {});
        }

        appToast.submissionReceived({
          count: newCount - previousCount,
          onView:
            typeof onViewPending === "function"
              ? async () => {
                  await markAllAsRead();
                  onViewPending();
                }
              : undefined,
        });
      }

      initializedRef.current = true;
      previousCountRef.current = newCount;
      setUnreadCount(newCount);
    } catch (_error) {
      // Ignore transient auth/network issues and retry on the next poll.
    }
  }, [enabled, markAllAsRead, onViewPending, resetNotificationState, soundEnabled]);

  useEffect(() => {
    if (!enabled) {
      resetNotificationState();
      return undefined;
    }

    void fetchPreferences();
    void fetchUnreadCount();

    const interval = window.setInterval(fetchUnreadCount, 30_000);
    return () => window.clearInterval(interval);
  }, [enabled, fetchPreferences, fetchUnreadCount, resetNotificationState]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const refreshNotifications = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      void fetchPreferences();
      void fetchUnreadCount();
    };

    window.addEventListener("focus", refreshNotifications);
    document.addEventListener("visibilitychange", refreshNotifications);

    return () => {
      window.removeEventListener("focus", refreshNotifications);
      document.removeEventListener("visibilitychange", refreshNotifications);
    };
  }, [enabled, fetchPreferences, fetchUnreadCount]);

  useEffect(() => {
    if (!enabled || !hasSupabaseConfig) {
      return undefined;
    }

    const supabase = getSupabaseClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        resetNotificationState();
        return;
      }

      void fetchPreferences();
      void fetchUnreadCount();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [enabled, fetchPreferences, fetchUnreadCount, resetNotificationState]);

  return {
    unreadCount,
    markAllAsRead,
    refreshCount: fetchUnreadCount,
  };
}

async function fetchWithAdminAuth(input, init = {}) {
  if (!hasSupabaseConfig) {
    return fetch(input, init);
  }

  const supabase = getSupabaseClient();
  let {
    data: { session },
  } = await supabase.auth.getSession();

  const expiresAtMs = Number(session?.expires_at || 0) * 1000;
  const needsRefresh =
    !session?.access_token ||
    (Number.isFinite(expiresAtMs) && expiresAtMs > 0 && expiresAtMs <= Date.now() + 60_000);

  if (needsRefresh) {
    const { data: refreshData } = await supabase.auth.refreshSession();
    session = refreshData?.session || session || null;
  }

  const accessToken = String(session?.access_token || "").trim();
  if (!accessToken) {
    return null;
  }

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status !== 401) {
    return response;
  }

  const { data: refreshData } = await supabase.auth.refreshSession();
  const refreshedToken = String(refreshData?.session?.access_token || "").trim();
  if (!refreshedToken || refreshedToken === accessToken) {
    return response;
  }

  const retryHeaders = new Headers(init.headers || {});
  retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);

  return fetch(input, {
    ...init,
    headers: retryHeaders,
  });
}
