import { db, table, toNumber } from "@/app/api/utils/supabase-db";

/**
 * Recalculates an advertiser's spend based on all paid invoices.
 * Keeps both `total_spend` and `ad_spend` in sync for compatibility.
 * @param {string} advertiserId
 * @returns {Promise<number>}
 */
export async function recalculateAdvertiserSpend(advertiserId) {
  if (!advertiserId) return 0;

  const supabase = db();

  const { data: invoices, error: invoicesError } = await supabase
    .from(table("invoices"))
    .select("total, amount, status, deleted_at")
    .eq("advertiser_id", advertiserId)
    .eq("status", "Paid")
    .is("deleted_at", null);

  if (invoicesError) {
    throw invoicesError;
  }

  const totalSpend = (invoices || []).reduce((sum, invoice) => {
    const total = invoice?.total ?? invoice?.amount ?? 0;
    return sum + toNumber(total, 0);
  }, 0);

  let updateResult = await supabase
    .from(table("advertisers"))
    .update({
      total_spend: totalSpend,
      ad_spend: totalSpend,
      updated_at: new Date().toISOString(),
    })
    .eq("id", advertiserId);

  if (updateResult.error) {
    const message = String(updateResult.error.message || "");
    if (!message.includes("total_spend")) {
      throw updateResult.error;
    }

    updateResult = await supabase
      .from(table("advertisers"))
      .update({
        ad_spend: totalSpend,
        updated_at: new Date().toISOString(),
      })
      .eq("id", advertiserId);

    if (updateResult.error) {
      throw updateResult.error;
    }
  }

  return totalSpend;
}
