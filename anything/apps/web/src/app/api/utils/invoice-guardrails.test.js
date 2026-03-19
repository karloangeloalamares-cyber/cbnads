// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  formatGuardrailFieldList,
  getCreditInvoiceRestrictedChanges,
  getInvoiceMutationGuardrail,
  getReconciliationInvoiceRestrictedChanges,
  getSettledInvoiceRestrictedChanges,
  hasExternalInvoiceSettlement,
  hasInvoiceRecordedPayment,
  isInvoiceReconciliationRequired,
  isCreditInvoiceRecord,
  normalizeFinancialChangeReason,
} from "./invoice-guardrails.js";

describe("invoice guardrails", () => {
  it("detects credit invoices from the CRE prefix", () => {
    expect(isCreditInvoiceRecord({ invoice_number: "CRE-20260319-AB12" })).toBe(true);
    expect(isCreditInvoiceRecord({ invoice_number: "INV-20260319-AB12" })).toBe(false);
  });

  it("treats paid, partial, and credit-paid invoices as recorded payment", () => {
    expect(hasInvoiceRecordedPayment({ status: "Paid", amount_paid: 0 })).toBe(true);
    expect(hasInvoiceRecordedPayment({ status: "Pending", amount_paid: 25 })).toBe(true);
    expect(hasInvoiceRecordedPayment({ status: "Pending", paid_via_credits: true })).toBe(true);
    expect(hasInvoiceRecordedPayment({ status: "Pending", amount_paid: 0 })).toBe(false);
  });

  it("distinguishes externally settled invoices from credit-paid ones", () => {
    expect(hasExternalInvoiceSettlement({ status: "Paid", amount_paid: 100, paid_via_credits: false })).toBe(true);
    expect(hasExternalInvoiceSettlement({ status: "Paid", amount_paid: 100, paid_via_credits: true })).toBe(false);
    expect(hasExternalInvoiceSettlement({ status: "Pending", amount_paid: 0, paid_via_credits: false })).toBe(false);
  });

  it("blocks structural edits on settled invoices but allows metadata-only edits", () => {
    const currentInvoice = {
      advertiser_id: "adv-1",
      advertiser_name: "Acme Co",
      status: "Paid",
      discount: 0,
      tax: 0,
      total: 100,
      amount_paid: 100,
    };

    expect(
      getSettledInvoiceRestrictedChanges(currentInvoice, {
        issue_date: "2026-03-19",
        notes: "Updated internal note",
      }),
    ).toEqual([]);

    expect(
      getSettledInvoiceRestrictedChanges(currentInvoice, {
        total: 150,
        status: "Pending",
        items: [{ description: "Changed item" }],
      }),
    ).toEqual(["line items", "status", "total amount"]);
  });

  it("keeps credit invoices locked to their advertiser, paid state, and accounting fields", () => {
    const currentInvoice = {
      advertiser_id: "adv-1",
      advertiser_name: "Acme Co",
      status: "Paid",
      discount: 0,
      tax: 0,
      amount_paid: 100,
    };

    expect(
      getCreditInvoiceRestrictedChanges(currentInvoice, {
        notes: "Reworded reason",
        total: 120,
      }),
    ).toEqual([]);

    expect(
      getCreditInvoiceRestrictedChanges(currentInvoice, {
        advertiser_id: "adv-2",
        status: "Pending",
        amount_paid: 90,
      }),
    ).toEqual(["advertiser", "status", "amount paid"]);
  });

  it("limits reconciliation repairs to links, totals, and metadata", () => {
    const currentInvoice = {
      advertiser_id: "adv-1",
      advertiser_name: "Acme Co",
      status: "Paid",
      amount_paid: 750,
      total: 750,
      paid_via_credits: true,
    };

    expect(
      getReconciliationInvoiceRestrictedChanges(currentInvoice, {
        total: 800,
        ad_ids: ["ad-1"],
        items: [{ description: "Recovered line item", amount: 800 }],
        notes: "Repairing broken links",
      }),
    ).toEqual([]);

    expect(
      getReconciliationInvoiceRestrictedChanges(currentInvoice, {
        advertiser_id: "adv-2",
        status: "Pending",
        amount_paid: 0,
      }),
    ).toEqual(["advertiser", "status", "amount paid"]);
  });

  it("normalizes reasons and formats guardrail field lists", () => {
    expect(normalizeFinancialChangeReason("  Need to fix amount  ")).toBe("Need to fix amount");
    expect(formatGuardrailFieldList(["status", "total amount"])).toBe("status, total amount");
  });

  it("classifies credit-backed delete actions by financial state", () => {
    expect(
      getInvoiceMutationGuardrail({
        invoice_number: "CRE-20260319-AB12",
        total: 200,
        amount_paid: 200,
        paid_via_credits: false,
      }).action,
    ).toBe("reverse_credit_record");

    expect(
      getInvoiceMutationGuardrail({
        invoice_number: "INV-20260319-AB12",
        status: "Paid",
        total: 200,
        amount_paid: 200,
        paid_via_credits: true,
        ad_ids: ["ad-1"],
        items: [],
      }).action,
    ).toBe("reverse_credit_payment");

    expect(
      getInvoiceMutationGuardrail({
        invoice_number: "INV-20260319-AB12",
        status: "Paid",
        total: 200,
        amount_paid: 0,
        paid_via_credits: true,
        ad_ids: [],
        items: [],
      }).action,
    ).toBe("reconcile_required");

    expect(
      getInvoiceMutationGuardrail({
        invoice_number: "INV-20260319-AB12",
        status: "Partial",
        total: 200,
        amount_paid: 100,
        paid_via_credits: false,
      }).action,
    ).toBe("blocked_external_settlement");

    expect(
      getInvoiceMutationGuardrail({
        invoice_number: "INV-20260319-AB12",
        status: "Pending",
        total: 200,
        amount_paid: 0,
        paid_via_credits: false,
        ad_ids: ["ad-1"],
      }).action,
    ).toBe("safe_delete");
  });

  it("flags credit-paid invoices with missing links for reconciliation", () => {
    expect(
      isInvoiceReconciliationRequired({
        invoice_number: "INV-20260319-AB12",
        status: "Paid",
        total: 750,
        amount_paid: 750,
        paid_via_credits: true,
        ad_ids: [],
        items: [],
      }),
    ).toBe(true);

    expect(
      isInvoiceReconciliationRequired({
        invoice_number: "INV-20260319-AB12",
        status: "Paid",
        total: 750,
        amount_paid: 750,
        paid_via_credits: true,
        ad_ids: ["ad-1"],
        items: [],
      }),
    ).toBe(false);
  });
});
