import { getTodayInAppTimeZone } from "../../../../lib/timezone.js";
import { createPendingAdSubmission } from "../../utils/pending-ad-submission.js";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 20;

const getRateLimitStore = () => {
  const globalKey = "__cbnadsSubmitAdRateLimit";
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = new Map();
  }
  return globalThis[globalKey];
};

const clientIpFromHeaders = (headers) => {
  const forwarded = String(headers.get("x-forwarded-for") || "").trim();
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return String(headers.get("x-real-ip") || "").trim();
};

const isRateLimited = (key) => {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const store = getRateLimitStore();

  for (const [entryKey, timestamps] of store.entries()) {
    const filtered = timestamps.filter((value) => value >= cutoff);
    if (filtered.length === 0) {
      store.delete(entryKey);
      continue;
    }
    store.set(entryKey, filtered);
  }

  const attempts = store.get(key) || [];
  if (attempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    return true;
  }
  store.set(key, [...attempts, now]);
  return false;
};

export async function POST(request) {
  try {
    const requesterIp = clientIpFromHeaders(request.headers) || "unknown";
    const rateLimitKey = `${requesterIp}:${getTodayInAppTimeZone()}`;
    if (isRateLimited(rateLimitKey)) {
      return Response.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429 },
      );
    }

    const body = await request.json();

    // Honeypot for basic bot filtering.
    if (String(body?.website || "").trim()) {
      return Response.json({ success: true });
    }

    const result = await createPendingAdSubmission({
      request,
      submission: body,
    });

    if (result?.error) {
      return Response.json(
        {
          error: result.error,
          fully_booked_dates: result.fully_booked_dates,
        },
        { status: result.status || 400 },
      );
    }

    return Response.json({
      success: true,
      pending_ad: result.pendingAd,
    });
  } catch (error) {
    console.error("Error creating pending ad:", error);
    return Response.json({ error: "Failed to submit ad" }, { status: 500 });
  }
}
