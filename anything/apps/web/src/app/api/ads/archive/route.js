import { db, table } from "@/app/api/utils/supabase-db";
import { requireAdmin } from "@/app/api/utils/auth-check";

const ARCHIVE_AFTER_DAYS = 90;

// POST - Archive old published ads (Published + older than 90 days)
export async function POST() {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const cutoff = new Date(
      Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await supabase
      .from(table("ads"))
      .update({
        archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq("status", "Published")
      .eq("archived", false)
      .not("published_at", "is", null)
      .lt("published_at", cutoff)
      .select("id, ad_name, published_at");
    if (error) throw error;

    const archivedAds = data || [];
    return Response.json({
      success: true,
      archivedCount: archivedAds.length,
      archivedAds,
      message: `Archived ${archivedAds.length} old published ad${archivedAds.length !== 1 ? "s" : ""}`,
    });
  } catch (error) {
    console.error("Error archiving old ads:", error);
    return Response.json(
      { error: "Failed to archive old ads" },
      { status: 500 },
    );
  }
}

// PUT - Manually archive/unarchive specific ad
export async function PUT(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const body = await request.json();
    const { id, archived } = body;

    if (!id || archived === undefined) {
      return Response.json(
        { error: "Ad ID and archived status are required" },
        { status: 400 },
      );
    }

    const supabase = db();
    const { data, error } = await supabase
      .from(table("ads"))
      .update({
        archived: Boolean(archived),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      return Response.json({ error: "Ad not found" }, { status: 404 });
    }

    return Response.json({
      success: true,
      ad: data,
      message: archived ? "Ad archived" : "Ad unarchived",
    });
  } catch (error) {
    console.error("Error updating ad archive status:", error);
    return Response.json(
      { error: "Failed to update ad archive status" },
      { status: 500 },
    );
  }
}

