import { db, toNumber } from "../../utils/supabase-db.js";
import { requirePermission } from "../../utils/auth-check.js";
import { createInvoiceAtomic, resolveInvoiceRequestKey } from "../../utils/invoice-atomic.js";
import {
  rebalanceInvoiceLineItemsToSubtotal,
  sumInvoiceItemAmounts,
} from "../../utils/invoice-helpers.js";
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
      amount,
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

    const explicitTotal = Number(body?.total ?? amount);
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
        amount_paid: String(normalizedStatus).toLowerCase() === "paid" ? total : 0,
        notes: notes || null,
        source_request_key: requestKey,
        created_at: nowIso,
        updated_at: nowIso,
      },
      items: invoiceItemsPayload,
      adIds: linkedAdIds,
      updateAdsPayment: String(normalizedStatus).toLowerCase() === "paid" ? "Paid" : "Pending",
      applyCredits: String(normalizedStatus).toLowerCase() === "pending",
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
