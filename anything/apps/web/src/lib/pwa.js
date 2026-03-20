export const APP_INSTALL_DISMISS_KEY = "cbnads:pwa-install-dismissed";
export const IOS_INSTALL_HINT_DISMISS_KEY = "cbnads:ios-install-hint-dismissed";

export const resolveInstallSurfaceState = ({
  deferredPrompt = null,
  standalone = false,
  ios = false,
  iosSafari = false,
  installDismissed = false,
  iosHintDismissed = false,
}) => {
  if (standalone) {
    return {
      showAndroidInstall: false,
      showIosInstall: false,
    };
  }

  const showAndroidInstall =
    !installDismissed &&
    Boolean(deferredPrompt) &&
    typeof deferredPrompt?.prompt === "function";

  return {
    showAndroidInstall,
    showIosInstall:
      !showAndroidInstall && ios && iosSafari && !iosHintDismissed,
  };
};

export const getNavigatorUserAgent = () =>
  typeof navigator === "undefined" ? "" : String(navigator.userAgent || "");

export const isIosUserAgent = (userAgent = "", maxTouchPoints = 0) => {
  if (/iPad|iPhone|iPod/i.test(userAgent)) {
    return true;
  }

  return /Macintosh/i.test(userAgent) && Number(maxTouchPoints) > 1;
};

export const isIos = () =>
  typeof navigator !== "undefined" &&
  isIosUserAgent(getNavigatorUserAgent(), navigator.maxTouchPoints);

export const isIosSafari = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = getNavigatorUserAgent();
  return (
    isIos() &&
    /Safari/i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent)
  );
};

export const isStandalone = () => {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.matchMedia?.("(display-mode: standalone)")?.matches) {
    return true;
  }

  return Boolean(window.navigator?.standalone);
};

export const canPromptInstall = (deferredPrompt) =>
  Boolean(deferredPrompt) && typeof deferredPrompt?.prompt === "function";

export const promptInstall = async (deferredPrompt) => {
  if (!canPromptInstall(deferredPrompt)) {
    return false;
  }

  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice.catch(() => null);
  return choice?.outcome === "accepted";
};

export const isOffline = () =>
  typeof navigator !== "undefined" ? !navigator.onLine : false;
