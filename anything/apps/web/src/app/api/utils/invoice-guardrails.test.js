// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  formatGuardrailFieldList,
  getCreditInvoiceRestrictedChanges,
  getInvoiceMutationGuardrail,
  getReconciliationInvoiceRestrictedChanges,
  getSolaCreditInvoiceRestrictedChanges,
  getSolaSettledInvoiceRestrictedChanges,
  getSettledInvoiceRestrictedChanges,
  hasExternalInvoiceSettlement,
  hasInvoiceRecordedPayment,
  isSolaSettledInvoice,
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

  it("blocks structural edits on settled invoices but allows payment metadata edits", () => {
    const currentInvoice = {
      advertiser_id: "adv-1",
      advertiser_name: "Acme Co",
      status: "Paid",
      discount: 0,
      tax: 0,
      total: 100,
      amount_paid: 100,
      payment_provider: "stripe",
      payment_reference: "pi_123",
    };

    expect(
      getSettledInvoiceRestrictedChanges(currentInvoice, {
        issue_date: "2026-03-19",
        notes: "Updated internal note",
        amount_paid: 100,
        status: "Paid",
        payment_provider: "paypal",
        payment_reference: "PAY-123",
      }),
    ).toEqual([]);

    expect(
      getSettledInvoiceRestrictedChanges(currentInvoice, {
        total: 150,
        items: [{ description: "Changed item" }],
      }),
    ).toEqual(["line items", "total amount"]);
  });

  it("keeps Sola-settled invoices locked to recorded settlement fields", () => {
    const currentInvoice = {
      advertiser_id: "adv-1",
      advertiser_name: "Acme Co",
      status: "Paid",
      discount: 0,
      tax: 0,
      total: 100,
      amount_paid: 100,
      payment_provider: "sola",
      payment_reference: "xref-1",
      payment_note: "Captured by webhook",
      paid_date: "2026-03-19",
    };

    expect(isSolaSettledInvoice(currentInvoice)).toBe(true);

    expect(
      getSolaSettledInvoiceRestrictedChanges(currentInvoice, {
        notes: "Internal note change",
      }),
    ).toEqual([]);

    expect(
      getSolaSettledInvoiceRestrictedChanges(currentInvoice, {
        amount_paid: 80,
        payment_reference: "xref-2",
      }),
    ).toEqual(["amount paid", "payment reference"]);
  });

  it("ignores editor-only invoice item metadata when comparing settled invoice items", () => {
    const currentInvoice = {
      status: "Paid",
      total: 1500,
      amount_paid: 1500,
      items: [
        {
          ad_id: "ad-1",
          product_id: "prod-1",
          description: "Testing Credit Application",
          quantity: 1,
          unit_price: 1500,
          amount: 1500,
        },
      ],
    };

    expect(
      getSettledInvoiceRestrictedChanges(currentInvoice, {
        items: [
          {
            id: "item-1",
            invoice_id: "inv-1",
            ad_id: "ad-1",
            product_id: "prod-1",
            description: "Testing Credit Application",
            quantity: "1",
            unit_price: "1500.00",
            amount: "1500.00",
            created_at: "2026-03-19T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual([]);
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

  it("keeps Sola credit invoices locked to totals and settlement proof", () => {
    const currentInvoice = {
      invoice_number: "CRE-20260319-AB12",
      advertiser_id: "adv-1",
      advertiser_name: "Acme Co",
      status: "Paid",
      total: 100,
      amount_paid: 100,
      payment_provider: "sola",
      payment_reference: "xref-1",
      payment_note: "Captured by webhook",
      paid_date: "2026-03-19",
    };

    expect(
      getSolaCreditInvoiceRestrictedChanges(currentInvoice, {
        notes: "Updated internal note",
      }),
    ).toEqual([]);

    expect(
      getSolaCreditInvoiceRestrictedChanges(currentInvoice, {
        total: 120,
        payment_reference: "xref-2",
      }),
    ).toEqual(["total amount", "payment reference"]);
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
