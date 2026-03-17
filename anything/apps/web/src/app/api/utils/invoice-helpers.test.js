// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  isInvoiceNumberConflictError,
  reserveInvoiceNumberWithRetry,
} from "./invoice-helpers.js";

describe("invoice helpers", () => {
  it("detects invoice_number unique-conflict errors", () => {
    expect(
      isInvoiceNumberConflictError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "cbnads_web_invoices_invoice_number_key"',
      }),
    ).toBe(true);

    expect(
      isInvoiceNumberConflictError({
        code: "23505",
        message: "duplicate key value violates unique constraint other_index",
      }),
    ).toBe(false);
  });

  it("retries invoice-number reservation on conflict", async () => {
    const createAttempt = vi
      .fn()
      .mockRejectedValueOnce({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "cbnads_web_invoices_invoice_number_key"',
      })
      .mockResolvedValueOnce({ id: "invoice-1" });

    const result = await reserveInvoiceNumberWithRetry(createAttempt);

    expect(createAttempt).toHaveBeenCalledTimes(2);
    expect(result.value).toEqual({ id: "invoice-1" });
    expect(typeof result.invoiceNumber).toBe("string");
    expect(result.invoiceNumber.length).toBeGreaterThan(0);
  });
});
