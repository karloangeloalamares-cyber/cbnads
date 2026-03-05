import { db, table } from "../../../utils/supabase-db.js";
import { requirePermission } from "../../../utils/auth-check.js";

export async function POST(request) {
  try {
    const auth = await requirePermission("notifications:view", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const supabase = db();
    const { error } = await supabase
      .from(table("pending_ads"))
      .update({
        viewed_by_admin: true,
        updated_at: new Date().toISOString(),
      })
      .in("status", ["pending", "Pending"])
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
