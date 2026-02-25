import sql from "../../utils/sql";
import { auth } from "../../../../auth";
import { recalculateAdvertiserSpend } from "../../utils/recalculate-advertiser-spend";

function generateInvoiceNumber() {
  const now = new Date();
  const dateStr =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let random = "";
  for (let i = 0; i < 4; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `INV-${dateStr}-${random}`;
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      advertiser_id,
      advertiser_name,
      contact_name,
      contact_email,
      bill_to,
      issue_date,
      status = "Pending",
      discount = 0,
      tax = 0,
      notes,
      items = [],
    } = body;

    if (!advertiser_name) {
      return Response.json(
        { error: "Advertiser name is required" },
        { status: 400 },
      );
    }

    if (!items || items.length === 0) {
      return Response.json(
        { error: "At least one line item is required" },
        { status: 400 },
      );
    }

    // Calculate total from items
    let subtotal = 0;
    for (const item of items) {
      subtotal += parseFloat(item.amount) || 0;
    }
    const total =
      subtotal - (parseFloat(discount) || 0) + (parseFloat(tax) || 0);

    const invoiceNumber = generateInvoiceNumber();

    // Create invoice
    const invoiceResult = await sql`
      INSERT INTO invoices (invoice_number, advertiser_id, advertiser_name, contact_name, contact_email, bill_to, issue_date, status, discount, tax, total, notes)
      VALUES (${invoiceNumber}, ${advertiser_id || null}, ${advertiser_name}, ${contact_name || null}, ${contact_email || null}, ${bill_to || advertiser_name}, ${issue_date || new Date().toISOString().split("T")[0]}, ${status}, ${parseFloat(discount) || 0}, ${parseFloat(tax) || 0}, ${total}, ${notes || null})
      RETURNING *
    `;

    const invoice = invoiceResult[0];

    // Create line items
    for (const item of items) {
      await sql`
        INSERT INTO invoice_items (invoice_id, ad_id, product_id, description, quantity, unit_price, amount)
        VALUES (${invoice.id}, ${item.ad_id || null}, ${item.product_id || null}, ${item.description}, ${item.quantity || 1}, ${parseFloat(item.unit_price) || 0}, ${parseFloat(item.amount) || 0})
      `;
    }

    // Fetch items back
    const invoiceItems = await sql`
      SELECT * FROM invoice_items WHERE invoice_id = ${invoice.id} ORDER BY id ASC
    `;

    // Recalculate advertiser's total_spend if invoice is Paid
    if (status === "Paid" && advertiser_id) {
      await recalculateAdvertiserSpend(advertiser_id);
    }

    return Response.json(
      { invoice: { ...invoice, items: invoiceItems } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating invoice:", error);
    return Response.json(
      { error: "Failed to create invoice" },
      { status: 500 },
    );
  }
}
