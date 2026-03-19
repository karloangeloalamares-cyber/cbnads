import { db, table, toNumber } from "../utils/supabase-db.js";
import {
  getRequestStatusForError,
  isAdvertiserUser,
  matchesAdvertiserScope,
  requireAuth,
  requirePermission,
  resolveAdvertiserScope,
} from "../utils/auth-check.js";
import { recalculateAdvertiserSpend } from "../utils/recalculate-advertiser-spend.js";
import {
  rebalanceInvoiceLineItemsToSubtotal,
  sumInvoiceItemAmounts,
} from "../utils/invoice-helpers.js";
import { resolveInvoiceRequestKey } from "../utils/invoice-atomic.js";
import { isCreditRuleViolation } from "../utils/prepaid-credits.js";
import {
  formatGuardrailFieldList,
  getCreditInvoiceRestrictedChanges,
  getInvoiceMutationGuardrail,
  getReconciliationInvoiceRestrictedChanges,
  getSolaSettledInvoiceRestrictedChanges,
  getSettledInvoiceRestrictedChanges,
  hasInvoiceRecordedPayment,
  isSolaSettledInvoice,
  isInvoiceReconciliationRequired,
  isCreditInvoiceRecord,
  normalizeFinancialChangeReason,
} from "../utils/invoice-guardrails.js";
import {
  invoicePaymentProviderRequiresNote,
  invoicePaymentProviderRequiresReference,
  normalizeInvoicePaymentProvider,
} from "../../../lib/invoicePayment.js";
import { can } from "../../../lib/permissions.js";
import { getTodayInAppTimeZone } from "../../../lib/timezone.js";

const computeInvoiceStatus = (invoiceTotal, amountPaid, currentStatus) => {
  if (String(currentStatus || "").toLowerCase() === "paid") return "Paid";
  if (amountPaid >= invoiceTotal && invoiceTotal > 0) return "Paid";
  if (amountPaid > 0) return "Partial";
  return "Pending";
};

const isInvoiceNotFoundError = (error) =>
  /invoice_not_found|invoice not found/i.test(String(error?.message || ""));

const isInvoiceAlreadyDeletedError = (error) =>
  /invoice_already_deleted|invoice already deleted/i.test(String(error?.message || ""));

const isInvoiceDeletedError = (error) =>
  /invoice_deleted|invoice deleted/i.test(String(error?.message || ""));

const isCreditInvoiceError = (error) =>
  /invoice_not_credit_record|invoice_total_must_be_positive|credit_invoice_amount_missing/i.test(
    String(error?.message || ""),
  );

const validateInvoiceSettlement = ({
  status,
  total,
  amountPaid,
  paidViaCredits,
  paymentProvider,
  paymentReference,
  paymentNote,
}) => {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedProvider = normalizeInvoicePaymentProvider(paymentProvider);
  const normalizedReference = String(paymentReference || "").trim();
  const normalizedNote = String(paymentNote || "").trim();
  const settled = normalizedStatus === "paid" || normalizedStatus === "partial";

  if (paidViaCredits) {
    if (normalizedProvider || normalizedReference || normalizedNote) {
      return "Credit-paid invoices cannot store an external payment provider or reference.";
    }
    return null;
  }

  if (!settled) {
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

  if (normalizedStatus === "paid" && Math.abs(toNumber(amountPaid, 0) - toNumber(total, 0)) > 0.009) {
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

const isInsufficientCreditsError = (error) =>
  /insufficient credits/i.test(String(error?.message || ""));

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return Response.json(
        { error: auth.error },
        { status: auth.status || getRequestStatusForError(auth.error) },
      );
    }

    if (!isAdvertiserUser(auth.user) && !can(auth.user.role, "billing:view")) {
      return Response.json({ error: "Unauthorized - Billing access required" }, { status: 403 });
    }

    const supabase = db();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const advertiser_id = searchParams.get("advertiser_id");
    const invoiceId = searchParams.get("id");
    const advertiserScope = isAdvertiserUser(auth.user)
      ? await resolveAdvertiserScope(auth.user)
      : null;

    if (invoiceId) {
      const { data: invoice, error: invoiceError } = await supabase
        .from(table("invoices"))
        .select("*")
        .eq("id", invoiceId)
        .is("deleted_at", null)
        .maybeSingle();
      if (invoiceError) throw invoiceError;
      if (!invoice) {
        return Response.json({ error: "Invoice not found" }, { status: 404 });
      }

      if (advertiserScope && !matchesAdvertiserScope(invoice, advertiserScope)) {
        return Response.json({ error: "Invoice not found" }, { status: 404 });
      }

      const { data: items, error: itemsError } = await supabase
        .from(table("invoice_items"))
        .select("id, invoice_id, ad_id, product_id, description, quantity, unit_price, amount")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true });
      if (itemsError) throw itemsError;

      return Response.json({ invoice: { ...invoice, items: items || [] } });
    }

    let query = supabase
      .from(table("invoices"))
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (status && status !== "All") {
      query = query.eq("status", status);
    }
    if (!advertiserScope && advertiser_id) {
      query = query.eq("advertiser_id", advertiser_id);
    }

    const { data: invoices, error: invoicesError } = await query;
    if (invoicesError) throw invoicesError;

    const authorizedInvoices = advertiserScope
      ? (invoices || []).filter((invoice) => matchesAdvertiserScope(invoice, advertiserScope))
      : invoices || [];
    let filtered = [...authorizedInvoices];
    if (search) {
      const needle = String(search).toLowerCase();
      filtered = filtered.filter((invoice) => {
        const invoiceNumber = String(invoice.invoice_number || "").toLowerCase();
        const advertiserName = String(invoice.advertiser_name || "").toLowerCase();
        return invoiceNumber.includes(needle) || advertiserName.includes(needle);
      });
    }

    const ids = filtered.map((invoice) => invoice.id);
    let itemRows = [];
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from(table("invoice_items"))
        .select("id, invoice_id, ad_id, product_id, description, quantity, unit_price, amount")
        .in("invoice_id", ids)
        .order("created_at", { ascending: true });
      if (error) throw error;
      itemRows = data || [];
    }

    const itemsByInvoice = new Map();
    for (const row of itemRows) {
      const list = itemsByInvoice.get(row.invoice_id) || [];
      list.push(row);
      itemsByInvoice.set(row.invoice_id, list);
    }

    const result = filtered.map((invoice) => ({
      ...invoice,
      items: itemsByInvoice.get(invoice.id) || [],
    }));

    const summary = authorizedInvoices.reduce(
      (accumulator, invoice) => {
        const statusValue = String(invoice.status || "").trim().toLowerCase();
        const total = toNumber(invoice.total ?? invoice.amount, 0);
        const amountPaid = toNumber(invoice.amount_paid, statusValue === "paid" ? total : 0);
        const outstanding = Math.max(total - amountPaid, 0);

        if (statusValue === "paid") {
          accumulator.collected += amountPaid || total;
        } else if (statusValue === "partial") {
          accumulator.collected += amountPaid;
          accumulator.outstanding += outstanding;
        } else if (statusValue === "overdue") {
          accumulator.outstanding += outstanding || total;
          accumulator.overdueCount += 1;
        } else {
          accumulator.outstanding += outstanding || total;
        }

        return accumulator;
      },
      { outstanding: 0, collected: 0, overdueCount: 0 },
    );

    return Response.json({ invoices: result, summary });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return Response.json(
      { error: "Failed to fetch invoices" },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  try {
    const auth = await requirePermission("billing:edit", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const supabase = db();
    const body = await request.json();
    const { id } = body;
    const changeReason = normalizeFinancialChangeReason(
      body?.change_reason || body?.changeReason,
    );

    if (!id) {
      return Response.json(
        { error: "Invoice ID is required" },
        { status: 400 },
      );
    }
    if (!changeReason) {
      return Response.json({ error: "A change reason is required" }, { status: 400 });
    }

    const {
      advertiser_id,
      advertiser_name,
      contact_name,
      contact_email,
      bill_to,
      issue_date,
      status,
      discount,
      tax,
      notes,
      items,
      amount_paid,
      amount,
      total,
      paid_date,
      payment_provider,
      payment_reference,
      payment_note,
    } = body;

    const { data: currentInvoice, error: currentInvoiceError } = await supabase
      .from(table("invoices"))
      .select(
        "id, invoice_number, advertiser_id, advertiser_name, status, total, amount, amount_paid, discount, tax, paid_via_credits, deleted_at, notes, issue_date, contact_name, contact_email, bill_to, ad_ids, paid_date, payment_provider, payment_reference, payment_note",
      )
      .eq("id", id)
      .maybeSingle();
    if (currentInvoiceError) throw currentInvoiceError;
    if (!currentInvoice) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (currentInvoice.deleted_at) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }

    const requestKey = resolveInvoiceRequestKey({
      request,
      bodyKey: body?.idempotency_key || body?.idempotencyKey,
      scope: `invoice-update:${id}`,
    });
    const { data: existingItems, error: existingItemsError } = await supabase
      .from(table("invoice_items"))
      .select("ad_id, product_id, description, quantity, unit_price, amount")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true });
    if (existingItemsError) throw existingItemsError;

    const currentInvoiceWithItems = {
      ...currentInvoice,
      items: existingItems || [],
    };

    const reconciliationRequired = isInvoiceReconciliationRequired(currentInvoiceWithItems);

    if (isCreditInvoiceRecord(currentInvoice)) {
      const restrictedChanges = getCreditInvoiceRestrictedChanges(currentInvoiceWithItems, body);
      if (restrictedChanges.length > 0) {
        return Response.json(
          {
            error: `Credit records cannot change these fields: ${formatGuardrailFieldList(
              restrictedChanges,
            )}.`,
          },
          { status: 400 },
        );
      }

      const nextCreditTotal = toNumber(total ?? amount ?? currentInvoice.total ?? currentInvoice.amount, 0);
      const { error: creditUpdateError } = await supabase.rpc(
        "cbnads_web_update_credit_invoice_atomic",
        {
          p_invoice_id: id,
          p_total: nextCreditTotal,
          p_note: notes !== undefined ? notes : null,
          p_issue_date:
            issue_date !== undefined
              ? issue_date || currentInvoice.issue_date || getTodayInAppTimeZone()
              : null,
          p_contact_name: contact_name !== undefined ? contact_name : null,
          p_contact_email: contact_email !== undefined ? contact_email : null,
          p_bill_to: bill_to !== undefined ? bill_to : null,
          p_created_by: auth.user?.id || null,
          p_change_reason: changeReason,
          p_source_request_key: requestKey,
        },
      );
      if (creditUpdateError) {
        if (isCreditRuleViolation(creditUpdateError) || isCreditInvoiceError(creditUpdateError)) {
          return Response.json({ error: creditUpdateError.message }, { status: 400 });
        }
        throw creditUpdateError;
      }

      if (currentInvoice.advertiser_id) {
        await recalculateAdvertiserSpend(currentInvoice.advertiser_id);
      }

      const { data: updatedInvoice, error: updatedInvoiceError } = await supabase
        .from(table("invoices"))
        .select("*")
        .eq("id", id)
        .single();
      if (updatedInvoiceError) throw updatedInvoiceError;

      const { data: updatedItems, error: updatedItemsError } = await supabase
        .from(table("invoice_items"))
        .select("*")
        .eq("invoice_id", id)
        .order("created_at", { ascending: true });
      if (updatedItemsError) throw updatedItemsError;

      return Response.json({
        invoice: { ...updatedInvoice, items: updatedItems || [] },
      });
    }

    if (hasInvoiceRecordedPayment(currentInvoice)) {
      const restrictedChanges = reconciliationRequired
        ? getReconciliationInvoiceRestrictedChanges(currentInvoiceWithItems, body)
        : currentInvoiceWithItems.paid_via_credits === true
          ? getSolaSettledInvoiceRestrictedChanges(currentInvoiceWithItems, body)
        : isSolaSettledInvoice(currentInvoiceWithItems)
          ? getSolaSettledInvoiceRestrictedChanges(currentInvoiceWithItems, body)
          : getSettledInvoiceRestrictedChanges(currentInvoiceWithItems, body);
      if (restrictedChanges.length > 0) {
        return Response.json(
          {
            error: reconciliationRequired
              ? `Reconciliation repairs cannot change these fields: ${formatGuardrailFieldList(
                  restrictedChanges,
                )}.`
              : currentInvoiceWithItems.paid_via_credits === true
                ? `Credit-paid invoices only allow non-financial metadata edits. Locked fields: ${formatGuardrailFieldList(
                    restrictedChanges,
                  )}.`
              : isSolaSettledInvoice(currentInvoiceWithItems)
                ? `Sola-settled invoices only allow non-financial metadata edits. Locked fields: ${formatGuardrailFieldList(
                    restrictedChanges,
                  )}.`
              : `Settled invoices only allow metadata edits. Locked fields: ${formatGuardrailFieldList(
                  restrictedChanges,
                )}.`,
          },
          { status: 400 },
        );
      }
    }

    const normalizedDiscount =
      discount !== undefined ? toNumber(discount, 0) : toNumber(currentInvoice.discount, 0);
    const normalizedTax =
      tax !== undefined ? toNumber(tax, 0) : toNumber(currentInvoice.tax, 0);

    const nextAmountPaid =
      amount_paid !== undefined ? toNumber(amount_paid, 0) : toNumber(currentInvoice.amount_paid, 0);
    const nextPaymentProvider = normalizeInvoicePaymentProvider(
      payment_provider !== undefined ? payment_provider : currentInvoice.payment_provider,
    );
    const nextPaymentReference =
      payment_reference !== undefined
        ? String(payment_reference || "").trim()
        : String(currentInvoice.payment_reference || "").trim();
    const nextPaymentNote =
      payment_note !== undefined
        ? String(payment_note || "").trim()
        : String(currentInvoice.payment_note || "").trim();

    let normalizedItems = Array.isArray(items)
      ? items.map((item) => {
          const quantity = toNumber(item?.quantity, 1) || 1;
          const unitPrice = toNumber(item?.unit_price, 0);
          const amount = toNumber(item?.amount, quantity * unitPrice);
          return {
            ad_id: item?.ad_id || null,
            product_id: item?.product_id || null,
            description: item?.description || "",
            quantity,
            unit_price: unitPrice,
            amount,
          };
        })
      : [];

    let computedTotal = toNumber(currentInvoice.total, 0);
    const explicitTotal = Number(total ?? amount);
    if (normalizedItems.length > 0) {
      const currentSubtotal = sumInvoiceItemAmounts(normalizedItems);
      const currentTotal = currentSubtotal - normalizedDiscount + normalizedTax;
      const targetSubtotal =
        Number.isFinite(explicitTotal) && explicitTotal > 0
          ? Math.max(0, explicitTotal + normalizedDiscount - normalizedTax)
          : currentSubtotal;

      if (
        Number.isFinite(explicitTotal) &&
        explicitTotal > 0 &&
        (currentSubtotal <= 0 || Math.abs(currentTotal - explicitTotal) > 0.009)
      ) {
        normalizedItems = rebalanceInvoiceLineItemsToSubtotal(normalizedItems, targetSubtotal);
      }

      computedTotal =
        sumInvoiceItemAmounts(normalizedItems) - normalizedDiscount + normalizedTax;
    }

    const nextStatus =
      status !== undefined
        ? status
        : computeInvoiceStatus(computedTotal, nextAmountPaid, currentInvoice.status);
    const settlementValidationError = validateInvoiceSettlement({
      status: nextStatus,
      total: computedTotal,
      amountPaid: nextAmountPaid,
      paidViaCredits: Boolean(currentInvoice.paid_via_credits),
      paymentProvider: nextPaymentProvider,
      paymentReference: nextPaymentReference,
      paymentNote: nextPaymentNote,
    });
    if (settlementValidationError) {
      return Response.json({ error: settlementValidationError }, { status: 400 });
    }
    const nextNormalizedStatus = String(nextStatus || "").trim().toLowerCase();
    const nextPaidDate =
      nextNormalizedStatus === "paid" || nextNormalizedStatus === "partial"
        ? paid_date || currentInvoice.paid_date || getTodayInAppTimeZone()
        : null;

    const patch = {
      updated_at: new Date().toISOString(),
      total: computedTotal,
      amount: computedTotal,
      amount_paid: nextAmountPaid,
      status: nextStatus,
      paid_date: nextPaidDate,
      payment_provider: nextPaymentProvider || null,
      payment_reference: nextPaymentReference || null,
      payment_note: nextPaymentNote || null,
    };
    if (issue_date !== undefined) {
      patch.issue_date = issue_date || getTodayInAppTimeZone();
    }
    if (advertiser_id !== undefined) patch.advertiser_id = advertiser_id || null;
    if (advertiser_name !== undefined) patch.advertiser_name = advertiser_name;
    if (contact_name !== undefined) patch.contact_name = contact_name;
    if (contact_email !== undefined) patch.contact_email = contact_email;
    if (bill_to !== undefined) patch.bill_to = bill_to;
    if (discount !== undefined) patch.discount = normalizedDiscount;
    if (tax !== undefined) patch.tax = normalizedTax;
    if (notes !== undefined) patch.notes = notes;

    const { data: updateResultRows, error: updateResultError } = await supabase.rpc(
      "cbnads_web_update_invoice_atomic",
      {
        p_invoice_id: id,
        p_patch: patch,
        p_items: normalizedItems,
        p_replace_items: Array.isArray(items),
      },
    );
    if (updateResultError) throw updateResultError;

    const updateResult = Array.isArray(updateResultRows)
      ? updateResultRows[0] || null
      : updateResultRows;

    const oldAdvertiserId = updateResult?.old_advertiser_id || currentInvoice.advertiser_id;
    const newAdvertiserId =
      updateResult?.new_advertiser_id ||
      (advertiser_id !== undefined ? advertiser_id : oldAdvertiserId);
    if (newAdvertiserId) {
      await recalculateAdvertiserSpend(newAdvertiserId);
    }
    if (oldAdvertiserId && oldAdvertiserId !== newAdvertiserId) {
      await recalculateAdvertiserSpend(oldAdvertiserId);
    }

    const { data: updatedInvoice, error: updatedInvoiceError } = await supabase
      .from(table("invoices"))
      .select("*")
      .eq("id", id)
      .single();
    if (updatedInvoiceError) throw updatedInvoiceError;

    const { data: updatedItems, error: updatedItemsError } = await supabase
      .from(table("invoice_items"))
      .select("*")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true });
    if (updatedItemsError) throw updatedItemsError;

    return Response.json({
      invoice: { ...updatedInvoice, items: updatedItems || [] },
    });
  } catch (error) {
    if (isInvoiceNotFoundError(error)) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (isInvoiceDeletedError(error)) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (isCreditRuleViolation(error) || isCreditInvoiceError(error)) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Failed to update invoice" },
        { status: 400 },
      );
    }

    console.error("Error updating invoice:", error);
    return Response.json(
      { error: "Failed to update invoice" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const auth = await requirePermission("billing:delete", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const supabase = db();
    const { searchParams } = new URL(request.url);
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const id = String(body?.id || searchParams.get("id") || "").trim();
    const deleteReason = normalizeFinancialChangeReason(
      body?.delete_reason || body?.deleteReason,
    );

    if (!id) {
      return Response.json(
        { error: "Invoice ID is required" },
        { status: 400 },
      );
    }
    if (!deleteReason) {
      return Response.json({ error: "A delete reason is required" }, { status: 400 });
    }

    const { data: currentInvoice, error: currentInvoiceError } = await supabase
      .from(table("invoices"))
      .select(
        "id, invoice_number, advertiser_id, status, total, amount, amount_paid, paid_via_credits, deleted_at, ad_ids",
      )
      .eq("id", id)
      .maybeSingle();
    if (currentInvoiceError) throw currentInvoiceError;
    if (!currentInvoice || currentInvoice.deleted_at) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }

    const { data: existingItems, error: existingItemsError } = await supabase
      .from(table("invoice_items"))
      .select("ad_id, product_id, description, quantity, unit_price, amount")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true });
    if (existingItemsError) throw existingItemsError;

    const currentInvoiceWithItems = {
      ...currentInvoice,
      items: existingItems || [],
    };
    const guardrail = getInvoiceMutationGuardrail(currentInvoiceWithItems);

    const requestKey = resolveInvoiceRequestKey({
      request,
      bodyKey: body?.idempotency_key || body?.idempotencyKey,
      scope: `invoice-delete:${id}`,
    });

    let deleteResult = null;
    if (guardrail.action === "reconcile_required") {
      return Response.json({ error: guardrail.message }, { status: 409 });
    }

    if (guardrail.action === "blocked_external_settlement") {
      return Response.json({ error: guardrail.message }, { status: 400 });
    }

    if (guardrail.action === "reverse_credit_record") {
      const { data: deleteResultRows, error: deleteError } = await supabase.rpc(
        "cbnads_web_delete_credit_invoice_atomic",
        {
          p_invoice_id: id,
          p_created_by: auth.user?.id || null,
          p_change_reason: deleteReason,
          p_source_request_key: requestKey,
        },
      );
      if (deleteError) {
        if (isInsufficientCreditsError(deleteError)) {
          return Response.json(
            {
              error:
                "This credit record cannot be deleted because some of its credits have already been used.",
            },
            { status: 400 },
          );
        }
        if (isCreditRuleViolation(deleteError) || isCreditInvoiceError(deleteError)) {
          return Response.json({ error: deleteError.message }, { status: 400 });
        }
        throw deleteError;
      }

      deleteResult = Array.isArray(deleteResultRows)
        ? deleteResultRows[0] || null
        : deleteResultRows;
    } else {
      const { data: deleteResultRows, error: deleteError } = await supabase.rpc(
        "cbnads_web_soft_delete_invoice_atomic",
        {
          p_invoice_id: id,
          p_created_by: auth.user?.id || null,
        },
      );
      if (deleteError) throw deleteError;

      deleteResult = Array.isArray(deleteResultRows)
        ? deleteResultRows[0] || null
        : deleteResultRows;
    }

    if (deleteResult?.advertiser_id) {
      await recalculateAdvertiserSpend(deleteResult.advertiser_id);
    }

    return Response.json({
      success: true,
      action: guardrail.action,
      refunded_credits: deleteResult?.refunded_credits ?? deleteResult?.reversed_amount ?? 0,
      had_credit_refund:
        deleteResult?.had_credit_refund === true ||
        toNumber(deleteResult?.reversed_amount, 0) > 0,
    });
  } catch (error) {
    if (isInvoiceNotFoundError(error)) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (isInvoiceDeletedError(error)) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (isInvoiceAlreadyDeletedError(error)) {
      return Response.json({ error: "Invoice already deleted" }, { status: 409 });
    }
    if (isCreditRuleViolation(error) || isCreditInvoiceError(error)) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Failed to delete invoice" },
        { status: 400 },
      );
    }

    console.error("Error deleting invoice:", error);
    return Response.json(
      { error: "Failed to delete invoice" },
      { status: 500 },
    );
  }
}
