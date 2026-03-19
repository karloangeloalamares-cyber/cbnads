import { toNumber } from "./supabase-db.js";
import { isSolaInvoicePaymentProvider } from "../../../lib/invoicePayment.js";

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const normalizeMoney = (value) => Math.round(toNumber(value, 0) * 100) / 100;

const valueChanged = (nextValue, currentValue, normalize = (value) => value) => {
  if (nextValue === undefined) {
    return false;
  }
  return normalize(nextValue) !== normalize(currentValue);
};

const arrayChanged = (nextValue, currentValue) => {
  if (!Array.isArray(nextValue)) {
    return false;
  }
  return JSON.stringify(nextValue) !== JSON.stringify(Array.isArray(currentValue) ? currentValue : []);
};

export const normalizeFinancialChangeReason = (value) => String(value || "").trim();

export const isCreditInvoiceRecord = (invoice) =>
  String(invoice?.invoice_number || "").trim().toUpperCase().startsWith("CRE-");

export const getInvoiceAssociationSummary = (invoice) => {
  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  const linkedAdIds = new Set();

  for (const adId of Array.isArray(invoice?.ad_ids) ? invoice.ad_ids : []) {
    const normalizedAdId = String(adId || "").trim();
    if (normalizedAdId) {
      linkedAdIds.add(normalizedAdId);
    }
  }

  for (const item of items) {
    const normalizedAdId = String(item?.ad_id || "").trim();
    if (normalizedAdId) {
      linkedAdIds.add(normalizedAdId);
    }
  }

  return {
    itemCount: items.length,
    linkedAdCount: linkedAdIds.size,
  };
};

export const hasInvoiceRecordedPayment = (invoice) => {
  const status = normalizeText(invoice?.status);
  const amountPaid = normalizeMoney(invoice?.amount_paid);
  return (
    Boolean(invoice?.paid_via_credits) ||
    amountPaid > 0 ||
    status === "paid" ||
    status === "partial"
  );
};

export const hasExternalInvoiceSettlement = (invoice) => {
  const status = normalizeText(invoice?.status);
  const amountPaid = normalizeMoney(invoice?.amount_paid);
  return !Boolean(invoice?.paid_via_credits) && (amountPaid > 0 || status === "paid" || status === "partial");
};

export const isSolaSettledInvoice = (invoice) =>
  hasExternalInvoiceSettlement(invoice) && isSolaInvoicePaymentProvider(invoice?.payment_provider);

export const getInvoiceMutationGuardrail = (invoice) => {
  const total = normalizeMoney(invoice?.total ?? invoice?.amount);
  const amountPaid = normalizeMoney(invoice?.amount_paid);
  const status = normalizeText(invoice?.status);
  const paidViaCredits = Boolean(invoice?.paid_via_credits);
  const { itemCount, linkedAdCount } = getInvoiceAssociationSummary(invoice);
  const hasBillingLinks = itemCount > 0 || linkedAdCount > 0;

  if (isCreditInvoiceRecord(invoice)) {
    return {
      action: "reverse_credit_record",
      itemCount,
      linkedAdCount,
      total,
      amountPaid,
      message: "Credit records must be reversed, not deleted outright.",
    };
  }

  if (
    paidViaCredits &&
    (
      total <= 0 ||
      amountPaid <= 0 ||
      Math.abs(total - amountPaid) > 0.009 ||
      status !== "paid" ||
      !hasBillingLinks
    )
  ) {
    return {
      action: "reconcile_required",
      itemCount,
      linkedAdCount,
      total,
      amountPaid,
      message:
        "This invoice is inconsistent. Reconcile its totals and billing links before editing or deleting it.",
    };
  }

  if (paidViaCredits) {
    return {
      action: "reverse_credit_payment",
      itemCount,
      linkedAdCount,
      total,
      amountPaid,
      message: "Deleting this invoice will restore prepaid credits to the advertiser.",
    };
  }

  if (hasExternalInvoiceSettlement(invoice)) {
    return {
      action: "blocked_external_settlement",
      itemCount,
      linkedAdCount,
      total,
      amountPaid,
      message: "Paid or partially paid invoices cannot be deleted. Void or reissue the invoice instead.",
    };
  }

  return {
    action: "safe_delete",
    itemCount,
    linkedAdCount,
    total,
    amountPaid,
    message: "This invoice can be deleted.",
  };
};

export const isInvoiceReconciliationRequired = (invoice) =>
  getInvoiceMutationGuardrail(invoice).action === "reconcile_required";

export const getSettledInvoiceRestrictedChanges = (currentInvoice, body = {}) => {
  const violations = [];

  if (arrayChanged(body.items, currentInvoice?.items)) {
    violations.push("line items");
  }
  if (arrayChanged(body.ad_ids, currentInvoice?.ad_ids)) {
    violations.push("linked ads");
  }
  if (
    valueChanged(body.advertiser_id, currentInvoice?.advertiser_id, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("advertiser");
  }
  if (
    valueChanged(body.advertiser_name, currentInvoice?.advertiser_name, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("advertiser name");
  }
  if (valueChanged(body.discount, currentInvoice?.discount, normalizeMoney)) {
    violations.push("discount");
  }
  if (valueChanged(body.tax, currentInvoice?.tax, normalizeMoney)) {
    violations.push("tax");
  }
  if (
    body.amount !== undefined ||
    body.total !== undefined ||
    valueChanged(body.amount_paid, currentInvoice?.amount_paid, normalizeMoney)
  ) {
    const currentTotal = normalizeMoney(currentInvoice?.total ?? currentInvoice?.amount);
    const nextTotal =
      body.total !== undefined
        ? normalizeMoney(body.total)
        : body.amount !== undefined
          ? normalizeMoney(body.amount)
          : currentTotal;

    if (nextTotal !== currentTotal) {
      violations.push("total amount");
    }
  }

  return violations;
};

export const getSolaSettledInvoiceRestrictedChanges = (currentInvoice, body = {}) => {
  const violations = getSettledInvoiceRestrictedChanges(currentInvoice, body);

  if (valueChanged(body.status, currentInvoice?.status, normalizeText)) {
    violations.push("status");
  }
  if (valueChanged(body.amount_paid, currentInvoice?.amount_paid, normalizeMoney)) {
    violations.push("amount paid");
  }
  if (
    valueChanged(body.payment_provider, currentInvoice?.payment_provider, (value) =>
      String(value || "").trim().toLowerCase(),
    )
  ) {
    violations.push("payment provider");
  }
  if (
    valueChanged(body.payment_reference, currentInvoice?.payment_reference, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("payment reference");
  }
  if (
    valueChanged(body.payment_note, currentInvoice?.payment_note, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("payment note");
  }
  if (
    valueChanged(body.paid_date, currentInvoice?.paid_date, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("paid date");
  }

  return violations;
};

export const getReconciliationInvoiceRestrictedChanges = (currentInvoice, body = {}) => {
  const violations = [];

  if (
    valueChanged(body.advertiser_id, currentInvoice?.advertiser_id, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("advertiser");
  }
  if (
    valueChanged(body.advertiser_name, currentInvoice?.advertiser_name, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("advertiser name");
  }
  if (valueChanged(body.status, currentInvoice?.status, normalizeText)) {
    violations.push("status");
  }
  if (valueChanged(body.amount_paid, currentInvoice?.amount_paid, normalizeMoney)) {
    violations.push("amount paid");
  }
  if (
    valueChanged(body.payment_provider, currentInvoice?.payment_provider, (value) =>
      String(value || "").trim().toLowerCase(),
    )
  ) {
    violations.push("payment provider");
  }
  if (
    valueChanged(body.payment_reference, currentInvoice?.payment_reference, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("payment reference");
  }
  if (
    valueChanged(body.payment_note, currentInvoice?.payment_note, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("payment note");
  }

  return violations;
};

export const getCreditInvoiceRestrictedChanges = (currentInvoice, body = {}) => {
  const violations = [];

  if (arrayChanged(body.items, currentInvoice?.items)) {
    violations.push("line items");
  }
  if (arrayChanged(body.ad_ids, currentInvoice?.ad_ids)) {
    violations.push("linked ads");
  }
  if (
    valueChanged(body.advertiser_id, currentInvoice?.advertiser_id, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("advertiser");
  }
  if (
    valueChanged(body.advertiser_name, currentInvoice?.advertiser_name, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("advertiser name");
  }
  if (valueChanged(body.status, currentInvoice?.status, normalizeText)) {
    violations.push("status");
  }
  if (valueChanged(body.discount, currentInvoice?.discount, normalizeMoney)) {
    violations.push("discount");
  }
  if (valueChanged(body.tax, currentInvoice?.tax, normalizeMoney)) {
    violations.push("tax");
  }
  if (valueChanged(body.amount_paid, currentInvoice?.amount_paid, normalizeMoney)) {
    violations.push("amount paid");
  }

  return violations;
};

export const getSolaCreditInvoiceRestrictedChanges = (currentInvoice, body = {}) => {
  const violations = getCreditInvoiceRestrictedChanges(currentInvoice, body);

  if (
    body.amount !== undefined ||
    body.total !== undefined
  ) {
    const currentTotal = normalizeMoney(currentInvoice?.total ?? currentInvoice?.amount);
    const nextTotal =
      body.total !== undefined
        ? normalizeMoney(body.total)
        : normalizeMoney(body.amount);

    if (nextTotal !== currentTotal) {
      violations.push("total amount");
    }
  }

  if (
    valueChanged(body.payment_provider, currentInvoice?.payment_provider, (value) =>
      String(value || "").trim().toLowerCase(),
    )
  ) {
    violations.push("payment provider");
  }
  if (
    valueChanged(body.payment_reference, currentInvoice?.payment_reference, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("payment reference");
  }
  if (
    valueChanged(body.payment_note, currentInvoice?.payment_note, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("payment note");
  }
  if (
    valueChanged(body.paid_date, currentInvoice?.paid_date, (value) =>
      String(value || "").trim(),
    )
  ) {
    violations.push("paid date");
  }

  return violations;
};

export const formatGuardrailFieldList = (fields = []) =>
  fields
    .map((field) => String(field || "").trim())
    .filter(Boolean)
    .join(", ");
