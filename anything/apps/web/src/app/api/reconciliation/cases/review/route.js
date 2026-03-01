import { db, table } from "../../../utils/supabase-db.js";
import { requirePermission } from "../../../utils/auth-check.js";

export async function POST(request) {
  try {
    const auth = await requirePermission("reconciliation:view", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { case_key, status, note = "", case_type = "", invoice_id = null, ad_id = null } =
      await request.json();

    if (!case_key || !status) {
      return Response.json({ error: "case_key and status are required" }, { status: 400 });
    }

    if (!["open", "reviewed", "resolved", "dismissed"].includes(String(status))) {
      return Response.json({ error: "Invalid reconciliation status" }, { status: 400 });
    }

    const supabase = db();
    const payload = {
      case_key,
      case_type: case_type || String(case_key).split(":")[0],
      invoice_id,
      ad_id,
      status,
      note: note || null,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from(table("reconciliation_case_reviews"))
      .upsert(payload, { onConflict: "case_key" })
      .select("*")
      .single();
    if (error) throw error;

    return Response.json({ review: data });
  } catch (error) {
    console.error("Error saving reconciliation review:", error);
    return Response.json({ error: "Failed to save reconciliation review" }, { status: 500 });
  }
}
