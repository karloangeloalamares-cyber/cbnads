import { db, table } from "../../../utils/supabase-db.js";
import { requirePermission } from "../../../utils/auth-check.js";
import { hasSupabaseAdminConfig } from "../../../../../lib/supabaseAdmin.js";

const isRecoverableUnreadCountError = (error) => {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || error || "").trim();
  return (
    !hasSupabaseAdminConfig ||
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    /does not exist/i.test(message) ||
    /Supabase admin is not configured/i.test(message)
  );
};

export async function GET(request) {
  try {
    if (!hasSupabaseAdminConfig) {
      return Response.json({ count: 0, degraded: true });
    }

    const auth = await requirePermission("notifications:view", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const supabase = db();
    const { count, error } = await supabase
      .from(table("pending_ads"))
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "Pending"])
      .eq("viewed_by_admin", false);

    if (error) throw error;

    return Response.json({ count: Number(count) || 0 });
  } catch (error) {
    console.error("GET /api/admin/pending-ads/unread-count error", error);
    return Response.json({
      count: 0,
      degraded: true,
      recoverable: isRecoverableUnreadCountError(error),
    });
  }
}
