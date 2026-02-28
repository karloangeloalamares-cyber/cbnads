import { db, table } from "../../../utils/supabase-db.js";
import { requireAdmin } from "../../../utils/auth-check.js";

export async function GET(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { count, error } = await supabase
      .from(table("pending_ads"))
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("viewed_by_admin", false);

    if (error) throw error;

    return Response.json({ count: Number(count) || 0 });
  } catch (error) {
    console.error("GET /api/admin/pending-ads/unread-count error", error);
    return Response.json(
      { error: "Failed to fetch unread submission count" },
      { status: 500 },
    );
  }
}
