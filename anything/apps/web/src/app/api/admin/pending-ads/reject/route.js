import { db, table } from "../../../utils/supabase-db.js";
import { requireAdmin } from "../../../utils/auth-check.js";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const body = await request.json();
    const { pending_ad_id } = body;

    if (!pending_ad_id) {
      return Response.json({ error: "Missing pending_ad_id" }, { status: 400 });
    }

    const { error } = await supabase
      .from(table("pending_ads"))
      .update({
        status: "not_approved",
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pending_ad_id);
    if (error) throw error;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error rejecting pending ad:", error);
    return Response.json({ error: "Failed to reject ad" }, { status: 500 });
  }
}
