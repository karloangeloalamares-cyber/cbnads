import { db, table, toNumber } from "../../utils/supabase-db.js";
import { requirePermission } from "../../utils/auth-check.js";
import { nextSequentialInvoiceNumber } from "../../utils/invoice-helpers.js";
import { recalculateAdvertiserSpend } from "../../utils/recalculate-advertiser-spend.js";
import { getTodayInAppTimeZone } from "../../../../lib/timezone.js";

export async function POST(request) {
  try {
    const auth = await requirePermission("billing:edit", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
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
    const invoiceNumber = await nextSequentialInvoiceNumber(
      supabase,
      table("invoices"),
    );
    const linkedAdIds = [
      ...new Set(
        items
          .map((item) => String(item?.ad_id || "").trim())
          .filter(Boolean),
      ),
    ];

    let invoice = null;
    try {
      const createInvoiceResult = await supabase
        .from(table("invoices"))
        .insert({
          invoice_number: invoiceNumber,
          advertiser_id: advertiser_id || null,
          advertiser_name,
          ad_ids: linkedAdIds,
          contact_name: contact_name || null,
          contact_email: contact_email || null,
          bill_to: bill_to || advertiser_name,
          issue_date: getTodayInAppTimeZone(),
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
      if (createInvoiceResult.error) throw createInvoiceResult.error;
      invoice = createInvoiceResult.data || null;
      if (!invoice?.id) {
        throw new Error("Invoice record was not created.");
      }

      const invoiceItemsPayload = items.map((item) => {
        const quantity = toNumber(item.quantity, 1) || 1;
        const unitPrice = toNumber(item.unit_price, 0);
        const amount = toNumber(item.amount, quantity * unitPrice);
        return {
          invoice_id: invoice.id,
          ad_id: item.ad_id || null,
          product_id: item.product_id || null,
          description: item.description || "",
          quantity,
          unit_price: unitPrice,
          amount,
          created_at: nowIso,
        };
      });
      if (invoiceItemsPayload.length > 0) {
        const { error: itemError } = await supabase
          .from(table("invoice_items"))
          .insert(invoiceItemsPayload);
        if (itemError) throw itemError;
      }

      if (linkedAdIds.length > 0) {
        const nextPaymentStatus = String(status).toLowerCase() === "paid" ? "Paid" : "Pending";
        const { error: adUpdateError } = await supabase
          .from(table("ads"))
          .update({
            payment: nextPaymentStatus,
            invoice_id: invoice.id,
            paid_via_invoice_id: invoice.id,
            updated_at: nowIso,
          })
          .in("id", linkedAdIds);
        if (adUpdateError) throw adUpdateError;
      }
    } catch (creationError) {
      if (invoice?.id) {
        await supabase.from(table("invoices")).delete().eq("id", invoice.id);
      }
      throw creationError;
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
