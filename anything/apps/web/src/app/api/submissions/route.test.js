// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/auth-check.js", () => ({
  getRequestStatusForError: vi.fn().mockReturnValue(403),
  isAdvertiserUser: vi.fn().mockReturnValue(true),
  requireAuth: vi.fn().mockResolvedValue({
    authorized: true,
    user: {
      role: "advertiser",
      email: "jordan@example.com",
      advertiser_name: "Acme Co",
      name: "Jordan Smith",
    },
  }),
  requireAdminOrAdvertiser: vi.fn(),
  resolveAdvertiserScope: vi.fn().mockResolvedValue({
    id: "adv-1",
    email: "jordan@example.com",
    name: "Acme Co",
  }),
  matchesAdvertiserScope: vi.fn().mockReturnValue(true),
}));

vi.mock("../utils/pending-ad-submission.js", () => ({
  createPendingAdSubmission: vi.fn(),
}));

vi.mock("../utils/supabase-db.js", () => ({
  db: vi.fn(() => ({
    from(tableName) {
      if (tableName !== "cbnads_web_advertisers") {
        throw new Error(`Unexpected table lookup: ${tableName}`);
      }

      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "adv-1",
                    advertiser_name: "Acme Co",
                    contact_name: "Jordan Smith",
                    email: "jordan@example.com",
                    phone_number: "(212) 555-0100",
                  },
                  error: null,
                }),
              };
            },
            ilike() {
              return {
                limit() {
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: "adv-1",
                        advertiser_name: "Acme Co",
                        contact_name: "Jordan Smith",
                        email: "jordan@example.com",
                        phone_number: "(212) 555-0100",
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  })),
  table: vi.fn((name) => `cbnads_web_${name}`),
}));

import { createPendingAdSubmission } from "../utils/pending-ad-submission.js";
import { POST } from "./route.js";

describe("advertiser submissions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes multi-week submissions through and returns the first pending row", async () => {
    createPendingAdSubmission.mockResolvedValue({
      pendingAd: { id: "pending-1" },
      pendingAds: [{ id: "pending-1" }, { id: "pending-2" }],
      series_id: "series-123",
    });

    const response = await POST(
      new Request("https://example.com/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad_name: "Spring Promo",
          product_id: "prod-base",
          post_type: "Multi-week booking (TBD)",
          multi_week: {
            weeks: 2,
            series_week_start: "2026-03-15",
            overrides: [
              {
                product_id: "prod-week-2",
                post_date_from: "2026-03-22",
                post_time: "10:00:00",
              },
            ],
          },
        }),
      }),
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.pending_ad).toEqual({ id: "pending-1" });
    expect(createPendingAdSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        submission: expect.objectContaining({
          advertiser_id: "adv-1",
          advertiser_name: "Acme Co",
          email: "jordan@example.com",
          product_id: "prod-base",
          multi_week: expect.objectContaining({
            weeks: 2,
          }),
        }),
      }),
    );
  });
});
