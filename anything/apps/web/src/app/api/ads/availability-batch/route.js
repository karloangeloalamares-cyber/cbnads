import { adDatesForDayCheck, dateOnly, db, table, toNumber } from "@/app/api/utils/supabase-db";

const includesDate = (ad, date) => adDatesForDayCheck(ad).includes(date);

export async function POST(request) {
  try {
    const supabase = db();
    const body = await request.json();
    const { dates, exclude_ad_id } = body;

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return Response.json(
        { error: "Missing required field: dates (array)" },
        { status: 400 },
      );
    }

    const normalizedDates = dates.map(dateOnly).filter(Boolean);

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
      .select("id, post_type, post_date_from, post_date_to, custom_dates");
    if (adsError) throw adsError;

    const visibleAds = (ads || []).filter((ad) => ad.id !== exclude_ad_id);
    const results = {};

    for (const day of normalizedDates) {
      const totalAdsOnDate = visibleAds.filter((ad) => includesDate(ad, day)).length;
      results[day] = {
        total_ads_on_date: totalAdsOnDate,
        max_ads_per_day: maxAdsPerDay,
        is_full: totalAdsOnDate >= maxAdsPerDay,
      };
    }

    return Response.json({ results, max_ads_per_day: maxAdsPerDay });
  } catch (error) {
    console.error("Error checking batch availability:", error);
    return Response.json(
      { error: "Failed to check availability" },
      { status: 500 },
    );
  }
}
