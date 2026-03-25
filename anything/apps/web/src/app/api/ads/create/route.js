import { createAdAtomic, resolveAdCreateRequestKey } from "../../utils/create-ad-atomic.js";
import { dateOnly, db, normalizePostType, table } from "../../utils/supabase-db.js";
import { requireInternalUser } from "../../utils/auth-check.js";
import { updateAdvertiserNextAdDate } from "../../utils/update-advertiser-next-ad.js";
import { APP_TIME_ZONE } from "../../../../lib/timezone.js";
import {
  checkBatchAvailability,
  checkSingleDateAvailability,
  expandDateRange,
} from "../../utils/ad-availability.js";
import { getSlotCapacityErrorPayload } from "../../utils/slot-capacity-error.js";

const typeEquals = (value, target) => normalizePostType(value) === normalizePostType(target);

const normalizeCustomDateTime = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) return text;
  if (/^\d{2}:\d{2}$/.test(text)) return `${text}:00`;
  const parsed = new Date(`1970-01-01T${text}`);
  if (Number.isNaN(parsed.valueOf())) return "";
  return parsed.toISOString().slice(11, 19);
};

const normalizeCustomDateEntries = (entries, { fallbackTime = "" } = {}) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const date = dateOnly(entry.date);
        if (!date) return null;
        const time = normalizeCustomDateTime(entry.time || entry.post_time || fallbackTime);
        return {
          ...entry,
          date,
          ...(time ? { time } : {}),
          reminder: String(entry.reminder || "").trim() || "15-min",
        };
      }
      const date = dateOnly(entry);
      if (!date) return null;
      const time = normalizeCustomDateTime(fallbackTime);
      return {
        date,
        ...(time ? { time } : {}),
        reminder: "15-min",
      };
    })
    .filter(Boolean);

const duplicateWarningPayload = ({ duplicateAd, advertiser }) => ({
  warning: true,
  deduplicated: true,
  message: `Similar ad "${duplicateAd?.ad_name || "Untitled ad"}" already exists for ${advertiser} on this date and placement (Status: ${duplicateAd?.status || "Draft"}). Create anyway?`,
  duplicateId: duplicateAd?.id || null,
  duplicateName: duplicateAd?.ad_name || null,
  ad: duplicateAd || null,
});

export async function POST(request) {
  try {
    const auth = await requireInternalUser(request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const supabase = db();
    const body = await request.json();
    const {
      ad_name,
      advertiser,
      status,
      post_type,
      placement,
      schedule,
      post_date_from,
      post_date_to,
      custom_dates,
      payment,
      product_id,
      media,
      ad_text,
      post_time,
      reminder_minutes,
      skip_duplicate_check,
      advertiser_id,
      source_request_key,
    } = body;

    if (!ad_name || !advertiser || !post_type || !placement || !payment) {
      return Response.json(
        { error: "Required fields missing" },
        { status: 400 },
      );
    }

    // Run advertiser lookup, product lookup, and duplicate check in parallel
    let advertiserQuery = supabase.from(table("advertisers")).select("id, advertiser_name, status");
    advertiserQuery = advertiser_id
      ? advertiserQuery.eq("id", advertiser_id)
      : advertiserQuery.eq("advertiser_name", advertiser);

    const [
      { data: advertiserRow, error: advertiserError },
      { data: productRow, error: productError },
      { data: candidateAds, error: candidateError },
    ] = await Promise.all([
      advertiserQuery.maybeSingle(),
      product_id
        ? supabase.from(table("products")).select("id, product_name, price").eq("id", product_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      !skip_duplicate_check
        ? supabase.from(table("ads")).select("id, ad_name, status, post_type, schedule, post_date_from").eq("advertiser", advertiser).eq("placement", placement)
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (advertiserError) throw advertiserError;
    if (productError) throw productError;
    if (candidateError) throw candidateError;

    if (advertiserRow && String(advertiserRow.status || "").toLowerCase() === "inactive") {
      return Response.json(
        {
          error: `Cannot create ad for inactive advertiser "${advertiser}". Please activate the advertiser first.`,
        },
        { status: 400 },
      );
    }

    if (product_id && !productRow) {
      return Response.json({ error: "Selected product was not found" }, { status: 400 });
    }

    // Duplicate check
    if (!skip_duplicate_check && candidateAds) {
      const wantedType = normalizePostType(post_type);
      const wantedSchedule = dateOnly(schedule || post_date_from);
      const wantedFrom = dateOnly(post_date_from);

      const duplicate = candidateAds.find((ad) => {
        if (normalizePostType(ad.post_type) !== wantedType) return false;
        if (wantedType === "one_time") {
          return dateOnly(ad.schedule || ad.post_date_from) === wantedSchedule;
        }
        if (wantedType === "daily_run") {
          return dateOnly(ad.post_date_from) === wantedFrom;
        }
        return false;
      });

      if (duplicate) {
        return Response.json(
          duplicateWarningPayload({
            duplicateAd: duplicate,
            advertiser,
          }),
          { status: 200 },
        );
      }
    }

    const oneTime = typeEquals(post_type, "one_time");
    const daily = typeEquals(post_type, "daily_run");
    const custom = typeEquals(post_type, "custom_schedule");

    const scheduleDate = oneTime ? dateOnly(schedule || post_date_from) : null;
    const dateFrom = oneTime ? scheduleDate : daily ? dateOnly(post_date_from) : null;
    const dateTo = daily ? dateOnly(post_date_to) : null;
    const customDates = custom
      ? normalizeCustomDateEntries(custom_dates, { fallbackTime: post_time })
      : [];

    if (oneTime && scheduleDate) {
      const availability = await checkSingleDateAvailability({
        supabase,
        date: scheduleDate,
        postType: post_type,
        postTime: post_time,
      });

      if (!availability.available) {
        return Response.json(
          {
            error: availability.is_day_full
              ? "Ad limit reached for this date. Please choose the next available day."
              : "This time slot is already booked. Please choose a different time.",
          },
          { status: 400 },
        );
      }
    }

    if (daily && dateFrom && dateTo) {
      const availability = await checkBatchAvailability({
        supabase,
        dates: expandDateRange(dateFrom, dateTo),
      });
      const blockedDates = Object.entries(availability.results || {})
        .filter(([, info]) => info?.is_full)
        .map(([dateValue]) => dateValue);

      if (blockedDates.length > 0) {
        return Response.json(
          {
            error:
              "Ad limit reached on one or more dates in this range. Please choose different dates.",
            fully_booked_dates: blockedDates,
          },
          { status: 400 },
        );
      }
    }

    if (custom && customDates.length > 0) {
      const availability = await checkBatchAvailability({
        supabase,
        dates: customDates.map((entry) => entry.date),
      });
      const blockedDates = Object.entries(availability.results || {})
        .filter(([, info]) => info?.is_full)
        .map(([dateValue]) => dateValue);

      if (blockedDates.length > 0) {
        return Response.json(
          {
            error:
              "Ad limit reached on one or more selected dates. Please choose different dates.",
            fully_booked_dates: blockedDates,
          },
          { status: 400 },
        );
      }
    }

    const adInsertPayload = {
      ad_name,
      advertiser,
      advertiser_id: advertiserRow?.id || null,
      status: status || "Draft",
      post_type,
      placement,
      schedule: scheduleDate,
      post_date: scheduleDate,
      post_date_from: dateFrom,
      post_date_to: dateTo,
      custom_dates: customDates,
      payment,
      product_id: product_id || null,
      product_name: productRow?.product_name || null,
      price: productRow?.price || 0,
      media: Array.isArray(media) ? media : [],
      ad_text: ad_text || null,
      post_time: post_time || null,
      scheduled_timezone: APP_TIME_ZONE,
      reminder_minutes: reminder_minutes || 15,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const requestKey = resolveAdCreateRequestKey({
      request,
      bodyKey: source_request_key,
      ad: adInsertPayload,
      skipDuplicateCheck: skip_duplicate_check === true,
    });
    const createResult = await createAdAtomic({
      supabase,
      ad: {
        ...adInsertPayload,
        source_request_key: requestKey.key,
      },
    });
    const createdAd = createResult?.ad || null;
    if (!createdAd) {
      throw new Error("Ad create returned no ad row.");
    }

    if (createResult.created !== true && createResult.reason === "idempotency_reuse") {
      if (requestKey.source === "auto" && skip_duplicate_check !== true) {
        return Response.json(
          duplicateWarningPayload({
            duplicateAd: createdAd,
            advertiser,
          }),
          { status: 200 },
        );
      }

      return Response.json({
        ad: createdAd,
        deduplicated: true,
        created: false,
      });
    }

    // Fire-and-forget: updates a cached field, slight staleness is acceptable
    void updateAdvertiserNextAdDate(advertiser).catch((err) =>
      console.error("[create-ad] updateAdvertiserNextAdDate failed:", err),
    );

    return Response.json({ ad: createdAd });
  } catch (error) {
    const slotError = getSlotCapacityErrorPayload(error);
    if (slotError) {
      return Response.json(slotError.body, { status: slotError.status });
    }

    console.error("Error creating ad:", error);
    return Response.json({ error: "Failed to create ad" }, { status: 500 });
  }
}
