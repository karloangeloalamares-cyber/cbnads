import sql from "../../utils/sql";
import { auth } from "../../../../auth";

export async function POST(request) {
  try {
    const { adIds, invoiceData } = await request.json();

    if (!adIds || adIds.length === 0) {
      return Response.json({ error: "No ads selected" }, { status: 400 });
    }

    // Get ad details
    const ads = await sql`
      SELECT 
        a.id,
        a.ad_name,
        a.advertiser,
        a.payment,
        p.price as product_price,
        p.product_name,
        p.placement
      FROM ads a
      LEFT JOIN products p ON a.product_id = p.id
      WHERE a.id = ANY(${adIds})
    `;

    if (ads.length === 0) {
      return Response.json({ error: "No valid ads found" }, { status: 404 });
    }

    // Use first ad's advertiser info or provided data
    const firstAd = ads[0];

    // Get advertiser details
    const advertiser = await sql`
      SELECT * FROM advertisers 
      WHERE advertiser_name = ${invoiceData.advertiserName || firstAd.advertiser}
      LIMIT 1
    `;

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
      // Try to extract amount from payment field
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

    const discount = invoiceData.discount || 0;
    const tax = invoiceData.tax || 0;
    const total = subtotal - discount + tax;

    // Create invoice
    const [invoice] = await sql`
      INSERT INTO invoices (
        invoice_number,
        advertiser_id,
        advertiser_name,
        contact_name,
        contact_email,
        bill_to,
        issue_date,
        status,
        discount,
        tax,
        total,
        amount_paid,
        notes
      ) VALUES (
        ${invoiceNumber},
        ${advertiser.length > 0 ? advertiser[0].id : null},
        ${invoiceData.advertiserName || firstAd.advertiser},
        ${invoiceData.contactName || (advertiser.length > 0 ? advertiser[0].contact_name : "")},
        ${invoiceData.contactEmail || (advertiser.length > 0 ? advertiser[0].email : "")},
        ${invoiceData.billTo || ""},
        ${invoiceData.issueDate || new Date().toISOString().split("T")[0]},
        ${invoiceData.status || "Pending"},
        ${discount},
        ${tax},
        ${total},
        ${invoiceData.status === "Paid" ? total : 0},
        ${invoiceData.notes || ""}
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

    // If invoice is paid, update linked ads
    if (invoiceData.status === "Paid") {
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
      invoiceNumber,
    });
  } catch (error) {
    console.error("Error creating invoice from ads:", error);
    return Response.json(
      { error: "Failed to create invoice" },
      { status: 500 },
    );
  }
}
