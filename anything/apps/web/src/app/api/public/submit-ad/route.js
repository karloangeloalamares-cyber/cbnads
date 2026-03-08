import { getTodayInAppTimeZone } from "../../../../lib/timezone.js";
import { createPendingAdSubmission } from "../../utils/pending-ad-submission.js";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 20;
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

const getRateLimitStore = () => {
  const globalKey = "__cbnadsSubmitAdRateLimit";
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = new Map();
  }
  return globalThis[globalKey];
};

const getIdempotencyStore = () => {
  const globalKey = "__cbnadsSubmitAdIdempotency";
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

const readIdempotencyKey = (headers, requesterIp) => {
  const rawKey = String(headers.get("x-idempotency-key") || "")
    .trim()
    .slice(0, 200);

  if (!rawKey) {
    return "";
  }

  return `${requesterIp}:${rawKey}`;
};

const cleanupIdempotencyStore = (store) => {
  const now = Date.now();
  for (const [entryKey, entry] of store.entries()) {
    if (entry?.promise) {
      continue;
    }
    if ((entry?.expiresAt || 0) <= now) {
      store.delete(entryKey);
    }
  }
};

const runWithIdempotency = async (idempotencyKey, operation) => {
  if (!idempotencyKey) {
    return operation();
  }

  const store = getIdempotencyStore();
  cleanupIdempotencyStore(store);

  const existing = store.get(idempotencyKey);
  if (existing?.promise) {
    return existing.promise;
  }
  if (existing?.result) {
    return existing.result;
  }

  const pendingPromise = (async () => {
    try {
      const result = await operation();
      if ((result?.status || 500) >= 500) {
        store.delete(idempotencyKey);
        return result;
      }

      store.set(idempotencyKey, {
        result,
        expiresAt: Date.now() + IDEMPOTENCY_WINDOW_MS,
      });
      return result;
    } catch (error) {
      store.delete(idempotencyKey);
      throw error;
    }
  })();

  store.set(idempotencyKey, {
    promise: pendingPromise,
    expiresAt: Date.now() + IDEMPOTENCY_WINDOW_MS,
  });

  return pendingPromise;
};

export async function POST(request) {
  try {
    const requesterIp = clientIpFromHeaders(request.headers) || "unknown";
    const body = await request.json();

    // Honeypot for basic bot filtering.
    if (String(body?.website || "").trim()) {
      return Response.json({ success: true });
    }

    const rateLimitKey = `${requesterIp}:${getTodayInAppTimeZone()}`;
    const idempotencyKey = readIdempotencyKey(request.headers, requesterIp);
    const responsePayload = await runWithIdempotency(idempotencyKey, async () => {
      if (isRateLimited(rateLimitKey)) {
        return {
          status: 429,
          body: { error: "Too many submissions. Please try again later." },
        };
      }

      const result = await createPendingAdSubmission({
        request,
        submission: body,
      });

      if (result?.error) {
        return {
          status: result.status || 400,
          body: {
            error: result.error,
            fully_booked_dates: result.fully_booked_dates,
          },
        };
      }

      return {
        status: 200,
        body: {
          success: true,
          pending_ad: result.pendingAd,
        },
      };
    });

    return Response.json(responsePayload.body, { status: responsePayload.status || 200 });
  } catch (error) {
    console.error("Error creating pending ad:", error);
    return Response.json({ error: "Failed to submit ad" }, { status: 500 });
  }
}
