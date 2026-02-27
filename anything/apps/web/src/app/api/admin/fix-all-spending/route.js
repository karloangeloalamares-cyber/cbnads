import { db, table } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";
import { recalculateAdvertiserSpend } from "../../utils/recalculate-advertiser-spend.js";

export async function POST() {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { data: advertisers, error } = await supabase
      .from(table("advertisers"))
      .select("id, advertiser_name");
    if (error) throw error;

    const results = [];
    for (const advertiser of advertisers || []) {
      const newTotal = await recalculateAdvertiserSpend(advertiser.id);
      results.push({
        id: advertiser.id,
        name: advertiser.advertiser_name,
        newTotal,
      });
    }

    return Response.json({
      success: true,
      message: `Recalculated spending for ${(advertisers || []).length} advertisers`,
      results,
    });
  } catch (error) {
    console.error("Error fixing advertiser spending:", error);
    return Response.json(
      { error: "Failed to fix advertiser spending" },
      { status: 500 },
    );
  }
}

