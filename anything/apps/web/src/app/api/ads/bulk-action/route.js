import sql from "@/app/api/utils/sql";
import { updateAdvertiserNextAdDate } from "@/app/api/utils/update-advertiser-next-ad";

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, adIds, newStatus } = body;

    if (!action || !adIds || !Array.isArray(adIds) || adIds.length === 0) {
      return Response.json(
        { error: "Invalid request. Action and adIds are required." },
        { status: 400 },
      );
    }

    // Get all affected advertisers before making changes
    const placeholders = adIds.map((_, i) => `$${i + 1}`).join(",");
    const affectedAds = await sql(
      `SELECT DISTINCT advertiser FROM ads WHERE id IN (${placeholders})`,
      adIds,
    );
    const affectedAdvertisers = affectedAds.map((ad) => ad.advertiser);

    if (action === "delete") {
      // Delete multiple ads
      await sql(`DELETE FROM ads WHERE id IN (${placeholders})`, adIds);

      // Update next_ad_date for all affected advertisers
      for (const advertiser of affectedAdvertisers) {
        await updateAdvertiserNextAdDate(advertiser);
      }

      return Response.json({
        success: true,
        message: `${adIds.length} ad(s) deleted successfully`,
      });
    } else if (action === "mark-published") {
      // Mark multiple ads as published
      await sql(
        `UPDATE ads SET status = 'Published' WHERE id IN (${placeholders})`,
        adIds,
      );

      // Update next_ad_date for all affected advertisers
      for (const advertiser of affectedAdvertisers) {
        await updateAdvertiserNextAdDate(advertiser);
      }

      return Response.json({
        success: true,
        message: `${adIds.length} ad(s) marked as published`,
      });
    } else if (action === "mark-paid") {
      // Mark multiple ads as paid
      await sql(
        `UPDATE ads SET payment = 'Paid' WHERE id IN (${placeholders})`,
        adIds,
      );

      return Response.json({
        success: true,
        message: `${adIds.length} ad(s) marked as paid`,
      });
    } else if (action === "update-status") {
      if (!newStatus) {
        return Response.json(
          { error: "New status is required" },
          { status: 400 },
        );
      }

      await sql(`UPDATE ads SET status = $1 WHERE id IN (${placeholders})`, [
        newStatus,
        ...adIds,
      ]);

      // Update next_ad_date for all affected advertisers if status changed to Published
      if (newStatus === "Published") {
        for (const advertiser of affectedAdvertisers) {
          await updateAdvertiserNextAdDate(advertiser);
        }
      }

      return Response.json({
        success: true,
        message: `${adIds.length} ad(s) updated to ${newStatus}`,
      });
    } else {
      return Response.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error performing bulk action:", error);
    return Response.json(
      { error: "Failed to perform bulk action" },
      { status: 500 },
    );
  }
}
