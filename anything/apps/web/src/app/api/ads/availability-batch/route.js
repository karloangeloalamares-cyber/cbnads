import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const body = await request.json();
    const { dates, post_type, exclude_ad_id } = body;

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return Response.json(
        { error: "Missing required field: dates (array)" },
        { status: 400 },
      );
    }

    // Get max ads per day setting
    const settings = await sql`
      SELECT max_ads_per_day FROM admin_settings ORDER BY id LIMIT 1
    `;
    const maxAdsPerDay = settings[0]?.max_ads_per_day || 5;

    // Build a query that counts ads for each requested date
    const results = {};

    for (const date of dates) {
      let totalQuery;
      let totalValues;

      if (exclude_ad_id) {
        totalQuery = `
          SELECT COUNT(*) as total
          FROM ads 
          WHERE (
            (post_date_from = $1 AND post_type = 'One-Time Post')
            OR (post_date_from <= $1 AND post_date_to >= $1 AND post_type = 'Daily Run')
            OR (custom_dates IS NOT NULL AND custom_dates::jsonb @> $2::jsonb AND post_type = 'Custom Schedule')
          )
          AND id != $3
        `;
        totalValues = [date, JSON.stringify([date]), exclude_ad_id];
      } else {
        totalQuery = `
          SELECT COUNT(*) as total
          FROM ads 
          WHERE (
            (post_date_from = $1 AND post_type = 'One-Time Post')
            OR (post_date_from <= $1 AND post_date_to >= $1 AND post_type = 'Daily Run')
            OR (custom_dates IS NOT NULL AND custom_dates::jsonb @> $2::jsonb AND post_type = 'Custom Schedule')
          )
        `;
        totalValues = [date, JSON.stringify([date])];
      }

      const totalResult = await sql(totalQuery, totalValues);
      const totalAdsOnDate = parseInt(totalResult[0].total);

      results[date] = {
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
