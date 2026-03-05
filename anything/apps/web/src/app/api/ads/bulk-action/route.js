import { db, table } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";
import { updateAdvertiserNextAdDate } from "../../utils/update-advertiser-next-ad.js";

const isMissingRelationError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42P01" || code === "PGRST205" || /does not exist/i.test(message);
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const body = await request.json();
    const { action, adIds, newStatus } = body;

    if (!action || !Array.isArray(adIds) || adIds.length === 0) {
      return Response.json(
        { error: "Invalid request. Action and adIds are required." },
        { status: 400 },
      );
    }

    const supabase = db();
    const uniqueAdIds = [...new Set(adIds.map((value) => String(value || "").trim()))].filter(
      Boolean,
    );
    const validAdIds = uniqueAdIds.filter((id) => UUID_RE.test(id));
    if (validAdIds.length === 0) {
      return Response.json({ error: "No valid ad IDs were provided." }, { status: 400 });
    }

    const { data: affectedAds, error: affectedAdsError } = await supabase
      .from(table("ads"))
      .select("id, advertiser")
      .in("id", validAdIds);
    if (affectedAdsError) throw affectedAdsError;

    const affectedAdvertisers = [
      ...new Set((affectedAds || []).map((ad) => ad.advertiser).filter(Boolean)),
    ];

    if (action === "delete") {
      const { error: reminderDeleteError } = await supabase
        .from(table("sent_reminders"))
        .delete()
        .in("ad_id", validAdIds);
      if (reminderDeleteError && !isMissingRelationError(reminderDeleteError)) {
        throw reminderDeleteError;
      }

      const { error: detachInvoiceItemsError } = await supabase
        .from(table("invoice_items"))
        .update({ ad_id: null })
        .in("ad_id", validAdIds);
      if (detachInvoiceItemsError && !isMissingRelationError(detachInvoiceItemsError)) {
        throw detachInvoiceItemsError;
      }

      const { error } = await supabase.from(table("ads")).delete().in("id", validAdIds);
      if (error) throw error;

      for (const advertiser of affectedAdvertisers) {
        try {
          await updateAdvertiserNextAdDate(advertiser);
        } catch (updateError) {
          console.warn("[bulk-action] Failed to refresh advertiser next_ad_date", {
            advertiser,
            message: updateError?.message || String(updateError),
          });
        }
      }

      return Response.json({
        success: true,
        message: `${validAdIds.length} ad(s) deleted successfully`,
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
        .in("id", validAdIds);
      if (error) throw error;

      for (const advertiser of affectedAdvertisers) {
        await updateAdvertiserNextAdDate(advertiser);
      }

      return Response.json({
        success: true,
        message: `${validAdIds.length} ad(s) marked as published`,
      });
    }

    if (action === "mark-paid") {
      const { error } = await supabase
        .from(table("ads"))
        .update({
          payment: "Paid",
          updated_at: new Date().toISOString(),
        })
        .in("id", validAdIds);
      if (error) throw error;

      return Response.json({
        success: true,
        message: `${validAdIds.length} ad(s) marked as paid`,
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
        .in("id", validAdIds);
      if (error) throw error;

      if (newStatus === "Published") {
        for (const advertiser of affectedAdvertisers) {
          await updateAdvertiserNextAdDate(advertiser);
        }
      }

      return Response.json({
        success: true,
        message: `${validAdIds.length} ad(s) updated to ${newStatus}`,
      });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error performing bulk action:", error);
    const details = String(error?.message || "").trim();
    return Response.json(
      { error: details || "Failed to perform bulk action" },
      { status: 500 },
    );
  }
}
