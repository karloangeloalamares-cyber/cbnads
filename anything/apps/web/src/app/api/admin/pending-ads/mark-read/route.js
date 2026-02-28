import { db, table } from "../../../utils/supabase-db.js";
import { requireAdmin } from "../../../utils/auth-check.js";

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { error } = await supabase
      .from(table("pending_ads"))
      .update({
        viewed_by_admin: true,
        updated_at: new Date().toISOString(),
      })
      .eq("status", "pending")
      .eq("viewed_by_admin", false);

    if (error) throw error;

    return Response.json({ success: true });
  } catch (error) {
    console.error("POST /api/admin/pending-ads/mark-read error", error);
    return Response.json(
      { error: "Failed to mark submissions as read" },
      { status: 500 },
    );
  }
}
