import sql from "@/app/api/utils/sql";

export async function GET(request, { params }) {
  try {
    const { id } = params;

    // Get all invoices that include this ad
    const invoices = await sql`
      SELECT DISTINCT
        i.id,
        i.invoice_number,
        i.advertiser_name,
        i.issue_date,
        i.status,
        i.total,
        i.amount_paid,
        i.created_at
      FROM invoices i
      INNER JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE ii.ad_id = ${id}
        AND i.deleted_at IS NULL
      ORDER BY i.created_at DESC
    `;

    return Response.json({ invoices });
  } catch (error) {
    console.error("Error fetching ad invoices:", error);
    return Response.json(
      { error: "Failed to fetch invoices" },
      { status: 500 },
    );
  }
}
