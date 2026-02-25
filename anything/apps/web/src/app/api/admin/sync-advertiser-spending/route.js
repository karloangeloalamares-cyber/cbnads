import sql from "../../utils/sql";
import { auth } from "../../../../auth";
import { recalculateAdvertiserSpend } from "../../utils/recalculate-advertiser-spend";

/**
 * One-time sync endpoint to recalculate total_spend for all advertisers
 * based on their "Paid" invoices
 */
export async function POST(request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all advertisers
    const advertisers = await sql`SELECT id, advertiser_name FROM advertisers`;

    const results = [];

    // Recalculate each advertiser's total_spend
    for (const advertiser of advertisers) {
      const newTotal = await recalculateAdvertiserSpend(advertiser.id);
      results.push({
        id: advertiser.id,
        name: advertiser.advertiser_name,
        new_total_spend: newTotal,
      });
    }

    return Response.json({
      message: `Successfully synced ${results.length} advertisers`,
      results,
    });
  } catch (error) {
    console.error("Error syncing advertiser spending:", error);
    return Response.json(
      { error: "Failed to sync advertiser spending" },
      { status: 500 },
    );
  }
}
