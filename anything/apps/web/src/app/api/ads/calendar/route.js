import { adDatesForDayCheck, db, normalizePostType, table } from "@/app/api/utils/supabase-db";

const toLegacyPostType = (value) => {
  const normalized = normalizePostType(value);
  if (normalized === "one_time") return "One-Time Post";
  if (normalized === "daily_run") return "Daily Run";
  if (normalized === "custom_schedule") return "Custom Schedule";
  return value || "One-Time Post";
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    if (!year || !month) {
      return Response.json(
        { error: "Year and month are required" },
        { status: 400 },
      );
    }

    const supabase = db();
    const { data: ads, error } = await supabase
      .from(table("ads"))
      .select("id, ad_name, advertiser, status, post_type, placement, payment, schedule, post_date, post_date_from, post_date_to, custom_dates")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const calendarData = {};

    for (const ad of ads || []) {
      const dates = adDatesForDayCheck(ad);
      for (const dateStr of dates) {
        if (!calendarData[dateStr]) {
          calendarData[dateStr] = [];
        }
        calendarData[dateStr].push({
          id: ad.id,
          ad_name: ad.ad_name,
          advertiser: ad.advertiser,
          status: ad.status,
          post_type: toLegacyPostType(ad.post_type),
          placement: ad.placement,
          payment: ad.payment,
        });
      }
    }

    return Response.json({ calendarData });
  } catch (error) {
    console.error("Error fetching calendar data:", error);
    return Response.json(
      { error: "Failed to fetch calendar data" },
      { status: 500 },
    );
  }
}

