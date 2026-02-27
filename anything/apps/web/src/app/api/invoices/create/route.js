import { db, table, toNumber } from "@/app/api/utils/supabase-db";
import { requireAdmin } from "@/app/api/utils/auth-check";
import { recalculateAdvertiserSpend } from "@/app/api/utils/recalculate-advertiser-spend";

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
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
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

    const subtotal = items.reduce((sum, item) => sum + toNumber(item.amount, 0), 0);
    const total = subtotal - toNumber(discount, 0) + toNumber(tax, 0);
    const nowIso = new Date().toISOString();
    const invoiceNumber = generateInvoiceNumber();

    const { data: invoice, error: invoiceError } = await supabase
      .from(table("invoices"))
      .insert({
        invoice_number: invoiceNumber,
        advertiser_id: advertiser_id || null,
        advertiser_name,
        contact_name: contact_name || null,
        contact_email: contact_email || null,
        bill_to: bill_to || advertiser_name,
        issue_date: issue_date || nowIso.slice(0, 10),
        status,
        discount: toNumber(discount, 0),
        tax: toNumber(tax, 0),
        total,
        amount: total,
        amount_paid: String(status).toLowerCase() === "paid" ? total : 0,
        notes: notes || null,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .single();
    if (invoiceError) throw invoiceError;

    for (const item of items) {
      const quantity = toNumber(item.quantity, 1) || 1;
      const unitPrice = toNumber(item.unit_price, 0);
      const amount = toNumber(item.amount, quantity * unitPrice);
      const { error: itemError } = await supabase.from(table("invoice_items")).insert({
        invoice_id: invoice.id,
        ad_id: item.ad_id || null,
        product_id: item.product_id || null,
        description: item.description || "",
        quantity,
        unit_price: unitPrice,
        amount,
        created_at: nowIso,
      });
      if (itemError) throw itemError;
    }

    const { data: invoiceItems, error: itemsError } = await supabase
      .from(table("invoice_items"))
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: true });
    if (itemsError) throw itemsError;

    if (String(status).toLowerCase() === "paid" && advertiser_id) {
      await recalculateAdvertiserSpend(advertiser_id);
    }

    return Response.json(
      { invoice: { ...invoice, items: invoiceItems || [] } },
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
