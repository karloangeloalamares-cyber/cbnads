import { db, table } from "../../../utils/supabase-db.js";
import { requirePermission } from "../../../utils/auth-check.js";

const normalizePendingStatus = (value) => String(value || "").trim().toLowerCase();

export async function GET(request) {
  try {
    const auth = await requirePermission("notifications:view", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const supabase = db();

    // Only show pending and rejected (not_approved) ads
    // Approved ads are deleted and moved to the ads table
    const { data, error } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const pendingAds = (data || [])
      .filter((item) =>
        ["pending", "not_approved"].includes(normalizePendingStatus(item?.status)),
      )
      .sort((a, b) => {
        const priority = (value) => {
          const normalized = normalizePendingStatus(value);
          return normalized === "pending" ? 1 : normalized === "not_approved" ? 2 : 3;
        };
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
