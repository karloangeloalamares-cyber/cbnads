import sql from "../../utils/sql";

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

    // Fetch all ads
    const ads = await sql`SELECT * FROM ads ORDER BY created_at DESC`;

    // Calculate which dates each ad appears on
    const calendarData = {};

    ads.forEach((ad) => {
      const dates = [];

      if (ad.post_type === "One-Time Post" && ad.schedule) {
        // One-time post - just the single date
        dates.push(ad.schedule);
      } else if (
        ad.post_type === "Daily Run" &&
        ad.post_date_from &&
        ad.post_date_to
      ) {
        // Daily run - all dates between from and to
        const startDate = new Date(ad.post_date_from);
        const endDate = new Date(ad.post_date_to);

        for (
          let d = new Date(startDate);
          d <= endDate;
          d.setDate(d.getDate() + 1)
        ) {
          dates.push(new Date(d).toISOString().split("T")[0]);
        }
      } else if (ad.post_type === "Custom Schedule" && ad.custom_dates) {
        // Custom schedule - specific dates
        const customDates = Array.isArray(ad.custom_dates)
          ? ad.custom_dates
          : [];
        dates.push(...customDates);
      }

      // Add this ad to each date it appears on
      dates.forEach((dateStr) => {
        if (!calendarData[dateStr]) {
          calendarData[dateStr] = [];
        }
        calendarData[dateStr].push({
          id: ad.id,
          ad_name: ad.ad_name,
          advertiser: ad.advertiser,
          status: ad.status,
          post_type: ad.post_type,
          placement: ad.placement,
          payment: ad.payment,
        });
      });
    });

    return Response.json({ calendarData });
  } catch (error) {
    console.error("Error fetching calendar data:", error);
    return Response.json(
      { error: "Failed to fetch calendar data" },
      { status: 500 },
    );
  }
}
