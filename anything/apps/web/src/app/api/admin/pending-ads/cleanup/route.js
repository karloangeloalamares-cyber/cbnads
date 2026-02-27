import { db, table } from "../../../utils/supabase-db.js";
import { requireAdmin } from "../../../utils/auth-check.js";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();

    // Find all pending ads with 'approved' status (these got stuck due to old code)
    const { data: stuckAds, error: stuckError } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .eq("status", "approved");
    if (stuckError) throw stuckError;

    // Delete them since they should have been removed after approval
    const { data: deleted, error: deleteError } = await supabase
      .from(table("pending_ads"))
      .delete()
      .eq("status", "approved")
      .select("*");
    if (deleteError) throw deleteError;

    return Response.json({
      success: true,
      message: `Cleaned up ${(deleted || []).length} stuck 'approved' records`,
      deleted_records: deleted,
    });
  } catch (error) {
    console.error("Error cleaning up pending ads:", error);
    return Response.json(
      { error: "Failed to cleanup pending ads" },
      { status: 500 },
    );
  }
}
