// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../utils/auth-check.js", () => ({
  requirePermission: vi.fn().mockResolvedValue({
    authorized: true,
    user: { id: "admin-1", role: "admin" },
  }),
}));

vi.mock("../../../utils/update-advertiser-next-ad.js", () => ({
  updateAdvertiserNextAdDate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../utils/ad-availability.js", () => ({
  checkSingleDateAvailability: vi.fn().mockResolvedValue({
    available: true,
    is_day_full: false,
    is_time_blocked: false,
  }),
  checkBatchAvailability: vi.fn().mockResolvedValue({ results: {} }),
  expandDateRange: vi.fn(() => []),
}));

vi.mock("../../../utils/supabase-db.js", () => ({
  db: vi.fn(() => ({
    rpc(functionName) {
      if (functionName === "cbnads_web_convert_pending_to_ad_atomic") {
        return Promise.resolve({
          data: [{ ad_id: "ad-existing", created: false, reason: "idempotency_reuse" }],
          error: null,
        });
      }
      throw new Error(`Unexpected rpc: ${functionName}`);
    },
    from(tableName) {
      if (tableName === "cbnads_web_pending_ads") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: "pending-1",
                      ad_name: "Spring Promo",
                      post_type: "one_time",
                      post_date: "2026-03-20",
                      post_date_from: "2026-03-20",
                      post_time: "09:00:00",
                      custom_dates: [],
                      media: [],
                      reminder_minutes: 15,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (tableName === "cbnads_web_advertisers") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: "adv-1",
                      advertiser_name: "Acme Co",
                      status: "active",
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (tableName === "cbnads_web_products") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: "prod-1",
                      product_name: "Base Package",
                      price: 25,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (tableName === "cbnads_web_ads") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: "ad-existing",
                      ad_name: "Spring Promo",
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${tableName}`);
    },
  })),
  normalizePostType: vi.fn((value) => String(value || "").trim().toLowerCase().replace(/[-\s]+/g, "_")),
  table: vi.fn((name) => `cbnads_web_${name}`),
}));

import { POST } from "./route.js";

describe("submissions convert route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 409 when the pending submission was already converted", async () => {
    const response = await POST(
      new Request("https://example.com/api/submissions/pending-1/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advertiser_id: "adv-1",
          placement: "WhatsApp",
          product_id: "prod-1",
          post_type: "one_time",
          schedule: {
            post_date: "2026-03-20",
            post_time: "09:00:00",
          },
        }),
      }),
      { params: { id: "pending-1" } },
    );

    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.error).toMatch(/already been converted/i);
  });
});
