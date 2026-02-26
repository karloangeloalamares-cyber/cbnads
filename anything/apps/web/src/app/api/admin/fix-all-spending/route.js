import { db, table } from "@/app/api/utils/supabase-db";
import { requireAdmin } from "@/app/api/utils/auth-check";
import { recalculateAdvertiserSpend } from "@/app/api/utils/recalculate-advertiser-spend";

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

