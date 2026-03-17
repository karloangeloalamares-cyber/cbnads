import { getTodayInAppTimeZone } from "../../../../lib/timezone.js";
import { createHash } from "node:crypto";
import { createPendingAdSubmission } from "../../utils/pending-ad-submission.js";
import {
  clientIpFromHeaders,
  consumePublicRateLimit,
} from "../../utils/public-rate-limit.js";
import { getSlotCapacityErrorPayload } from "../../utils/slot-capacity-error.js";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 20;
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

const getIdempotencyStore = () => {
  const globalKey = "__cbnadsSubmitAdIdempotency";
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = new Map();
  }
  return globalThis[globalKey];
};


const hashIdempotencyNamespace = (value) =>
  createHash("sha256").update(String(value || "").trim().toLowerCase()).digest("hex").slice(0, 24);

const readIdempotencyKey = (headers, submission, requesterIp) => {
  const rawKey = String(headers.get("x-idempotency-key") || "")
    .trim()
    .slice(0, 200);

  if (!rawKey) {
    return "";
  }

  const namespaceSeed =
    String(submission?.email || "").trim().toLowerCase() ||
    String(requesterIp || "").trim().toLowerCase() ||
    "unknown";

  return `${hashIdempotencyNamespace(namespaceSeed)}:${rawKey}`.slice(0, 255);
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
    const idempotencyKey = readIdempotencyKey(request.headers, body, requesterIp);
    const responsePayload = await runWithIdempotency(idempotencyKey, async () => {
      const rateLimitState = await consumePublicRateLimit({
        key: rateLimitKey,
        maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
        windowMs: RATE_LIMIT_WINDOW_MS,
      });
      if (rateLimitState.limited) {
        return {
          status: 429,
          body: { error: "Too many submissions. Please try again later." },
        };
      }

      const result = await createPendingAdSubmission({
        request,
        submission: body,
        requireProductForMultiWeek: false,
        sourceRequestKey: idempotencyKey || null,
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
          ...(Array.isArray(result.pendingAds) ? { pending_ads: result.pendingAds } : {}),
          ...(result.series_id ? { series_id: result.series_id } : {}),
        },
      };
    });

    return Response.json(responsePayload.body, { status: responsePayload.status || 200 });
  } catch (error) {
    const slotError = getSlotCapacityErrorPayload(error);
    if (slotError) {
      return Response.json(slotError.body, { status: slotError.status });
    }

    console.error("Error creating pending ad:", error);
    return Response.json({ error: "Failed to submit ad" }, { status: 500 });
  }
}
