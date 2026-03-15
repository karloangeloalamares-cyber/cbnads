import { db, table } from "../../utils/supabase-db.js";
import { requireInternalUser } from "../../utils/auth-check.js";
import { APP_TIME_ZONE } from "../../../../lib/timezone.js";
import {
  buildSeriesWeekStarts,
  clampWeeks,
  normalizeDateKeyStrict,
  resolveWeeklyCreative,
} from "../../utils/series-helpers.js";
import { checkSingleDateAvailability } from "../../utils/ad-availability.js";
import { parseReminderMinutes } from "../../utils/reminder-minutes.js";

const missingColumnName = (error) => {
  const message = String(error?.message || "");
  const postgresMatch = message.match(/column\s+(?:[a-z0-9_]+\.)?([a-z0-9_]+)\s+does not exist/i);
  if (postgresMatch?.[1]) {
    return postgresMatch[1].toLowerCase();
  }
  const schemaCacheMatch = message.match(/could not find the '([^']+)' column/i);
  return schemaCacheMatch?.[1] ? schemaCacheMatch[1].toLowerCase() : "";
};

const optionalAdColumns = new Set([
  "series_id",
  "series_index",
  "series_total",
  "series_week_start",
]);

const insertAds = async (supabase, payloads) => {
  let insertPayloads = payloads.map((payload) => ({ ...payload }));

  while (true) {
    const result = await supabase.from(table("ads")).insert(insertPayloads).select("*");

    if (!result.error) {
      return Array.isArray(result.data) ? result.data : [];
    }

    const missingColumn = missingColumnName(result.error);
    if (missingColumn && optionalAdColumns.has(missingColumn)) {
      insertPayloads = insertPayloads.map((payload) => {
        if (Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
          const next = { ...payload };
          delete next[missingColumn];
          return next;
        }
        return payload;
      });
      continue;
    }

    throw result.error;
  }
};

const createSeriesId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const normalizeTime = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) return text;
  if (/^\d{2}:\d{2}$/.test(text)) return `${text}:00`;
  return "";
};

export async function POST(request) {
  try {
    const auth = await requireInternalUser(request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const supabase = db();
    const body = await request.json();
    const {
      advertiser_id,
      advertiser,
      placement,
      payment,
      status,
      product_id,
      weeks,
      series_week_start,
      ad_name,
      ad_text,
      media,
      notes,
      overrides = [],
      weeks_data = null,
    } = body || {};

    const hasWeeksData = Array.isArray(weeks_data);

    if (!advertiser_id && !advertiser) {
      return Response.json(
        { error: "advertiser_id/advertiser is required" },
        { status: 400 },
      );
    }

    if (!hasWeeksData && (!ad_name || !placement || !payment || !product_id)) {
      return Response.json(
        { error: "ad_name, placement, payment, and product_id are required" },
        { status: 400 },
      );
    }

    const normalizedWeeks = clampWeeks(weeks, { min: 2, max: 12, fallback: 4 });
    const normalizedWeekStart = normalizeDateKeyStrict(series_week_start);
    if (!normalizedWeekStart) {
      return Response.json({ error: "series_week_start is required" }, { status: 400 });
    }

    if (hasWeeksData) {
      if (weeks_data.length !== normalizedWeeks) {
        return Response.json(
          { error: `weeks_data must have ${normalizedWeeks} item(s)` },
          { status: 400 },
        );
      }

      const missingProductIndex = weeks_data.findIndex(
        (item) => !item || typeof item !== "object" || !String(item.product_id || "").trim(),
      );
      if (missingProductIndex >= 0) {
        return Response.json(
          { error: `Week ${missingProductIndex + 1} is missing product_id` },
          { status: 400 },
        );
      }

      const missingNameIndex = weeks_data.findIndex(
        (item) => !item || typeof item !== "object" || !String(item.ad_name || "").trim(),
      );
      if (missingNameIndex >= 0) {
        return Response.json(
          { error: `Week ${missingNameIndex + 1} is missing ad_name` },
          { status: 400 },
        );
      }

      const missingDateIndex = weeks_data.findIndex(
        (item) =>
          !item ||
          typeof item !== "object" ||
          (!Boolean(item.schedule_tbd) && !normalizeDateKeyStrict(item.post_date_from)),
      );
      if (missingDateIndex >= 0) {
        return Response.json(
          { error: `Week ${missingDateIndex + 1} is missing post_date_from or must be marked TBD` },
          { status: 400 },
        );
      }

      const missingTimeIndex = weeks_data.findIndex(
        (item) =>
          !item ||
          typeof item !== "object" ||
          (!Boolean(item.schedule_tbd) && !normalizeTime(item.post_time)),
      );
      if (missingTimeIndex >= 0) {
        return Response.json(
          { error: `Week ${missingTimeIndex + 1} is missing post_time or must be marked TBD` },
          { status: 400 },
        );
      }
    }

    const advertiserQuery = advertiser_id
      ? supabase.from(table("advertisers")).select("id, advertiser_name, status").eq("id", advertiser_id).maybeSingle()
      : supabase.from(table("advertisers")).select("id, advertiser_name, status").eq("advertiser_name", advertiser).maybeSingle();

    const productIds = (() => {
      if (hasWeeksData) {
        return Array.from(
          new Set(
            weeks_data
              .map((item) => (item && typeof item === "object" ? String(item.product_id || "").trim() : ""))
              .filter(Boolean),
          ),
        );
      }

      const overrideProductIds = Array.isArray(overrides)
        ? overrides
            .map((item) => (item && typeof item === "object" ? String(item.product_id || "").trim() : ""))
            .filter(Boolean)
        : [];

      return Array.from(new Set([String(product_id).trim(), ...overrideProductIds])).filter(Boolean);
    })();

    const [{ data: advertiserRow, error: advertiserError }, { data: productsRows, error: productsError }] =
      await Promise.all([
        advertiserQuery,
        supabase.from(table("products")).select("id, product_name, price, placement").in("id", productIds),
      ]);

    if (advertiserError) throw advertiserError;
    if (productsError) throw productsError;
    if (!advertiserRow) return Response.json({ error: "Advertiser not found" }, { status: 404 });

    const productsById = new Map(
      (Array.isArray(productsRows) ? productsRows : []).map((row) => [String(row.id), row]),
    );

    const missingProductIds = productIds.filter((id) => !productsById.has(String(id)));
    if (missingProductIds.length > 0) {
      return Response.json(
        { error: `Product not found: ${missingProductIds[0]}` },
        { status: 400 },
      );
    }

    const baseProductRow = !hasWeeksData ? productsById.get(String(product_id)) : null;
    if (!hasWeeksData && !baseProductRow) return Response.json({ error: "Product not found" }, { status: 404 });

    if (String(advertiserRow.status || "").toLowerCase() === "inactive") {
      return Response.json(
        { error: `Cannot create ads for inactive advertiser "${advertiserRow.advertiser_name}".` },
        { status: 400 },
      );
    }

    const seriesId = createSeriesId();
    const weekInfos = buildSeriesWeekStarts({ seriesWeekStart: normalizedWeekStart, weeks: normalizedWeeks });
    const nowIso = new Date().toISOString();

    if (hasWeeksData) {
      for (let idx = 0; idx < weekInfos.length; idx += 1) {
        const item = weeks_data[idx] && typeof weeks_data[idx] === "object" ? weeks_data[idx] : {};
        if (Boolean(item.schedule_tbd)) {
          continue;
        }
        const postDate = normalizeDateKeyStrict(item.post_date_from);
        const postTime = normalizeTime(item.post_time);

        const availability = await checkSingleDateAvailability({
          supabase,
          date: postDate,
          postType: "one_time",
          postTime,
        });

        if (!availability.available) {
          return Response.json(
            {
              error: availability.is_day_full
                ? `Week ${idx + 1}: ad limit reached for this date`
                : `Week ${idx + 1}: this time slot is already booked`,
              week_index: idx + 1,
            },
            { status: 400 },
          );
        }
      }
    }

    const payloads = weekInfos.map((weekInfo, idx) => {
      if (hasWeeksData) {
        const item = weeks_data[idx] && typeof weeks_data[idx] === "object" ? weeks_data[idx] : {};
        const productId = String(item.product_id || "").trim();
        const productRow = productId ? productsById.get(productId) : null;
        if (!productRow) {
          throw new Error(`Product not found for week ${weekInfo.series_index}`);
        }

        const weekName = String(item.ad_name || "").trim();
        if (!weekName) {
          throw new Error(`Missing ad_name for week ${weekInfo.series_index}`);
        }

        const resolvedPlacement = String(item.placement || productRow.placement || "").trim();
        const resolvedPayment = String(item.payment || "").trim() || "Unpaid";
        const resolvedStatus = String(item.status || "").trim() || "Draft";
        const savedPrice = Number(productRow.price || 0) || 0;
        const weekMedia = Array.isArray(item.media) ? item.media : [];
        const weekText = String(item.ad_text || "").trim() || null;
        const weekNotes = String(item.notes || "").trim();
        const scheduleTbd = Boolean(item.schedule_tbd);
        const postDate = normalizeDateKeyStrict(item.post_date_from);
        const postTime = normalizeTime(item.post_time);
        const reminderMinutes = parseReminderMinutes(item.reminder_minutes, 15);

        const weekNote = `[Multi-week booking] Week ${weekInfo.series_index} of ${weekInfo.series_total} (week of ${weekInfo.series_week_start})`;
        const finalNotes = weekNotes ? `${weekNotes}\n\n${weekNote}` : weekNote;

        return {
          ad_name: weekName,
          advertiser: advertiserRow.advertiser_name,
          advertiser_id: advertiserRow.id,
          status: resolvedStatus,
          post_type: "one_time",
          placement: resolvedPlacement,
          schedule: scheduleTbd ? null : postDate,
          post_date: scheduleTbd ? null : postDate,
          post_date_from: scheduleTbd ? null : postDate,
          post_date_to: null,
          custom_dates: [],
          payment: resolvedPayment,
          product_id: productRow.id,
          product_name: productRow.product_name || null,
          price: savedPrice,
          media: weekMedia,
          ad_text: weekText,
          post_time: scheduleTbd ? null : postTime,
          scheduled_timezone: APP_TIME_ZONE,
          reminder_minutes: reminderMinutes,
          notes: finalNotes || null,
          created_at: nowIso,
          updated_at: nowIso,
          series_id: seriesId,
          series_index: weekInfo.series_index,
          series_total: weekInfo.series_total,
          series_week_start: weekInfo.series_week_start,
        };
      }

      const baseCreative = {
        ad_name: String(ad_name || "").trim(),
        ad_text: String(ad_text || "").trim(),
        media: Array.isArray(media) ? media : [],
      };

      const basePlacement = String(baseProductRow.placement || placement || "").trim();

      const override = overrides[idx] && typeof overrides[idx] === "object" ? overrides[idx] : {};
      const creative = resolveWeeklyCreative({
        base: baseCreative,
        override,
        index: weekInfo.series_index,
      });

      const overrideProductId = String(override.product_id || "").trim();
      const productRow = overrideProductId ? productsById.get(overrideProductId) : baseProductRow;
      if (!productRow) {
        throw new Error(`Product not found for week ${weekInfo.series_index}`);
      }

      const overridePlacement = String(override.placement || "").trim();
      const resolvedPlacement = String(overridePlacement || productRow.placement || basePlacement || "").trim();

      const resolvedPayment = String(override.payment || "").trim() || payment;
      const resolvedStatus = String(override.status || "").trim() || status || "Draft";
      const savedPrice = Number(productRow.price || 0) || 0;

      const weekNote = `[Multi-week booking] Week ${weekInfo.series_index} of ${weekInfo.series_total} (week of ${weekInfo.series_week_start})`;
      const combinedNotes = String(notes || "").trim();
      const finalNotes = combinedNotes ? `${combinedNotes}\n\n${weekNote}` : weekNote;

      return {
        ad_name: creative.ad_name,
        advertiser: advertiserRow.advertiser_name,
        advertiser_id: advertiserRow.id,
        status: resolvedStatus,
        post_type: "one_time",
        placement: resolvedPlacement,
        schedule: null,
        post_date: null,
        post_date_from: null,
        post_date_to: null,
        custom_dates: [],
        payment: resolvedPayment,
        product_id: productRow.id,
        product_name: productRow.product_name || null,
        price: savedPrice,
        media: creative.media,
        ad_text: creative.ad_text,
        post_time: null,
        scheduled_timezone: APP_TIME_ZONE,
        reminder_minutes: 15,
        notes: finalNotes || null,
        created_at: nowIso,
        updated_at: nowIso,
        series_id: seriesId,
        series_index: weekInfo.series_index,
        series_total: weekInfo.series_total,
        series_week_start: weekInfo.series_week_start,
      };
    });

    const ads = await insertAds(supabase, payloads);

    return Response.json({
      series_id: seriesId,
      ads,
    });
  } catch (error) {
    console.error("Error creating ad series:", error);
    return Response.json({ error: "Failed to create ad series" }, { status: 500 });
  }
}
