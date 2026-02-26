import { db, table } from "@/app/api/utils/supabase-db";
import { updateAdvertiserNextAdDate } from "@/app/api/utils/update-advertiser-next-ad";

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, adIds, newStatus } = body;

    if (!action || !Array.isArray(adIds) || adIds.length === 0) {
      return Response.json(
        { error: "Invalid request. Action and adIds are required." },
        { status: 400 },
      );
    }

    const supabase = db();
    const uniqueAdIds = [...new Set(adIds.map(String))];

    const { data: affectedAds, error: affectedAdsError } = await supabase
      .from(table("ads"))
      .select("id, advertiser")
      .in("id", uniqueAdIds);
    if (affectedAdsError) throw affectedAdsError;

    const affectedAdvertisers = [
      ...new Set((affectedAds || []).map((ad) => ad.advertiser).filter(Boolean)),
    ];

    if (action === "delete") {
      await supabase.from(table("sent_reminders")).delete().in("ad_id", uniqueAdIds);
      const { error } = await supabase.from(table("ads")).delete().in("id", uniqueAdIds);
      if (error) throw error;

      for (const advertiser of affectedAdvertisers) {
        await updateAdvertiserNextAdDate(advertiser);
      }

      return Response.json({
        success: true,
        message: `${uniqueAdIds.length} ad(s) deleted successfully`,
      });
    }

    if (action === "mark-published") {
      const { error } = await supabase
        .from(table("ads"))
        .update({
          status: "Published",
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in("id", uniqueAdIds);
      if (error) throw error;

      for (const advertiser of affectedAdvertisers) {
        await updateAdvertiserNextAdDate(advertiser);
      }

      return Response.json({
        success: true,
        message: `${uniqueAdIds.length} ad(s) marked as published`,
      });
    }

    if (action === "mark-paid") {
      const { error } = await supabase
        .from(table("ads"))
        .update({
          payment: "Paid",
          updated_at: new Date().toISOString(),
        })
        .in("id", uniqueAdIds);
      if (error) throw error;

      return Response.json({
        success: true,
        message: `${uniqueAdIds.length} ad(s) marked as paid`,
      });
    }

    if (action === "update-status") {
      if (!newStatus) {
        return Response.json(
          { error: "New status is required" },
          { status: 400 },
        );
      }

      const updates = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === "Published") {
        updates.published_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from(table("ads"))
        .update(updates)
        .in("id", uniqueAdIds);
      if (error) throw error;

      if (newStatus === "Published") {
        for (const advertiser of affectedAdvertisers) {
          await updateAdvertiserNextAdDate(advertiser);
        }
      }

      return Response.json({
        success: true,
        message: `${uniqueAdIds.length} ad(s) updated to ${newStatus}`,
      });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error performing bulk action:", error);
    return Response.json(
      { error: "Failed to perform bulk action" },
      { status: 500 },
    );
  }
}

