import sql from "../../utils/sql";

export async function POST(request) {
  try {
    const { advertiserId, dateFrom, dateTo, status } = await request.json();

    // Get advertiser
    const [advertiser] = await sql`
      SELECT * FROM advertisers WHERE id = ${advertiserId}
    `;

    if (!advertiser) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    // Get all unpaid/uninvoiced ads for this advertiser in date range
    const ads = await sql`
      SELECT 
        a.*,
        p.price as product_price,
        p.product_name
      FROM ads a
      LEFT JOIN products p ON a.product_id = p.id
      WHERE a.advertiser = ${advertiser.advertiser_name}
        AND a.payment != 'Paid'
        AND a.paid_via_invoice_id IS NULL
        AND (
          (a.schedule >= ${dateFrom} AND a.schedule <= ${dateTo})
          OR (a.post_date_from >= ${dateFrom} AND a.post_date_from <= ${dateTo})
        )
        AND a.archived = false
      ORDER BY a.schedule, a.post_date_from
    `;

    if (ads.length === 0) {
      return Response.json(
        { error: "No unpaid ads found for this date range" },
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

    // Create invoice
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
        notes
      ) VALUES (
        ${invoiceNumber},
        ${advertiser.id},
        ${advertiser.advertiser_name},
        ${advertiser.contact_name},
        ${advertiser.email},
        ${new Date().toISOString().split("T")[0]},
        ${status || "Pending"},
        ${total},
        ${status === "Paid" ? total : 0},
        ${"Batch invoice for " + dateFrom + " to " + dateTo}
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

    // If paid, update ads
    if (status === "Paid") {
      const adIds = ads.map((a) => a.id);
      await sql`
        UPDATE ads 
        SET payment = 'Paid',
            paid_via_invoice_id = ${invoice.id}
        WHERE id = ANY(${adIds})
      `;
    }

    return Response.json({
      success: true,
      invoice,
      adsIncluded: ads.length,
    });
  } catch (error) {
    console.error("Error creating batch invoice:", error);
    return Response.json(
      { error: "Failed to create batch invoice" },
      { status: 500 },
    );
  }
}
