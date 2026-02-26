import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { updateAdvertiserNextAdDate } from "@/app/api/utils/update-advertiser-next-ad";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user role from database
    const userRows = await sql`
      SELECT role FROM auth_users WHERE id = ${session.user.id}
    `;

    if (userRows.length === 0 || userRows[0].role !== "admin") {
      return Response.json(
        { error: "Unauthorized - Admin access required" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return Response.json({ error: "Ad ID is required" }, { status: 400 });
    }

    // First, check if the ad exists
    const existingAd = await sql`SELECT * FROM ads WHERE id = ${id}`;
    if (existingAd.length === 0) {
      console.error(`Ad not found with id: ${id}`);
      return Response.json({ error: "Ad not found" }, { status: 404 });
    }

    console.log("Marking ad as published:", {
      id,
      advertiser: existingAd[0].advertiser,
    });

    // Update the ad
    const result = await sql`
      UPDATE ads
      SET status = 'Published', published_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      console.error("Update returned no rows for ad id:", id);
      return Response.json({ error: "Failed to update ad" }, { status: 500 });
    }

    console.log("Ad updated successfully:", result[0].id);

    // Update the advertiser's next_ad_date after marking as published
    const advertiser = result[0].advertiser;
    if (advertiser) {
      try {
        await updateAdvertiserNextAdDate(advertiser);
        console.log("Advertiser next ad date updated:", advertiser);
      } catch (updateError) {
        console.error("Error updating advertiser next ad date:", updateError);
        // Don't fail the whole request if this part fails
      }
    }

    return Response.json({
      success: true,
      ad: result[0],
    });
  } catch (error) {
    console.error("Error marking ad as published:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return Response.json(
      { error: `Failed to mark ad as published: ${error.message}` },
      { status: 500 },
    );
  }
}
