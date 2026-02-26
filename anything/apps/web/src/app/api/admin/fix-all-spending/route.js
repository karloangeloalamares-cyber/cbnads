import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { recalculateAdvertiserSpend } from "@/app/api/utils/recalculate-advertiser-spend";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all advertisers
    const advertisers = await sql`SELECT id, advertiser_name FROM advertisers`;

    const results = [];
    for (const advertiser of advertisers) {
      const newTotal = await recalculateAdvertiserSpend(advertiser.id);
      results.push({
        id: advertiser.id,
        name: advertiser.advertiser_name,
        newTotal,
      });
    }

    return Response.json({
      success: true,
      message: `Recalculated spending for ${advertisers.length} advertisers`,
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
