import sql from "@/app/api/utils/sql";

/**
 * Recalculates an advertiser's total_spend based on all "Paid" invoices
 * @param {number} advertiserId - The advertiser ID to recalculate
 * @returns {Promise<number>} The new total_spend value
 */
export async function recalculateAdvertiserSpend(advertiserId) {
  if (!advertiserId) {
    return 0;
  }

  // Sum all "Paid" invoices for this advertiser (excluding soft-deleted)
  const result = await sql`
    SELECT COALESCE(SUM(total), 0) as total_spend
    FROM invoices
    WHERE advertiser_id = ${parseInt(advertiserId)}
    AND status = 'Paid'
    AND deleted_at IS NULL
  `;

  const totalSpend = parseFloat(result[0].total_spend) || 0;

  // Update the advertiser's total_spend
  await sql`
    UPDATE advertisers
    SET total_spend = ${totalSpend}
    WHERE id = ${parseInt(advertiserId)}
  `;

  return totalSpend;
}
