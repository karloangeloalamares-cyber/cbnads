import { getSessionUser } from "./auth-check.js";
import { clientIpFromHeaders, consumePublicRateLimit } from "./public-rate-limit.js";

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

const buildRateLimitKey = (request, scope) => {
  const requesterIp = clientIpFromHeaders(request?.headers || new Headers()) || "unknown";
  return `${String(scope || "public-upload").trim() || "public-upload"}:${requesterIp}`;
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
