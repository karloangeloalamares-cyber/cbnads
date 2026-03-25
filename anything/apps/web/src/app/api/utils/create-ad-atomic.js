import { createHash } from "node:crypto";

import { table } from "./supabase-db.js";

const getFirstRow = (value) => (Array.isArray(value) ? value[0] || null : value || null);

const normalizeKeyText = (value) => {
  const text = String(value ?? "").trim();
  return text || "";
};

const normalizeComparableText = (value) =>
  normalizeKeyText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");

const sortObjectKeys = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = sortObjectKeys(value[key]);
        return accumulator;
      }, {});
  }

  return value;
};

export const normalizeAdSourceRequestKey = (value) => {
  const key = normalizeComparableText(value).slice(0, 255);
  return key || null;
};

const normalizeCustomDatesForKey = (customDates) =>
  (Array.isArray(customDates) ? customDates : [])
    .map((entry) => {
      if (entry && typeof entry === "object") {
        return {
          date: normalizeKeyText(entry.date),
          time: normalizeKeyText(entry.time || entry.post_time),
          reminder: normalizeKeyText(entry.reminder),
        };
      }

      return normalizeKeyText(entry);
    })
    .filter(Boolean);

export const buildAutoAdCreateRequestKey = (ad = {}) => {
  const canonicalPayload = {
    ad_name: normalizeComparableText(ad.ad_name),
    advertiser_id: normalizeComparableText(ad.advertiser_id),
    advertiser: normalizeComparableText(ad.advertiser),
    status: normalizeComparableText(ad.status),
    payment: normalizeComparableText(ad.payment),
    post_type: normalizeComparableText(ad.post_type),
    placement: normalizeComparableText(ad.placement),
    schedule: normalizeKeyText(ad.schedule),
    post_date: normalizeKeyText(ad.post_date),
    post_date_from: normalizeKeyText(ad.post_date_from),
    post_date_to: normalizeKeyText(ad.post_date_to),
    post_time: normalizeKeyText(ad.post_time),
    scheduled_timezone: normalizeComparableText(ad.scheduled_timezone),
    reminder_minutes: Number(ad.reminder_minutes) || 0,
    product_id: normalizeComparableText(ad.product_id),
    product_name: normalizeComparableText(ad.product_name),
    price: Number(ad.price) || 0,
    ad_text: normalizeKeyText(ad.ad_text),
    notes: normalizeKeyText(ad.notes),
    custom_dates: normalizeCustomDatesForKey(ad.custom_dates),
    media: sortObjectKeys(Array.isArray(ad.media) ? ad.media : []),
  };

  const digest = createHash("sha256").update(JSON.stringify(canonicalPayload)).digest("hex");
  return `ad-create:auto:${digest}`;
};

export const resolveAdCreateRequestKey = ({
  request = null,
  bodyKey = null,
  ad = {},
  skipDuplicateCheck = false,
} = {}) => {
  const explicitBodyKey = normalizeAdSourceRequestKey(bodyKey);
  const explicitHeaderKey = normalizeAdSourceRequestKey(
    request?.headers?.get?.("x-idempotency-key"),
  );
  const explicitKey = explicitBodyKey || explicitHeaderKey;
  if (explicitKey) {
    return {
      key: `ad-create:${explicitKey}`.slice(0, 255),
      source: "explicit",
    };
  }

  if (skipDuplicateCheck === true) {
    return {
      key: null,
      source: null,
    };
  }

  return {
    key: buildAutoAdCreateRequestKey(ad),
    source: "auto",
  };
};

export const isAdSourceRequestKeyUniqueViolation = (error) => {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "");
  const details = String(error?.details || "");
  const hint = String(error?.hint || "");
  return (
    code === "23505" &&
    /source_request_key|cbnads_web_ads_source_request_key_uniq/i.test(
      `${message} ${details} ${hint}`,
    )
  );
};

const fetchAdBySourceRequestKey = async (supabase, sourceRequestKey) => {
  const normalizedKey = normalizeAdSourceRequestKey(sourceRequestKey);
  if (!normalizedKey) {
    return null;
  }

  const { data, error } = await supabase
    .from(table("ads"))
    .select("*")
    .eq("source_request_key", normalizedKey)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data || null;
};

export const createAdAtomic = async ({ supabase, ad = {} } = {}) => {
  const normalizedSourceRequestKey = normalizeAdSourceRequestKey(ad?.source_request_key);
  const insertPayload = {
    ...ad,
    source_request_key: normalizedSourceRequestKey,
  };

  const { data, error } = await supabase.from(table("ads")).insert(insertPayload).select("*").single();

  if (!error) {
    return {
      ad: data || null,
      created: true,
      reason: "created",
    };
  }

  if (normalizedSourceRequestKey && isAdSourceRequestKeyUniqueViolation(error)) {
    const existingAd = await fetchAdBySourceRequestKey(supabase, normalizedSourceRequestKey);
    if (existingAd) {
      return {
        ad: existingAd,
        created: false,
        reason: "idempotency_reuse",
      };
    }
  }

  throw error;
};

export const getAtomicAdCreateRow = getFirstRow;
