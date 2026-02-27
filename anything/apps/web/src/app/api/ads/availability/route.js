import { adDatesForDayCheck, dateOnly, db, normalizePostType, table, toNumber } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";

const normalizeTime = (value) => {
  if (!value) return "";
  const asText = String(value).trim();
  if (/^\d{2}:\d{2}$/.test(asText)) return `${asText}:00`;
  return asText;
};

const includesDate = (ad, date) => adDatesForDayCheck(ad).includes(date);

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const body = await request.json();
    const { date, post_type, post_time, exclude_ad_id } = body;

    if (!date || !post_type) {
      return Response.json(
        { error: "Missing required fields: date and post_type" },
        { status: 400 },
      );
    }

    const targetDate = dateOnly(date);
    if (!targetDate) {
      return Response.json(
        { error: "Invalid date provided" },
        { status: 400 },
      );
    }

    const { data: settingsRows, error: settingsError } = await supabase
      .from(table("admin_settings"))
      .select("*")
      .order("id", { ascending: true })
      .limit(1);
    if (settingsError) throw settingsError;

    const maxAdsPerDay =
      toNumber(settingsRows?.[0]?.max_ads_per_day, 0) ||
      toNumber(settingsRows?.[0]?.max_ads_per_slot, 0) ||
      5;

    const { data: ads, error: adsError } = await supabase
      .from(table("ads"))
      .select("id, post_type, post_date_from, post_date_to, custom_dates, post_time");
    if (adsError) throw adsError;

    const visibleAds = (ads || []).filter((ad) => ad.id !== exclude_ad_id);
    const totalAdsOnDate = visibleAds.filter((ad) => includesDate(ad, targetDate)).length;

    const requestedType = normalizePostType(post_type);
    if (requestedType === "one_time") {
      const requestedTime = normalizeTime(post_time);
      const blockedTimes = new Set(
        visibleAds
          .filter((ad) => normalizePostType(ad.post_type) === "one_time")
          .filter((ad) => dateOnly(ad.post_date_from) === targetDate)
          .map((ad) => normalizeTime(ad.post_time))
          .filter(Boolean),
      );

      const isTimeBlocked = requestedTime ? blockedTimes.has(requestedTime) : false;

      return Response.json({
        available: totalAdsOnDate < maxAdsPerDay && !isTimeBlocked,
        blocked_times: Array.from(blockedTimes),
        total_ads_on_date: totalAdsOnDate,
        max_ads_per_day: maxAdsPerDay,
        is_day_full: totalAdsOnDate >= maxAdsPerDay,
        is_time_blocked: isTimeBlocked,
      });
    }

    return Response.json({
      available: totalAdsOnDate < maxAdsPerDay,
      total_ads_on_date: totalAdsOnDate,
      max_ads_per_day: maxAdsPerDay,
      is_day_full: totalAdsOnDate >= maxAdsPerDay,
    });
  } catch (error) {
    console.error("Error checking availability:", error);
    return Response.json(
      { error: "Failed to check availability" },
      { status: 500 },
    );
  }
}
