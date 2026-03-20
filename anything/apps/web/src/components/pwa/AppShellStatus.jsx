"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, WifiOff, X } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  APP_INSTALL_DISMISS_KEY,
  IOS_INSTALL_HINT_DISMISS_KEY,
  isIos,
  isIosSafari,
  isStandalone,
  promptInstall,
  resolveInstallSurfaceState,
} from "@/lib/pwa";

const readStoredFlag = (key) => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const storeFlag = (key) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Ignore storage failures in private mode.
  }
};

export default function AppShellStatus() {
  const [hasMounted, setHasMounted] = useState(false);
  const offline = useOnlineStatus();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [standalone, setStandalone] = useState(false);
  const [pathname, setPathname] = useState("");
  const [iosDevice, setIosDevice] = useState(false);
  const [iosSafariBrowser, setIosSafariBrowser] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [iosHintDismissed, setIosHintDismissed] = useState(false);
  const [installPending, setInstallPending] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    setStandalone(isStandalone());
    setPathname(window.location.pathname || "");
    setIosDevice(isIos());
    setIosSafariBrowser(isIosSafari());
    setInstallDismissed(readStoredFlag(APP_INSTALL_DISMISS_KEY));
    setIosHintDismissed(readStoredFlag(IOS_INSTALL_HINT_DISMISS_KEY));

    const syncShellContext = () => {
      setStandalone(isStandalone());
      setPathname(window.location.pathname || "");
    };
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setInstallDismissed(readStoredFlag(APP_INSTALL_DISMISS_KEY));
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setStandalone(true);
      setInstallPending(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("resize", syncShellContext);
    window.addEventListener("popstate", syncShellContext);
    document.addEventListener("visibilitychange", syncShellContext);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("resize", syncShellContext);
      window.removeEventListener("popstate", syncShellContext);
      document.removeEventListener("visibilitychange", syncShellContext);
    };
  }, []);

  const { showAndroidInstall, showIosInstall } = useMemo(
    () =>
      resolveInstallSurfaceState({
        deferredPrompt,
        standalone,
        ios: iosDevice,
        iosSafari: iosSafariBrowser,
        installDismissed,
        iosHintDismissed,
      }),
    [
      deferredPrompt,
      standalone,
      iosDevice,
      iosSafariBrowser,
      installDismissed,
      iosHintDismissed,
    ],
  );

  const dismissAndroidInstall = () => {
    setInstallDismissed(true);
    storeFlag(APP_INSTALL_DISMISS_KEY);
  };

  const dismissIosHint = () => {
    setIosHintDismissed(true);
    storeFlag(IOS_INSTALL_HINT_DISMISS_KEY);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    setInstallPending(true);
    const installed = await promptInstall(deferredPrompt);
    setInstallPending(false);

    if (installed) {
      setDeferredPrompt(null);
      setStandalone(true);
      return;
    }

    dismissAndroidInstall();
  };

  const isWorkspaceRoute = pathname.startsWith("/ads");
  const showAndroidInstallSurface = showAndroidInstall && !isWorkspaceRoute;
  const showIosInstallSurface = showIosInstall && !isWorkspaceRoute;

  if (!hasMounted) {
    return null;
  }

  if (!offline && !showAndroidInstallSurface && !showIosInstallSurface) {
    return null;
  }

  if (isWorkspaceRoute) {
    return offline ? (
      <div className="safe-px safe-pt sticky top-0 z-[70] bg-transparent px-3 pt-2 sm:px-4">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-2.5 text-amber-950 shadow-sm backdrop-blur">
            <WifiOff size={16} className="shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">You&apos;re offline</p>
              <p className="text-xs text-amber-900/80">
                Cached views stay available, but live refreshes and submissions need a connection.
              </p>
            </div>
          </div>
        </div>
      </div>
    ) : null;
  }

  return (
    <div className="safe-px safe-pt relative z-[70] bg-transparent px-3 pt-3 sm:px-4">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2">
        {offline ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
            <WifiOff size={18} className="mt-0.5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">You&apos;re offline</p>
              <p className="mt-1 text-sm text-amber-900/80">
                Cached pages remain available, but live data refreshes and submissions need an
                internet connection.
              </p>
            </div>
          </div>
        ) : null}

        {showAndroidInstallSurface ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <Download size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">Install CBN Ads</p>
                <p className="mt-1 text-sm text-slate-600">
                  Save the app to your home screen for a cleaner full-screen workspace on mobile
                  and tablet.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:shrink-0">
              <button
                type="button"
                onClick={handleInstallClick}
                disabled={installPending}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {installPending ? "Opening prompt..." : "Install app"}
              </button>
              <button
                type="button"
                onClick={dismissAndroidInstall}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                aria-label="Dismiss install prompt"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        ) : null}

        {showIosInstallSurface ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 shadow-sm sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-sky-950">Add CBN Ads to your home screen</p>
              <p className="mt-1 text-sm text-sky-900/80">
                In Safari, tap the Share button and choose <span className="font-semibold">Add to Home Screen</span> for the installed app experience.
              </p>
            </div>

            <button
              type="button"
              onClick={dismissIosHint}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-800 transition-colors hover:bg-sky-100"
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
