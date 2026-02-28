import { db, table } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";
import { updateAdvertiserNextAdDate } from "../../utils/update-advertiser-next-ad.js";

export async function DELETE(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json({ error: "Ad ID is required" }, { status: 400 });
    }

    const { data: removedAd, error } = await supabase
      .from(table("ads"))
      .delete()
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;

    if (!removedAd) {
      return Response.json({ error: "Ad not found" }, { status: 404 });
    }

    if (removedAd.advertiser) {
      await updateAdvertiserNextAdDate(removedAd.advertiser);
    }

    return Response.json({ success: true, ad: removedAd });
  } catch (error) {
    console.error("Error deleting ad:", error);
    return Response.json({ error: "Failed to delete ad" }, { status: 500 });
  }
}
