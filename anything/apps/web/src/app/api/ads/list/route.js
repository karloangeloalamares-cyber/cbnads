import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const placement = searchParams.get("placement");
    const postType = searchParams.get("postType");
    const search = searchParams.get("search");
    const advertiser = searchParams.get("advertiser");
    const payment = searchParams.get("payment");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const showArchived = searchParams.get("showArchived") === "true";

    // Cast post_time to TEXT to prevent timezone conversion
    let query = "SELECT *, post_time::TEXT as post_time FROM ads WHERE 1=1";
    const params = [];
    let paramCount = 0;

    // By default, exclude archived ads unless showArchived is true
    if (!showArchived) {
      query += ` AND (archived = FALSE OR archived IS NULL)`;
    }

    // Handle status filters
    if (status === "Upcoming Ads") {
      query += ` AND status = 'Scheduled' AND schedule >= CURRENT_DATE`;
    } else if (status === "Past Ads") {
      query += ` AND schedule < CURRENT_DATE`;
    } else if (status === "Needs Payment") {
      query += ` AND payment != 'Paid'`;
    } else if (status === "Ready to Publish") {
      query += ` AND status = 'Draft' AND payment = 'Paid'`;
    } else if (status === "Today") {
      query += ` AND schedule = CURRENT_DATE`;
    } else if (status === "This Week") {
      query += ` AND schedule >= CURRENT_DATE AND schedule <= CURRENT_DATE + INTERVAL '7 days'`;
    } else if (status && status !== "All Ads") {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    if (placement && placement !== "All Placement") {
      paramCount++;
      query += ` AND placement = $${paramCount}`;
      params.push(placement);
    }

    if (postType && postType !== "All post types") {
      paramCount++;
      query += ` AND post_type = $${paramCount}`;
      params.push(postType);
    }

    if (advertiser && advertiser !== "All Advertisers") {
      paramCount++;
      query += ` AND advertiser = $${paramCount}`;
      params.push(advertiser);
    }

    if (payment && payment !== "All Payment Status") {
      paramCount++;
      query += ` AND payment = $${paramCount}`;
      params.push(payment);
    }

    if (dateFrom) {
      paramCount++;
      query += ` AND schedule >= $${paramCount}`;
      params.push(dateFrom);
    }

    if (dateTo) {
      paramCount++;
      query += ` AND schedule <= $${paramCount}`;
      params.push(dateTo);
    }

    if (search) {
      paramCount++;
      query += ` AND (LOWER(ad_name) LIKE LOWER($${paramCount}) OR LOWER(advertiser) LIKE LOWER($${paramCount}))`;
      params.push(`%${search}%`);
    }

    query += " ORDER BY schedule DESC, created_at DESC";

    const ads = await sql(query, params);
    return Response.json({ ads });
  } catch (error) {
    console.error("Error fetching ads:", error);
    return Response.json({ error: "Failed to fetch ads" }, { status: 500 });
  }
}
