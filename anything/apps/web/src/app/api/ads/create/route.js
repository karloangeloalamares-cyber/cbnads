import { dateOnly, db, normalizePostType, table } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";
import { updateAdvertiserNextAdDate } from "../../utils/update-advertiser-next-ad.js";
import { APP_TIME_ZONE } from "../../../../lib/timezone.js";
import {
  checkBatchAvailability,
  checkSingleDateAvailability,
  expandDateRange,
} from "../../utils/ad-availability.js";

const typeEquals = (value, target) => normalizePostType(value) === normalizePostType(target);

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
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
    } = body;

    if (!ad_name || !advertiser || !post_type || !placement || !payment) {
      return Response.json(
        { error: "Required fields missing" },
        { status: 400 },
      );
    }

    const { data: advertiserRow, error: advertiserError } = await supabase
      .from(table("advertisers"))
      .select("id, advertiser_name, status")
      .eq("advertiser_name", advertiser)
      .maybeSingle();
    if (advertiserError) throw advertiserError;

    if (advertiserRow && String(advertiserRow.status || "").toLowerCase() === "inactive") {
      return Response.json(
        {
          error: `Cannot create ad for inactive advertiser "${advertiser}". Please activate the advertiser first.`,
        },
        { status: 400 },
      );
    }

    // Duplicate check for same advertiser + placement + schedule intent.
    if (!skip_duplicate_check) {
      const { data: candidateAds, error: candidateError } = await supabase
        .from(table("ads"))
        .select("id, ad_name, status, post_type, schedule, post_date_from")
        .eq("advertiser", advertiser)
        .eq("placement", placement);
      if (candidateError) throw candidateError;

      const wantedType = normalizePostType(post_type);
      const wantedSchedule = dateOnly(schedule || post_date_from);
      const wantedFrom = dateOnly(post_date_from);

      const duplicate = (candidateAds || []).find((ad) => {
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
          {
            warning: true,
            message: `Similar ad "${duplicate.ad_name}" already exists for ${advertiser} on this date and placement (Status: ${duplicate.status}). Create anyway?`,
            duplicateId: duplicate.id,
            duplicateName: duplicate.ad_name,
          },
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
    const customDates = custom && Array.isArray(custom_dates) ? custom_dates : [];

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
        dates: customDates.map((entry) =>
          entry && typeof entry === "object" ? entry.date : entry,
        ),
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

    const { data: createdAd, error: createError } = await supabase
      .from(table("ads"))
      .insert({
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
        media: Array.isArray(media) ? media : [],
        ad_text: ad_text || null,
        post_time: post_time || null,
        scheduled_timezone: APP_TIME_ZONE,
        reminder_minutes: reminder_minutes || 15,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (createError) throw createError;

    await updateAdvertiserNextAdDate(advertiser);

    return Response.json({ ad: createdAd });
  } catch (error) {
    console.error("Error creating ad:", error);
    return Response.json({ error: "Failed to create ad" }, { status: 500 });
  }
}
