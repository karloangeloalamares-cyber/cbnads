"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useSubmissionNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const previousCountRef = useRef(0);
  const audioRef = useRef(null);

  useEffect(() => {
    audioRef.current = new Audio(
      "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjGH0fPTgjMGHm7A7+OZSA0PVKzn77BeGAg+ltrywnAjBS18zPDXijkIHWi57ueaTxALTqXh7rdgGAg7ktXvzHwmBS5+y+/ajT0HGGe26+eYTQ8LTqTi77RcGAg5jdLvynojBSl6xu7dkUELElyx6+uqVxQJQ5zd8r90IQUwgtD1w2w"
    );
  }, []);

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const response = await fetch("/api/admin/notification-preferences");
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        setSoundEnabled(data.preferences?.sound_enabled ?? true);
      } catch (_error) {
        // Non-blocking for layout; keep defaults when endpoint is unavailable.
      }
    };

    fetchPreferences();
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/pending-ads/unread-count");
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const newCount = Number(data.count) || 0;

      if (newCount > previousCountRef.current && soundEnabled && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }

      previousCountRef.current = newCount;
      setUnreadCount(newCount);
    } catch (_error) {
      // Keep the UI working even if unread-count endpoint isn't available.
    }
  }, [soundEnabled]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = window.setInterval(fetchUnreadCount, 30_000);
    return () => window.clearInterval(interval);
  }, [fetchUnreadCount]);

  const markAllAsRead = async () => {
    try {
      const response = await fetch("/api/admin/pending-ads/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        setUnreadCount(0);
        previousCountRef.current = 0;
      }
    } catch (_error) {
      // Do nothing on failure; navigation can still continue.
    }
  };

  return {
    unreadCount,
    markAllAsRead,
    refreshCount: fetchUnreadCount,
  };
}
