import { db, table } from "../../../utils/supabase-db.js";
import { requireAdmin } from "../../../utils/auth-check.js";

export async function PUT(request, { params }) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { id } = params;
    const body = await request.json();

    const patch = { updated_at: new Date().toISOString() };

    const fields = [
      "advertiser_name",
      "contact_name",
      "email",
      "phone_number",
      "ad_name",
      "post_type",
      "post_date_from",
      "post_date_to",
      "post_time",
      "reminder_minutes",
      "ad_text",
      "placement",
      "notes",
    ];

    for (const field of fields) {
      if (body[field] !== undefined) {
        patch[field] = body[field];
      }
    }

    if (body.phone_number !== undefined) {
      patch.phone = body.phone_number || null;
    }

    if (body.custom_dates !== undefined) {
      patch.custom_dates = Array.isArray(body.custom_dates) ? body.custom_dates : [];
    }

    if (Object.keys(patch).length === 1) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(table("pending_ads"))
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return Response.json({ error: "Pending ad not found" }, { status: 404 });
    }

    return Response.json({
      message: "Submission updated successfully",
      pending_ad: data,
    });
  } catch (error) {
    console.error("Error updating pending ad:", error);
    return Response.json(
      { error: "Failed to update submission" },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { id } = params;

    const { data: pendingAd, error: pendingAdError } = await supabase
      .from(table("pending_ads"))
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (pendingAdError) throw pendingAdError;

    if (!pendingAd) {
      return Response.json({ error: "Pending ad not found" }, { status: 404 });
    }

    if (pendingAd.status !== "not_approved") {
      return Response.json(
        { error: "Can only delete ads marked as not approved" },
        { status: 400 },
      );
    }

    const { error } = await supabase.from(table("pending_ads")).delete().eq("id", id);
    if (error) throw error;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting pending ad:", error);
    return Response.json({ error: "Failed to delete ad" }, { status: 500 });
  }
}
