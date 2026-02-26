import sql from "@/app/api/utils/sql";

// Helper function to normalize time to HH:MM:SS format
function normalizeTime(time) {
  if (!time) return null;

  // If it's already a string in HH:MM:SS or HH:MM format
  if (typeof time === "string") {
    // If it's HH:MM, add :00
    if (time.length === 5 && time.includes(":")) {
      return `${time}:00`;
    }
    // If it's already HH:MM:SS, return as is
    if (time.length === 8) {
      return time;
    }
    return time;
  }

  // If it's a Date object, extract time
  if (time instanceof Date) {
    return time.toTimeString().split(" ")[0]; // Returns HH:MM:SS
  }

  return String(time);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { date, post_type, post_time, exclude_ad_id } = body;

    if (!date || !post_type) {
      return Response.json(
        { error: "Missing required fields: date and post_type" },
        { status: 400 },
      );
    }

    // Get max ads per day setting
    const settings = await sql`
      SELECT max_ads_per_day FROM admin_settings ORDER BY id LIMIT 1
    `;
    const maxAdsPerDay = settings[0]?.max_ads_per_day || 5;

    // For one-time posts, check specific date+time slots
    if (post_type === "One-Time Post") {
      // Get all ads scheduled for this date (ONLY from ads table, not pending_ads)
      let query;
      let values;

      if (exclude_ad_id) {
        query = `
          SELECT post_time, COUNT(*) as count
          FROM ads 
          WHERE post_date_from = $1 
          AND post_type = 'One-Time Post'
          AND id != $2
          AND post_time IS NOT NULL
          GROUP BY post_time
        `;
        values = [date, exclude_ad_id];
      } else {
        query = `
          SELECT post_time, COUNT(*) as count
          FROM ads 
          WHERE post_date_from = $1 
          AND post_type = 'One-Time Post'
          AND post_time IS NOT NULL
          GROUP BY post_time
        `;
        values = [date];
      }

      const bookedTimes = await sql(query, values);

      // Normalize the requested time
      const normalizedRequestedTime = normalizeTime(post_time);

      console.log("[AVAILABILITY DEBUG] ===================");
      console.log("[AVAILABILITY DEBUG] Requested date:", date);
      console.log(
        "[AVAILABILITY DEBUG] Requested post_time (original):",
        post_time,
      );
      console.log(
        "[AVAILABILITY DEBUG] Requested post_time (normalized):",
        normalizedRequestedTime,
      );
      console.log(
        "[AVAILABILITY DEBUG] Database bookedTimes result:",
        bookedTimes,
      );

      // Get total count for the day (all post types, ONLY from ads table)
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

      console.log("[AVAILABILITY DEBUG] Total ads on date:", totalAdsOnDate);

      // Build blocked times set with normalized times
      const blockedTimes = new Set();
      bookedTimes.forEach((row) => {
        if (row.post_time) {
          const normalizedDbTime = normalizeTime(row.post_time);
          console.log(
            "[AVAILABILITY DEBUG] DB time (original):",
            row.post_time,
            "Type:",
            typeof row.post_time,
          );
          console.log(
            "[AVAILABILITY DEBUG] DB time (normalized):",
            normalizedDbTime,
          );
          blockedTimes.add(normalizedDbTime);
        }
      });

      console.log(
        "[AVAILABILITY DEBUG] All blocked times (normalized):",
        Array.from(blockedTimes),
      );
      console.log(
        "[AVAILABILITY DEBUG] Checking if",
        normalizedRequestedTime,
        "is in blockedTimes:",
        blockedTimes.has(normalizedRequestedTime),
      );

      // Check if the specific time provided is blocked (using normalized time)
      const isTimeBlocked =
        normalizedRequestedTime && blockedTimes.has(normalizedRequestedTime);

      console.log("[AVAILABILITY DEBUG] Final isTimeBlocked:", isTimeBlocked);
      console.log("[AVAILABILITY DEBUG] ===================");

      const response = {
        available: totalAdsOnDate < maxAdsPerDay && !isTimeBlocked,
        blocked_times: Array.from(blockedTimes),
        total_ads_on_date: totalAdsOnDate,
        max_ads_per_day: maxAdsPerDay,
        is_day_full: totalAdsOnDate >= maxAdsPerDay,
        is_time_blocked: isTimeBlocked,
      };

      return Response.json(response);
    }

    // For Daily Run or Custom Schedule, check if the day is full
    else {
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

      return Response.json({
        available: totalAdsOnDate < maxAdsPerDay,
        total_ads_on_date: totalAdsOnDate,
        max_ads_per_day: maxAdsPerDay,
        is_day_full: totalAdsOnDate >= maxAdsPerDay,
      });
    }
  } catch (error) {
    return Response.json(
      { error: "Failed to check availability" },
      { status: 500 },
    );
  }
}
