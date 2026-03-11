import { db, table } from "./supabase-db.js";

const DUPLICATE_KEY_PATTERN = /duplicate key|unique|already exists/i;
const MAX_RATE_LIMIT_RETRIES = 4;
const RATE_LIMIT_MEMORY_STORE_KEY = "__cbnadsPublicRateLimitFallbackStore";

export const clientIpFromHeaders = (headers) => {
  const forwarded = String(headers.get("x-forwarded-for") || "").trim();
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return String(headers.get("x-real-ip") || "").trim();
};

const normalizeRateLimitKey = (key) => String(key || "").trim().slice(0, 240);

const isMissingRateLimitTableError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  return (
    (message.includes("public_submission_rate_limits") ||
      details.includes("public_submission_rate_limits")) &&
    (
      message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("schema cache") ||
      details.includes("does not exist")
    )
  );
};

const getMemoryRateLimitStore = () => {
  if (!globalThis[RATE_LIMIT_MEMORY_STORE_KEY]) {
    globalThis[RATE_LIMIT_MEMORY_STORE_KEY] = new Map();
  }
  return globalThis[RATE_LIMIT_MEMORY_STORE_KEY];
};

const consumeInMemoryRateLimit = ({ key, maxAttempts, windowMs }) => {
  const normalizedKey = normalizeRateLimitKey(key);
  if (!normalizedKey || !Number.isFinite(maxAttempts) || maxAttempts <= 0) {
    return { limited: false };
  }

  const safeWindowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000;
  const now = Date.now();
  const cutoff = now - safeWindowMs;
  const store = getMemoryRateLimitStore();

  for (const [entryKey, timestamps] of store.entries()) {
    const filtered = (Array.isArray(timestamps) ? timestamps : []).filter(
      (value) => Number(value) >= cutoff,
    );
    if (filtered.length > 0) {
      store.set(entryKey, filtered);
    } else {
      store.delete(entryKey);
    }
  }

  const attempts = store.get(normalizedKey) || [];
  if (attempts.length >= maxAttempts) {
    return { limited: true };
  }

  store.set(normalizedKey, [...attempts, now]);
  return { limited: false };
};

export async function consumePublicRateLimit({
  key,
  maxAttempts,
  windowMs,
}) {
  const normalizedKey = normalizeRateLimitKey(key);
  if (!normalizedKey || !Number.isFinite(maxAttempts) || maxAttempts <= 0) {
    return { limited: false };
  }

  const safeWindowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000;
  const supabase = db();

  try {
    for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES; attempt += 1) {
      const now = new Date();
      const nowIso = now.toISOString();
      const cutoffMs = now.getTime() - safeWindowMs;

      const { data: currentRow, error: loadError } = await supabase
        .from(table("public_submission_rate_limits"))
        .select("key, window_start, attempt_count")
        .eq("key", normalizedKey)
        .maybeSingle();
      if (loadError) {
        throw loadError;
      }

      if (!currentRow) {
        const { error: insertError } = await supabase
          .from(table("public_submission_rate_limits"))
          .insert({
            key: normalizedKey,
            window_start: nowIso,
            attempt_count: 1,
            last_seen_at: nowIso,
            created_at: nowIso,
            updated_at: nowIso,
          });

        if (!insertError) {
          return { limited: false };
        }
        if (DUPLICATE_KEY_PATTERN.test(String(insertError.message || ""))) {
          continue;
        }
        throw insertError;
      }

      const currentCount = Number(currentRow.attempt_count) || 0;
      const rowWindowStartMs = Date.parse(currentRow.window_start || "");
      const windowExpired =
        !Number.isFinite(rowWindowStartMs) || rowWindowStartMs < cutoffMs;

      if (!windowExpired && currentCount >= maxAttempts) {
        return { limited: true };
      }

      const updatedWindowStart = windowExpired ? nowIso : currentRow.window_start;
      const updatedCount = windowExpired ? 1 : currentCount + 1;
      const { data: updatedRows, error: updateError } = await supabase
        .from(table("public_submission_rate_limits"))
        .update({
          window_start: updatedWindowStart,
          attempt_count: updatedCount,
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq("key", normalizedKey)
        .eq("attempt_count", currentCount)
        .eq("window_start", currentRow.window_start)
        .select("key");

      if (updateError) {
        throw updateError;
      }

      if (Array.isArray(updatedRows) && updatedRows.length > 0) {
        return { limited: false };
      }
    }
  } catch (error) {
    if (isMissingRateLimitTableError(error)) {
      return consumeInMemoryRateLimit({ key: normalizedKey, maxAttempts, windowMs: safeWindowMs });
    }
    throw error;
  }

  return { limited: false };
}
