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
  const pollingSuspendedRef = useRef(false);
  const consecutiveFailureCountRef = useRef(0);

  const suspendPolling = useCallback(() => {
    pollingSuspendedRef.current = true;
    consecutiveFailureCountRef.current = 0;
    setUnreadCount(0);
  }, []);

  const trackRequestFailure = useCallback(
    (response) => {
      const status = Number(response?.status || 0);

      if (status === 401 || status === 403 || status === 404) {
        suspendPolling();
        return true;
      }

      if (status >= 500) {
        consecutiveFailureCountRef.current += 1;
        if (consecutiveFailureCountRef.current >= 2) {
          suspendPolling();
          return true;
        }
      }

      return false;
    },
    [suspendPolling],
  );

  const resetFailureState = useCallback(() => {
    consecutiveFailureCountRef.current = 0;
  }, []);

  useEffect(() => {
    if (!enabled) {
      pollingSuspendedRef.current = false;
      consecutiveFailureCountRef.current = 0;
      return undefined;
    }
    audioRef.current = new Audio(
      "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjGH0fPTgjMGHm7A7+OZSA0PVKzn77BeGAg+ltrywnAjBS18zPDXijkIHWi57ueaTxALTqXh7rdgGAg7ktXvzHwmBS5+y+/ajT0HGGe26+eYTQ8LTqTi77RcGAg5jdLvynojBSl6xu7dkUELElyx6+uqVxQJQ5zd8r90IQUwgtD1w2w"
    );
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setUnreadCount(0);
      pollingSuspendedRef.current = false;
      consecutiveFailureCountRef.current = 0;
      return undefined;
    }
    const fetchPreferences = async () => {
      if (pollingSuspendedRef.current) {
        return;
      }

      try {
        const response = await fetchWithAdminAuth("/api/admin/notification-preferences");
        if (!response) {
          suspendPolling();
          return;
        }
        if (!response.ok) {
          trackRequestFailure(response);
          return;
        }

        resetFailureState();
        const data = await response.json();
        setSoundEnabled(data.preferences?.sound_enabled ?? true);
      } catch (_error) {
        suspendPolling();
      }
    };

    fetchPreferences();
  }, [enabled, resetFailureState, suspendPolling, trackRequestFailure]);

  const markAllAsRead = useCallback(async () => {
    if (!enabled || pollingSuspendedRef.current) {
      return;
    }
    try {
      const response = await fetchWithAdminAuth("/api/admin/pending-ads/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (response?.ok) {
        resetFailureState();
        setUnreadCount(0);
        previousCountRef.current = 0;
      } else if (response) {
        trackRequestFailure(response);
      } else {
        suspendPolling();
      }
    } catch (_error) {
      suspendPolling();
    }
  }, [enabled, resetFailureState, suspendPolling, trackRequestFailure]);

  const fetchUnreadCount = useCallback(async () => {
    if (!enabled) {
      setUnreadCount(0);
      previousCountRef.current = 0;
      initializedRef.current = false;
      pollingSuspendedRef.current = false;
      consecutiveFailureCountRef.current = 0;
      return;
    }

    if (pollingSuspendedRef.current) {
      return;
    }
    try {
      const response = await fetchWithAdminAuth("/api/admin/pending-ads/unread-count");
      if (!response) {
        suspendPolling();
        return;
      }
      if (!response.ok) {
        trackRequestFailure(response);
        return;
      }

      resetFailureState();
      const data = await response.json();
      const newCount = Number(data.count) || 0;
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
      suspendPolling();
    }
  }, [
    enabled,
    markAllAsRead,
    onViewPending,
    resetFailureState,
    soundEnabled,
    suspendPolling,
    trackRequestFailure,
  ]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    fetchUnreadCount();
    const interval = window.setInterval(fetchUnreadCount, 30_000);
    return () => window.clearInterval(interval);
  }, [enabled, fetchUnreadCount]);

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
