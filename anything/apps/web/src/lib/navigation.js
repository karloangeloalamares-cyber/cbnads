const AUTH_BACK_BLOCKLIST = [
  "/account/signin",
  "/account/signup",
  "/account/reset-password",
  "/account/verify-advertiser",
];

export function navigateBackWithFallback({
  fallback = null,
  fallbackPath = "/",
  blockedPathPrefixes = AUTH_BACK_BLOCKLIST,
} = {}) {
  if (typeof window === "undefined") {
    if (typeof fallback === "function") {
      fallback();
    }
    return false;
  }

  let shouldUseHistory = false;

  try {
    const currentUrl = new URL(window.location.href);
    const referrerUrl = document.referrer ? new URL(document.referrer, currentUrl.origin) : null;
    const sameOrigin = Boolean(referrerUrl && referrerUrl.origin === currentUrl.origin);
    const isBlockedReferrer = Boolean(
      referrerUrl &&
      blockedPathPrefixes.some((prefix) => referrerUrl.pathname.startsWith(prefix)),
    );
    const currentLocation = `${currentUrl.pathname}${currentUrl.search}`;
    const referrerLocation = referrerUrl ? `${referrerUrl.pathname}${referrerUrl.search}` : "";

    shouldUseHistory = Boolean(
      window.history.length > 1 &&
      sameOrigin &&
      referrerLocation &&
      referrerLocation !== currentLocation &&
      !isBlockedReferrer
    );
  } catch {
    shouldUseHistory = false;
  }

  if (shouldUseHistory) {
    window.history.back();
    return true;
  }

  if (typeof fallback === "function") {
    fallback();
    return false;
  }

  if (fallbackPath) {
    window.location.assign(fallbackPath);
  }

  return false;
}
