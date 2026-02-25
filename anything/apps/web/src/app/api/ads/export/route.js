import sql from "../../utils/sql";

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

    // Build the same query as list endpoint
    let query = "SELECT *, post_time::TEXT as post_time FROM ads WHERE 1=1";
    const params = [];
    let paramCount = 0;

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

    // Generate CSV
    const headers = [
      "Ad Name",
      "Advertiser",
      "Status",
      "Post Type",
      "Placement",
      "Schedule",
      "Post Time",
      "Payment",
    ];

    const rows = ads.map((ad) => [
      ad.ad_name,
      ad.advertiser,
      ad.status,
      ad.post_type,
      ad.placement,
      ad.schedule ? new Date(ad.schedule).toLocaleDateString("en-US") : "N/A",
      ad.post_time || "N/A",
      ad.payment,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="ads-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting ads:", error);
    return Response.json({ error: "Failed to export ads" }, { status: 500 });
  }
}
