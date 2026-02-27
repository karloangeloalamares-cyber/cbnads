import { db, table } from "@/app/api/utils/supabase-db";
import { requireAdmin } from "@/app/api/utils/auth-check";

export async function GET(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();

    // Only show pending and rejected (not_approved) ads
    // Approved ads are deleted and moved to the ads table
    const { data, error } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .in("status", ["pending", "not_approved"])
      .order("created_at", { ascending: false });
    if (error) throw error;

    const pendingAds = (data || []).sort((a, b) => {
      const priority = (value) => (value === "pending" ? 1 : value === "not_approved" ? 2 : 3);
      return priority(a.status) - priority(b.status);
    });

    return Response.json({ pending_ads: pendingAds });
  } catch (error) {
    console.error("Error fetching pending ads:", error);
    return Response.json(
      { error: "Failed to fetch pending ads" },
      { status: 500 },
    );
  }
}
