import { db, table } from "@/app/api/utils/supabase-db";
import { requireAdmin } from "@/app/api/utils/auth-check";
import { updateAdvertiserNextAdDate } from "@/app/api/utils/update-advertiser-next-ad";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return Response.json({ error: "Ad ID is required" }, { status: 400 });
    }

    const { data: existingAd, error: existingError } = await supabase
      .from(table("ads"))
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw existingError;

    if (!existingAd) {
      return Response.json({ error: "Ad not found" }, { status: 404 });
    }

    const { data: updated, error: updateError } = await supabase
      .from(table("ads"))
      .update({
        status: "Published",
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    if (updated.advertiser) {
      await updateAdvertiserNextAdDate(updated.advertiser);
    }

    return Response.json({
      success: true,
      ad: updated,
    });
  } catch (error) {
    console.error("Error marking ad as published:", error);
    return Response.json({ error: "Failed to mark ad as published" }, { status: 500 });
  }
}
