"use client";

import { useEffect, useState } from "react";
import { isOffline as readOfflineState } from "@/lib/pwa";

export function useOnlineStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(readOfflineState());

    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return offline;
}
