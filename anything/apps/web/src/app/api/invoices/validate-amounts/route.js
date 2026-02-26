import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    // Find all discrepancies between invoice totals and linked ad payments
    const discrepancies = await sql`
      WITH invoice_ad_totals AS (
        SELECT 
          i.id as invoice_id,
          i.invoice_number,
          i.advertiser_name,
          i.total as invoice_total,
          i.status,
          COALESCE(SUM(
            CASE 
              WHEN a.payment LIKE '$%' 
              THEN CAST(REPLACE(REPLACE(a.payment, '$', ''), ',', '') AS NUMERIC)
              ELSE 0
            END
          ), 0) as ads_total,
          COUNT(DISTINCT a.id) as ad_count
        FROM invoices i
        LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
        LEFT JOIN ads a ON a.id = ii.ad_id
        WHERE i.deleted_at IS NULL
        GROUP BY i.id, i.invoice_number, i.advertiser_name, i.total, i.status
      )
      SELECT 
        *,
        (invoice_total - ads_total) as difference
      FROM invoice_ad_totals
      WHERE ABS(invoice_total - ads_total) > 0.01
      ORDER BY ABS(invoice_total - ads_total) DESC
    `;

    // Find ads marked as paid without invoice reference
    const orphanedPaidAds = await sql`
      SELECT 
        id,
        ad_name,
        advertiser,
        payment,
        status
      FROM ads
      WHERE payment = 'Paid'
        AND paid_via_invoice_id IS NULL
        AND archived = false
    `;

    // Find ads linked to deleted invoices
    const deletedInvoiceAds = await sql`
      SELECT 
        a.id,
        a.ad_name,
        a.advertiser,
        a.payment,
        a.paid_via_invoice_id,
        i.invoice_number,
        i.deleted_at
      FROM ads a
      INNER JOIN invoices i ON a.paid_via_invoice_id = i.id
      WHERE i.deleted_at IS NOT NULL
    `;

    return Response.json({
      discrepancies,
      orphanedPaidAds,
      deletedInvoiceAds,
      summary: {
        totalDiscrepancies: discrepancies.length,
        totalOrphanedAds: orphanedPaidAds.length,
        totalDeletedInvoiceAds: deletedInvoiceAds.length,
      },
    });
  } catch (error) {
    console.error("Error validating amounts:", error);
    return Response.json(
      { error: "Failed to validate amounts" },
      { status: 500 },
    );
  }
}
