import crypto from "node:crypto";
import { db, table, toNumber } from "../../utils/supabase-db.js";
import { recalculateAdvertiserSpend } from "../../utils/recalculate-advertiser-spend.js";
import { sendPaymentReceivedNotifications } from "../../utils/payment-received-notifications.js";

const SOLA_PAYMENTS_WEBHOOK_PIN = String(
  process.env.SOLA_PAYMENTS_WEBHOOK_PIN || process.env.SOLA_WEBHOOK_PIN || "",
).trim();

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const readWebhookAmount = (payload) => {
  const amount = toNumber(
    payload?.xAuthAmount ??
      payload?.xAmount ??
      payload?.xauthamount ??
      payload?.xamount,
    0,
  );
  return Math.max(0, amount);
};

const parseWebhookPayload = (rawBody) => {
  const params = new URLSearchParams(rawBody);
  const payload = {};

  for (const [key, value] of params.entries()) {
    if (!(key in payload)) {
      payload[key] = value;
    }
  }

  return payload;
};

const buildSignatureString = (rawBody) => {
  const params = new URLSearchParams(rawBody);
  const normalized = [];

  for (const [key, value] of params.entries()) {
    normalized.push([String(key || "").toLowerCase(), value]);
  }

  normalized.sort(([left], [right]) => left.localeCompare(right));
  return normalized.map(([, value]) => value).join("") + SOLA_PAYMENTS_WEBHOOK_PIN;
};

const hasValidSignature = (request, rawBody) => {
  if (!SOLA_PAYMENTS_WEBHOOK_PIN) {
    return true;
  }

  const provided = String(request.headers.get("ck-signature") || "").trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(provided)) {
    return false;
  }

  const expected = crypto
    .createHash("md5")
    .update(buildSignatureString(rawBody), "utf8")
    .digest("hex")
    .toLowerCase();

  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
};

const isApprovedPaymentEvent = (payload) => {
  const result = normalizeText(payload?.xResult || payload?.xresult);
  const responseResult = normalizeText(
    payload?.xResponseResult || payload?.xStatus || payload?.xresponseresult || payload?.xstatus,
  );
  const command = normalizeText(payload?.xCommand || payload?.xcommand);

  const approved = result === "a" || responseResult === "approved";
  if (!approved) {
    return false;
  }

  if (!command) {
    return true;
  }

  if (
    command.includes("save") ||
    command.includes("avsonly") ||
    command.includes("credit") ||
    command.includes("refund") ||
    command.includes("void") ||
    command.includes("reverse")
  ) {
    return false;
  }

  return true;
};

const findInvoice = async (supabase, payload) => {
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

export async function GET() {
  return Response.json({
    ok: true,
    provider: "sola",
  });
}

export async function POST(request) {
  try {
    const rawBody = await request.text();

    if (!hasValidSignature(request, rawBody)) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = parseWebhookPayload(rawBody);
    if (!isApprovedPaymentEvent(payload)) {
      return Response.json({
        received: true,
        processed: false,
        reason: "ignored_event",
      });
    }

    const supabase = db();
    const invoice = await findInvoice(supabase, payload);
    if (!invoice?.id) {
      return Response.json({
        received: true,
        processed: false,
        reason: "invoice_not_found",
      });
    }

    const invoiceTotal = Math.max(0, toNumber(invoice.total ?? invoice.amount, 0));
    const existingAmountPaid = Math.max(0, toNumber(invoice.amount_paid, 0));
    const webhookAmount = readWebhookAmount(payload);
    const nextAmountPaid = Math.max(existingAmountPaid, webhookAmount);
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
        amount_paid: Math.min(nextAmountPaid, invoiceTotal || nextAmountPaid),
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
        amount_paid: Math.min(nextAmountPaid, invoiceTotal || nextAmountPaid),
        status: nextStatus,
      };
      notificationResult = await sendPaymentReceivedNotifications({
        request,
        supabase,
        invoice: updatedInvoice,
      });
    }

    return Response.json({
      received: true,
      processed: true,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      status: nextStatus,
      amount_paid: Math.min(nextAmountPaid, invoiceTotal || nextAmountPaid),
      transaction_ref: String(payload?.xRefNum || payload?.xrefnum || "").trim() || null,
      notifications: notificationResult,
    });
  } catch (error) {
    console.error("[webhook/sola] Failed:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
