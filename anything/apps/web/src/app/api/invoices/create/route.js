import { db, toNumber } from "../../utils/supabase-db.js";
import { requirePermission } from "../../utils/auth-check.js";
import { createInvoiceAtomic, resolveInvoiceRequestKey } from "../../utils/invoice-atomic.js";
import {
  rebalanceInvoiceLineItemsToSubtotal,
  sumInvoiceItemAmounts,
} from "../../utils/invoice-helpers.js";
import { recalculateAdvertiserSpend } from "../../utils/recalculate-advertiser-spend.js";
import {
  invoicePaymentProviderRequiresNote,
  invoicePaymentProviderRequiresReference,
  normalizeInvoicePaymentProvider,
} from "../../../../lib/invoicePayment.js";
import { getTodayInAppTimeZone } from "../../../../lib/timezone.js";

const firstPresentMoneyValue = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "string" && value.trim() === "") {
      continue;
    }
    return value;
  }
  return undefined;
};

const validateInvoiceSettlement = ({
  status,
  total,
  amountPaid,
  paymentProvider,
  paymentReference,
  paymentNote,
}) => {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedProvider = normalizeInvoicePaymentProvider(paymentProvider);
  const normalizedReference = String(paymentReference || "").trim();
  const normalizedNote = String(paymentNote || "").trim();

  if (normalizedStatus !== "paid" && normalizedStatus !== "partial") {
    if (toNumber(amountPaid, 0) > 0) {
      return "Pending or overdue invoices cannot carry a paid amount.";
    }
    if (normalizedProvider || normalizedReference || normalizedNote) {
      return "Payment provider details can only be saved on paid or partial invoices.";
    }
    return null;
  }

  if (!normalizedProvider) {
    return "Paid or partial invoices require a payment provider.";
  }
  if (
    invoicePaymentProviderRequiresReference(normalizedProvider) &&
    !normalizedReference
  ) {
    return "This payment provider requires a transaction or reference number.";
  }
  if (invoicePaymentProviderRequiresNote(normalizedProvider) && !normalizedNote) {
    return "Other payment methods require a payment note.";
  }
  if (
    normalizedStatus === "paid" &&
    Math.abs(toNumber(amountPaid, 0) - toNumber(total, 0)) > 0.009
  ) {
    return "Paid invoices must have amount paid equal to the invoice total.";
  }
  if (normalizedStatus === "partial") {
    const normalizedAmountPaid = toNumber(amountPaid, 0);
    const normalizedTotal = toNumber(total, 0);
    if (!(normalizedAmountPaid > 0 && normalizedAmountPaid < normalizedTotal)) {
      return "Partial invoices require an amount paid greater than 0 and less than the invoice total.";
    }
  }

  return null;
};

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
      amount,
      amount_paid,
      paid_date,
      payment_provider,
      payment_reference,
      payment_note,
      apply_credits = false,
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

    const nowIso = new Date().toISOString();
    const normalizedStatus = String(status || "Pending").trim() || "Pending";
    const normalizedDiscount = toNumber(discount, 0);
    const normalizedTax = toNumber(tax, 0);
    const linkedAdIds = [
      ...new Set(
        items
          .map((item) => String(item?.ad_id || "").trim())
          .filter(Boolean),
      ),
    ];
    const requestKey = resolveInvoiceRequestKey({
      request,
      bodyKey: body?.idempotency_key,
      scope: "invoice-create",
    });

    let invoiceItemsPayload = items.map((item) => {
      const quantity = toNumber(item.quantity, 1) || 1;
      const unitPrice = toNumber(item.unit_price, 0);
      const amount = toNumber(item.amount, quantity * unitPrice);
      return {
        ad_id: item.ad_id || null,
        product_id: item.product_id || null,
        description: item.description || "",
        quantity,
        unit_price: unitPrice,
        amount,
        created_at: nowIso,
      };
    });

    const explicitTotal = Number(firstPresentMoneyValue(body?.total, amount));
    if (invoiceItemsPayload.length > 0 && Number.isFinite(explicitTotal) && explicitTotal > 0) {
      const currentSubtotal = sumInvoiceItemAmounts(invoiceItemsPayload);
      const currentTotal = currentSubtotal - normalizedDiscount + normalizedTax;
      const targetSubtotal = Math.max(0, explicitTotal + normalizedDiscount - normalizedTax);

      if (currentSubtotal <= 0 || Math.abs(currentTotal - explicitTotal) > 0.009) {
        invoiceItemsPayload = rebalanceInvoiceLineItemsToSubtotal(
          invoiceItemsPayload,
          targetSubtotal,
        );
      }
    }

    const subtotal = sumInvoiceItemAmounts(invoiceItemsPayload);
    const total = subtotal - normalizedDiscount + normalizedTax;
    const normalizedPaymentProvider = normalizeInvoicePaymentProvider(payment_provider);
    const normalizedAmountPaid =
      String(normalizedStatus).toLowerCase() === "paid"
        ? total
        : String(normalizedStatus).toLowerCase() === "partial"
          ? toNumber(amount_paid, 0)
          : 0;
    const settlementValidationError = validateInvoiceSettlement({
      status: normalizedStatus,
      total,
      amountPaid: normalizedAmountPaid,
      paymentProvider: normalizedPaymentProvider,
      paymentReference: payment_reference,
      paymentNote: payment_note,
    });
    if (settlementValidationError) {
      return Response.json({ error: settlementValidationError }, { status: 400 });
    }

    const invoiceResult = await createInvoiceAtomic({
      supabase,
      invoice: {
        advertiser_id: advertiser_id || null,
        advertiser_name,
        ad_ids: linkedAdIds,
        contact_name: contact_name || null,
        contact_email: contact_email || null,
        bill_to: bill_to || advertiser_name,
        issue_date: issue_date || getTodayInAppTimeZone(),
        status: normalizedStatus,
        discount: normalizedDiscount,
        tax: normalizedTax,
        total,
        amount: total,
        amount_paid: normalizedAmountPaid,
        paid_date:
          String(normalizedStatus).toLowerCase() === "paid" ||
          String(normalizedStatus).toLowerCase() === "partial"
            ? paid_date || getTodayInAppTimeZone()
            : null,
        payment_provider: normalizedPaymentProvider || null,
        payment_reference: String(payment_reference || "").trim() || null,
        payment_note: String(payment_note || "").trim() || null,
        notes: notes || null,
        source_request_key: requestKey,
        created_at: nowIso,
        updated_at: nowIso,
      },
      items: invoiceItemsPayload,
      adIds: linkedAdIds,
      updateAdsPayment: String(normalizedStatus).toLowerCase() === "paid" ? "Paid" : "Pending",
      applyCredits: apply_credits === true,
      actorUserId: auth.user.id,
      creditNote: "Prepaid credits applied automatically during invoice creation.",
    });

    const invoice = invoiceResult.invoice;
    if (
      (String(normalizedStatus).toLowerCase() === "paid" || invoiceResult.appliedCredits) &&
      (invoice?.advertiser_id || advertiser_id)
    ) {
      await recalculateAdvertiserSpend(invoice?.advertiser_id || advertiser_id);
    }

    return Response.json(
      {
        invoice,
        credits_applied: invoiceResult.appliedCredits === true,
        credit_notice_type: invoiceResult.appliedCredits ? "covered_by_credits" : "none",
      },
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
