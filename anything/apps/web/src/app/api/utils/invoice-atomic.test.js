// @vitest-environment node

import { describe, expect, it } from "vitest";

import { resolveInvoiceRequestKey } from "./invoice-atomic.js";

describe("resolveInvoiceRequestKey", () => {
  it("prefers explicit body key over header key", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-idempotency-key": "header-key",
      },
    });

    const key = resolveInvoiceRequestKey({
      request,
      bodyKey: "body-key",
      scope: "invoice-create",
    });

    expect(key).toBe("invoice-create:body-key");
  });

  it("returns null when no idempotency key is provided", () => {
    const key = resolveInvoiceRequestKey({
      request: new Request("https://example.com"),
      scope: "invoice-create",
    });

    expect(key).toBeNull();
  });
});
