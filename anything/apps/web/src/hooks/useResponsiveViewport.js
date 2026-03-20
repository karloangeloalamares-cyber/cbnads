"use client";

import { useEffect, useState } from "react";

export const resolveViewportKind = (width = 1440) => {
  if (width < 768) {
    return "phone";
  }

  if (width < 1280) {
    return "tablet";
  }

  return "desktop";
};

const readViewport = () => {
  if (typeof window === "undefined") {
    return {
      width: 1440,
      kind: "desktop",
    };
  }

  const width = window.innerWidth || 1440;
  return {
    width,
    kind: resolveViewportKind(width),
  };
};

export function useResponsiveViewport() {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    const syncViewport = () => setViewport(readViewport());

    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);

    return () => {
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
    };
  }, []);

  return {
    width: viewport.width,
    kind: viewport.kind,
    isPhone: viewport.kind === "phone",
    isTablet: viewport.kind === "tablet",
    isDesktop: viewport.kind === "desktop",
  };
}
