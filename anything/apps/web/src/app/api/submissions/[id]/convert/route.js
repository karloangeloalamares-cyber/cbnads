import {
  db,
  normalizePostType,
  table,
} from "../../../utils/supabase-db.js";
import { requirePermission } from "../../../utils/auth-check.js";
import { updateAdvertiserNextAdDate } from "../../../utils/update-advertiser-next-ad.js";
import { APP_TIME_ZONE } from "../../../../../lib/timezone.js";
import {
  checkBatchAvailability,
  checkSingleDateAvailability,
  expandDateRange,
} from "../../../utils/ad-availability.js";

const isMissingColumnError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42703" || /column .* does not exist/i.test(message);
};

const normalizeDateOnly = (value) => String(value || "").trim().slice(0, 10);

const normalizeCustomDateEntries = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const date = normalizeDateOnly(entry.date);
        if (!date) {
          return null;
        }
        const normalized = {
          ...entry,
          date,
        };
        if (entry.time !== undefined) {
          normalized.time = String(entry.time || "").trim();
        }
        if (entry.reminder !== undefined) {
          normalized.reminder = String(entry.reminder || "").trim();
        }
        return normalized;
      }
      return normalizeDateOnly(entry);
    })
    .filter(Boolean);

const customDateValue = (entry) =>
  entry && typeof entry === "object" ? normalizeDateOnly(entry.date) : normalizeDateOnly(entry);

export async function POST(request, { params }) {
  try {
    const auth = await requirePermission("submissions:convert", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const submissionId = String(params?.id || "").trim();
    if (!submissionId) {
      return Response.json({ error: "Submission ID is required" }, { status: 400 });
    }

    const supabase = db();
    const body = await request.json();
    const {
      advertiser_id,
      placement,
      product_id,
      post_type,
      schedule = {},
      billingAction = "go_to_billing",
      review_notes = "",
      ad_name,
      ad_text,
      notes,
      media,
    } = body;

    if (!advertiser_id || !placement || !product_id || !post_type) {
      return Response.json(
        {
          error: "advertiser_id, placement, product_id, and post_type are required",
        },
        { status: 400 },
      );
    }
    const normalizedPostType = normalizePostType(post_type);
    if (!["one_time", "daily_run", "custom_schedule"].includes(normalizedPostType)) {
      return Response.json({ error: "Unsupported post type" }, { status: 400 });
    }

    const { data: submission, error: submissionError } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    if (!submission) {
      return Response.json({ error: "Submission not found" }, { status: 404 });
    }

    const { data: advertiser, error: advertiserError } = await supabase
      .from(table("advertisers"))
      .select("id, advertiser_name, status")
      .eq("id", advertiser_id)
      .maybeSingle();
    if (advertiserError) throw advertiserError;
    if (!advertiser) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    const { data: product, error: productError } = await supabase
      .from(table("products"))
      .select("id, product_name, price")
      .eq("id", product_id)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    const customDates = normalizeCustomDateEntries(
      Array.isArray(schedule.custom_dates) ? schedule.custom_dates : submission.custom_dates,
    );
    const postDate =
      schedule.post_date ||
      schedule.start_date ||
      submission.post_date ||
      submission.post_date_from ||
      customDateValue(customDates[0]) ||
      "";

    if (normalizedPostType === "one_time" && postDate) {
      const availability = await checkSingleDateAvailability({
        supabase,
        date: postDate,
        postType: normalizedPostType,
        postTime: schedule.post_time || submission.post_time || null,
        excludeId: submissionId,
      });
      if (!availability.available) {
        return Response.json(
          {
            error: availability.is_day_full
              ? "Ad limit reached for this date. Please choose the next available day."
              : "This time slot is already taken. Please choose a different time.",
          },
          { status: 400 },
        );
      }
    }

    if (
      normalizedPostType === "daily_run" &&
      (schedule.start_date || submission.post_date_from) &&
      (schedule.end_date || submission.post_date_to)
    ) {
      const availability = await checkBatchAvailability({
        supabase,
        dates: expandDateRange(
          schedule.start_date || submission.post_date_from,
          schedule.end_date || submission.post_date_to,
        ),
        excludeId: submissionId,
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

    if (normalizedPostType === "custom_schedule" && customDates.length > 0) {
      const availability = await checkBatchAvailability({
        supabase,
        dates: customDates.map((entry) => customDateValue(entry)),
        excludeId: submissionId,
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

    const payload = {
      ad_name: String(ad_name || submission.ad_name || "").trim(),
      advertiser: advertiser.advertiser_name,
      advertiser_id: advertiser.id,
      product_id: product.id,
      product_name: product.product_name,
      price: product.price || 0,
      status: "Draft",
      payment: "Pending",
      post_type: normalizedPostType,
      placement,
      schedule: normalizedPostType === "one_time" ? postDate : null,
      post_date: normalizedPostType === "one_time" ? postDate : null,
      post_date_from:
        normalizedPostType === "daily_run"
          ? schedule.start_date || submission.post_date_from || ""
          : normalizedPostType === "one_time"
            ? postDate
            : null,
      post_date_to:
        normalizedPostType === "daily_run" ? schedule.end_date || submission.post_date_to || "" : null,
      custom_dates: normalizedPostType === "custom_schedule" ? customDates : [],
      post_time: normalizedPostType === "custom_schedule" ? null : schedule.post_time || submission.post_time || null,
      scheduled_timezone: APP_TIME_ZONE,
      reminder_minutes: submission.reminder_minutes || 15,
      ad_text: String(ad_text || submission.ad_text || "").trim() || null,
      media: Array.isArray(media) ? media : Array.isArray(submission.media) ? submission.media : [],
      notes: String(notes || submission.notes || "").trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: ad, error: adError } = await supabase
      .from(table("ads"))
      .insert(payload)
      .select("*")
      .single();
    if (adError) throw adError;

    let deleteResult = await supabase
      .from(table("pending_ads"))
      .delete()
      .eq("id", submissionId)
      .select("*")
      .maybeSingle();
    if (deleteResult.error && isMissingColumnError(deleteResult.error)) {
      deleteResult = await supabase
        .from(table("pending_ads"))
        .delete()
        .eq("id", submissionId)
        .select("*")
        .maybeSingle();
    }
    if (deleteResult.error || !deleteResult.data) {
      try {
        await supabase.from(table("ads")).delete().eq("id", ad.id);
      } catch (rollbackError) {
        console.error("Error rolling back converted ad after pending cleanup failure:", rollbackError);
      }
      throw deleteResult.error || new Error("Failed to remove converted submission");
    }

    await updateAdvertiserNextAdDate(advertiser.advertiser_name);

    return Response.json({
      submission: {
        ...submission,
        status: "approved",
        review_notes: review_notes || null,
        advertiser_id: advertiser.id,
        product_id: product.id,
        linked_ad_id: ad.id,
        linked_invoice_id: null,
        updated_at: new Date().toISOString(),
      },
      ad,
      billingContext: {
        openBilling: billingAction === "go_to_billing",
        adIds: [ad.id],
      },
    });
  } catch (error) {
    console.error("Error converting submission:", error);
    return Response.json({ error: "Failed to convert submission" }, { status: 500 });
  }
}
