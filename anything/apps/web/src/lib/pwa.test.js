import { describe, expect, it } from "vitest";
import { isIosUserAgent, resolveInstallSurfaceState } from "./pwa.js";
import { resolveViewportKind } from "@/hooks/useResponsiveViewport.js";

describe("pwa helpers", () => {
  it("detects ios user agents", () => {
    expect(isIosUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5)).toBe(
      true,
    );
    expect(isIosUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0)).toBe(false);
  });

  it("prefers the android install prompt when available", () => {
    expect(
      resolveInstallSurfaceState({
        deferredPrompt: { prompt() {} },
        standalone: false,
        ios: true,
        iosSafari: true,
      }),
    ).toEqual({
      showAndroidInstall: true,
      showIosInstall: false,
    });
  });

  it("shows the ios install education state when no prompt is available", () => {
    expect(
      resolveInstallSurfaceState({
        deferredPrompt: null,
        standalone: false,
        ios: true,
        iosSafari: true,
      }),
    ).toEqual({
      showAndroidInstall: false,
      showIosInstall: true,
    });
  });
});

describe("responsive viewport helper", () => {
  it("classifies phone, tablet, and desktop widths", () => {
    expect(resolveViewportKind(390)).toBe("phone");
    expect(resolveViewportKind(834)).toBe("tablet");
    expect(resolveViewportKind(1440)).toBe("desktop");
  });
});
