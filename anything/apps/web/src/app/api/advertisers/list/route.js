import sql from "../../utils/sql";

export async function GET(request) {
  try {
    const advertisers = await sql`
      SELECT 
        id,
        advertiser_name,
        contact_name,
        email,
        phone_number,
        total_spend,
        next_ad_date,
        status,
        created_at
      FROM advertisers
      ORDER BY created_at DESC
    `;

    return Response.json({ advertisers });
  } catch (error) {
    console.error("Error fetching advertisers:", error);
    return Response.json(
      { error: "Failed to fetch advertisers" },
      { status: 500 },
    );
  }
}
