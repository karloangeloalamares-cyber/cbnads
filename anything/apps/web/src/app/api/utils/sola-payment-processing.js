import { table, toNumber } from "./supabase-db.js";
import { recalculateAdvertiserSpend } from "./recalculate-advertiser-spend.js";
import { sendPaymentReceivedNotifications } from "./payment-received-notifications.js";

const normalizeText = (value) => String(value || "").trim().toLowerCase();

export const readSolaWebhookAmount = (payload) => {
  const amount = toNumber(
    payload?.xAuthAmount ??
      payload?.xAmount ??
      payload?.xauthamount ??
      payload?.xamount,
    0,
  );
  return Math.max(0, amount);
};

export const findInvoiceFromSolaPayload = async (supabase, payload) => {
  const candidateFields = [
    payload?.xInvoice,
    payload?.xinvoice,
    payload?.xCustom01,
    payload?.xcustom01,
    payload?.xCustom02,
    payload?.xcustom02,
    payload?.xOrderId,
    payload?.xorderid,
  ];

  const candidates = Array.from(
    new Set(candidateFields.map((value) => String(value || "").trim()).filter(Boolean)),
  );

  for (const candidate of candidates) {
    let { data, error } = await supabase
      .from(table("invoices"))
      .select("*")
      .eq("invoice_number", candidate)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) {
      return data;
    }

    ({ data, error } = await supabase
      .from(table("invoices"))
      .select("*")
      .eq("id", candidate)
      .is("deleted_at", null)
      .maybeSingle());
    if (error) throw error;
    if (data?.id) {
      return data;
    }
  }

  return null;
};

const loadLinkedAdIds = async (supabase, invoice) => {
  const linkedIds = Array.isArray(invoice?.ad_ids)
    ? invoice.ad_ids.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  const { data: invoiceItems, error: invoiceItemsError } = await supabase
    .from(table("invoice_items"))
    .select("ad_id")
    .eq("invoice_id", invoice.id)
    .not("ad_id", "is", null);
  if (invoiceItemsError) throw invoiceItemsError;

  return Array.from(
    new Set([
      ...linkedIds,
      ...(invoiceItems || []).map((item) => String(item?.ad_id || "").trim()).filter(Boolean),
    ]),
  );
};

export const applySolaPaymentPayload = async ({ request, supabase, payload }) => {
  const invoice = await findInvoiceFromSolaPayload(supabase, payload);
  if (!invoice?.id) {
    return {
      received: true,
      processed: false,
      reason: "invoice_not_found",
    };
  }

  const invoiceTotal = Math.max(0, toNumber(invoice.total ?? invoice.amount, 0));
  const existingAmountPaid = Math.max(0, toNumber(invoice.amount_paid, 0));
  const webhookAmount = readSolaWebhookAmount(payload);
  const nextAmountPaid = Math.max(existingAmountPaid, webhookAmount);
  const appliedAmountPaid = Math.min(nextAmountPaid, invoiceTotal || nextAmountPaid);
  const nextStatus =
    nextAmountPaid >= invoiceTotal && invoiceTotal > 0
      ? "Paid"
      : nextAmountPaid > 0
        ? "Partial"
        : String(invoice.status || "Pending").trim() || "Pending";
  const nowIso = new Date().toISOString();
  const wasAlreadyPaid = normalizeText(invoice.status) === "paid";

  const { error: invoiceUpdateError } = await supabase
    .from(table("invoices"))
    .update({
      amount_paid: appliedAmountPaid,
      status: nextStatus,
      updated_at: nowIso,
    })
    .eq("id", invoice.id);
  if (invoiceUpdateError) throw invoiceUpdateError;

  const linkedAdIds = await loadLinkedAdIds(supabase, invoice);
  if (linkedAdIds.length > 0 && nextStatus === "Paid") {
    const { error: adsUpdateError } = await supabase
      .from(table("ads"))
      .update({
        payment: "Paid",
        paid_via_invoice_id: invoice.id,
        updated_at: nowIso,
      })
      .in("id", linkedAdIds);
    if (adsUpdateError) throw adsUpdateError;
  }

  let notificationResult = null;
  if (nextStatus === "Paid" && !wasAlreadyPaid) {
    if (invoice.advertiser_id) {
      await recalculateAdvertiserSpend(invoice.advertiser_id);
    }

    const updatedInvoice = {
      ...invoice,
      amount_paid: appliedAmountPaid,
      status: nextStatus,
    };
    notificationResult = await sendPaymentReceivedNotifications({
      request,
      supabase,
      invoice: updatedInvoice,
    });
  }

  return {
    received: true,
    processed: true,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    status: nextStatus,
    amount_paid: appliedAmountPaid,
    transaction_ref: String(payload?.xRefNum || payload?.xrefnum || "").trim() || null,
    notifications: notificationResult,
  };
};
