import { getSessionUser } from "./auth-check.js";
import { clientIpFromHeaders, consumePublicRateLimit } from "./public-rate-limit.js";

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

const buildRateLimitKey = (request, scope) => {
  const requesterIp = clientIpFromHeaders(request?.headers || new Headers()) || "unknown";
  return `${String(scope || "public-upload").trim() || "public-upload"}:${requesterIp}`;
};

const normalizeOrigin = (value) => {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  try {
    return new URL(text).origin;
  } catch {
    return "";
  }
};

const getAllowedRequestOrigins = (request) => {
  const allowedOrigins = new Set();
  const candidates = [
    process.env.APP_URL,
    process.env.AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VITE_APP_URL,
    process.env.VITE_PUBLIC_APP_URL,
    request?.url,
  ];

  for (const candidate of candidates) {
    const origin = normalizeOrigin(candidate);
    if (origin) {
      allowedOrigins.add(origin);
    }
  }

  return allowedOrigins;
};

const hasTrustedPublicUploadOrigin = (request) => {
  const headers = request?.headers || new Headers();
  const allowedOrigins = getAllowedRequestOrigins(request);
  if (allowedOrigins.size === 0) {
    return false;
  }

  const originHeader = normalizeOrigin(headers.get("origin"));
  if (originHeader && allowedOrigins.has(originHeader)) {
    return true;
  }

  const refererHeader = headers.get("referer");
  if (refererHeader) {
    const refererOrigin = normalizeOrigin(refererHeader);
    if (refererOrigin && allowedOrigins.has(refererOrigin)) {
      return true;
    }
  }

  return false;
};

export const enforceUploadAccess = async (
  request,
  {
    scope = "public-upload",
    maxAttempts = 20,
    windowMs = DEFAULT_WINDOW_MS,
  } = {},
) => {
  const user = await getSessionUser(request);

  if (user?.id) {
    return {
      allowed: true,
      user,
      limited: false,
      response: null,
    };
  }

  if (!hasTrustedPublicUploadOrigin(request)) {
    return {
      allowed: false,
      user: null,
      limited: false,
      response: Response.json(
        { error: "Public uploads must originate from the CBN Ads app." },
        { status: 403 },
      ),
    };
  }

  const rateLimitState = await consumePublicRateLimit({
    key: buildRateLimitKey(request, scope),
    maxAttempts,
    windowMs,
  });

  if (rateLimitState.limited) {
    return {
      allowed: false,
      user: null,
      limited: true,
      response: Response.json(
        { error: "Too many uploads. Please try again later." },
        { status: 429 },
      ),
    };
  }

  return {
    allowed: true,
    user: null,
    limited: false,
    response: null,
  };
};
