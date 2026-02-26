import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const { advertiserId, period, startDate, endDate } = await request.json();

    // Validate period
    if (!["weekly", "monthly", "quarterly"].includes(period)) {
      return Response.json(
        { error: "Invalid period. Must be weekly, monthly, or quarterly" },
        { status: 400 },
      );
    }

    // Get advertiser
    const [advertiser] = await sql`
      SELECT * FROM advertisers WHERE id = ${advertiserId}
    `;

    if (!advertiser) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    // Get all ads for this advertiser in the date range
    const ads = await sql`
      SELECT 
        a.*,
        p.price as product_price,
        p.product_name
      FROM ads a
      LEFT JOIN products p ON a.product_id = p.id
      WHERE a.advertiser = ${advertiser.advertiser_name}
        AND (
          (a.schedule >= ${startDate} AND a.schedule <= ${endDate})
          OR (a.post_date_from >= ${startDate} AND a.post_date_from <= ${endDate})
        )
        AND a.archived = false
      ORDER BY a.schedule, a.post_date_from
    `;

    if (ads.length === 0) {
      return Response.json(
        { error: "No ads found for this date range" },
        { status: 404 },
      );
    }

    // Generate invoice number
    const lastInvoice = await sql`
      SELECT invoice_number 
      FROM invoices 
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    let invoiceNumber;
    if (lastInvoice.length > 0) {
      const lastNum = parseInt(
        lastInvoice[0].invoice_number.replace(/\D/g, ""),
      );
      invoiceNumber = `INV-${String(lastNum + 1).padStart(4, "0")}`;
    } else {
      invoiceNumber = "INV-0001";
    }

    // Calculate totals
    let subtotal = 0;
    const lineItems = ads.map((ad) => {
      let amount = 0;
      if (ad.payment && ad.payment.startsWith("$")) {
        amount = parseFloat(ad.payment.replace(/[$,]/g, ""));
      } else if (ad.product_price) {
        amount = parseFloat(ad.product_price);
      }

      subtotal += amount;

      return {
        ad_id: ad.id,
        product_id: ad.product_id,
        description: ad.ad_name,
        quantity: 1,
        unit_price: amount,
        amount: amount,
      };
    });

    const total = subtotal;

    // Create recurring invoice
    const [invoice] = await sql`
      INSERT INTO invoices (
        invoice_number,
        advertiser_id,
        advertiser_name,
        contact_name,
        contact_email,
        issue_date,
        status,
        total,
        amount_paid,
        is_recurring,
        recurring_period,
        last_generated_at,
        notes
      ) VALUES (
        ${invoiceNumber},
        ${advertiser.id},
        ${advertiser.advertiser_name},
        ${advertiser.contact_name},
        ${advertiser.email},
        ${new Date().toISOString().split("T")[0]},
        'Pending',
        ${total},
        0,
        true,
        ${period},
        ${new Date().toISOString()},
        ${"Recurring " + period + " invoice for " + startDate + " to " + endDate}
      )
      RETURNING *
    `;

    // Create line items
    for (const item of lineItems) {
      await sql`
        INSERT INTO invoice_items (
          invoice_id,
          ad_id,
          product_id,
          description,
          quantity,
          unit_price,
          amount
        ) VALUES (
          ${invoice.id},
          ${item.ad_id},
          ${item.product_id},
          ${item.description},
          ${item.quantity},
          ${item.unit_price},
          ${item.amount}
        )
      `;
    }

    return Response.json({
      success: true,
      invoice,
      adsIncluded: ads.length,
    });
  } catch (error) {
    console.error("Error generating recurring invoice:", error);
    return Response.json(
      { error: "Failed to generate recurring invoice" },
      { status: 500 },
    );
  }
}
