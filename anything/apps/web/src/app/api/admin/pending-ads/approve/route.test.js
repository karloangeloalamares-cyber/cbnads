// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  pendingAd: null,
  existingApprovedAd: null,
  existingAdvertiser: null,
  product: null,
  updatedAd: null,
  cleanupPendingRow: null,
}));

vi.mock("../../../utils/supabase-db.js", () => ({
  db: vi.fn(() => ({
    from(tableName) {
      if (tableName === "cbnads_web_pending_ads") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: mockState.pendingAd,
                    error: null,
                  }),
                };
              },
            };
          },
          delete() {
            return {
              eq() {
                return {
                  select() {
                    return {
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: mockState.cleanupPendingRow,
                        error: null,
                      }),
                    };
                  },
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
              eq(column) {
                const data =
                  column === "source_pending_ad_id" ? mockState.existingApprovedAd : mockState.updatedAd;
                const chain = {
                  order: vi.fn(() => chain),
                  limit: vi.fn(() => chain),
                  maybeSingle: vi.fn().mockResolvedValue({
                    data,
                    error: null,
                  }),
                };
                return chain;
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
                    data: mockState.existingAdvertiser,
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
                    data: mockState.product,
                    error: null,
                  }),
                };
              },
              ilike() {
                return {
                  order() {
                    return {
                      limit: vi.fn().mockResolvedValue({
                        data: mockState.product ? [mockState.product] : [],
                        error: null,
                      }),
                    };
                  },
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

vi.mock("../../../utils/auth-check.js", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("../../../utils/update-advertiser-next-ad.js", () => ({
  updateAdvertiserNextAdDate: vi.fn(),
}));

vi.mock("../../../../../lib/timezone.js", () => ({
  APP_TIME_ZONE: "America/New_York",
  getTodayInAppTimeZone: vi.fn().mockReturnValue("2026-03-17"),
}));

vi.mock("../../../utils/ad-availability.js", () => ({
  checkBatchAvailability: vi.fn().mockResolvedValue({ results: {} }),
  checkSingleDateAvailability: vi.fn().mockResolvedValue({
    available: true,
    is_day_full: false,
    is_time_blocked: false,
  }),
  expandDateRange: vi.fn(() => []),
}));

vi.mock("../../../utils/send-email.js", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("../../../utils/invoice-helpers.js", () => ({
  adAmount: vi.fn().mockReturnValue(50),
  buildInvoiceLineItemsForAd: vi.fn(({ ad, unitAmount = 0, productId = null, productName = "" }) => [
    {
      ad_id: ad?.id || null,
      product_id: productId,
      description: productName || "Approved ad",
      quantity: 1,
      unit_price: unitAmount,
      amount: unitAmount,
      created_at: "2026-03-17T00:00:00.000Z",
    },
  ]),
  extractAdScheduleDateKeys: vi.fn((ad) => [String(ad?.post_date || ad?.post_date_from || "").slice(0, 10)]),
  sumInvoiceItemAmounts: vi.fn((items) =>
    (Array.isArray(items) ? items : []).reduce((sum, item) => sum + Number(item?.amount || 0), 0),
  ),
}));

vi.mock("../../../utils/prepaid-credits.js", () => ({
  sendInvoiceCoveredByCreditsNotice: vi.fn(),
}));

vi.mock("../../../utils/advertiser-dashboard-url.js", () => ({
  buildAdvertiserDashboardSignInUrl: vi.fn(() => "https://example.com/dashboard"),
}));

vi.mock("../../../utils/internal-notification-channels.js", () => ({
  notifyInternalChannels: vi.fn().mockResolvedValue({
    email_sent: true,
    telegram_sent: true,
    emails: ["ops@example.com"],
    telegram_chat_ids: ["ops-chat"],
  }),
}));

vi.mock("../../../utils/advertiser-auth.js", () => ({
  ensureAdvertiserRecord: vi.fn(),
}));

vi.mock("../../../utils/slot-capacity-error.js", () => ({
  getSlotCapacityErrorPayload: vi.fn().mockReturnValue(null),
}));

vi.mock("../../../utils/invoice-atomic.js", () => ({
  createInvoiceAtomic: vi.fn(),
}));

vi.mock("../../../utils/pending-conversion-atomic.js", () => ({
  convertPendingToAdAtomic: vi.fn(),
  isPendingNotFoundError: vi.fn().mockReturnValue(false),
  isPendingSubmissionAlreadyProcessedError: vi.fn().mockReturnValue(false),
}));

import { requireAdmin } from "../../../utils/auth-check.js";
import { updateAdvertiserNextAdDate } from "../../../utils/update-advertiser-next-ad.js";
import { sendEmail } from "../../../utils/send-email.js";
import { sendInvoiceCoveredByCreditsNotice } from "../../../utils/prepaid-credits.js";
import { notifyInternalChannels } from "../../../utils/internal-notification-channels.js";
import { createInvoiceAtomic } from "../../../utils/invoice-atomic.js";
import { convertPendingToAdAtomic } from "../../../utils/pending-conversion-atomic.js";
import { POST } from "./route.js";

describe("admin pending approve route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockState.pendingAd = null;
    mockState.existingApprovedAd = null;
    mockState.existingAdvertiser = null;
    mockState.product = null;
    mockState.updatedAd = null;
    mockState.cleanupPendingRow = null;

    requireAdmin.mockResolvedValue({
      authorized: true,
      user: { id: "admin-1", role: "admin" },
    });
    updateAdvertiserNextAdDate.mockResolvedValue(undefined);
    convertPendingToAdAtomic.mockResolvedValue({
      ad: {
        id: "ad-1",
        ad_name: "Spring Promo",
        product_id: "prod-1",
        product_name: "Base Package",
      },
      created: true,
      reason: "created",
    });
    createInvoiceAtomic.mockResolvedValue({
      invoice: {
        id: "inv-1",
        invoice_number: "INV-20260317-0001",
        total: 50,
        amount: 50,
      },
      created: true,
      appliedCredits: true,
      creditReason: "covered_by_credits",
    });
    sendInvoiceCoveredByCreditsNotice.mockResolvedValue({ skipped: false });
  });

  it("returns 409 when pending row is gone but approval already exists", async () => {
    mockState.pendingAd = null;
    mockState.existingApprovedAd = {
      id: "ad-existing",
      invoice_id: "inv-existing",
      paid_via_invoice_id: null,
      created_at: "2026-03-17T00:00:00.000Z",
    };

    const response = await POST(
      new Request("https://example.com/api/admin/pending-ads/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pending_ad_id: "pending-1",
        }),
      }),
    );

    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data).toMatchObject({
      error: expect.stringMatching(/already been approved/i),
      ad_id: "ad-existing",
      invoice_id: "inv-existing",
    });
    expect(convertPendingToAdAtomic).not.toHaveBeenCalled();
    expect(createInvoiceAtomic).not.toHaveBeenCalled();
  });

  it("suppresses credit notice when pending cleanup indicates a concurrent winner", async () => {
    mockState.pendingAd = {
      id: "pending-1",
      ad_name: "Spring Promo",
      advertiser_name: "Acme Co",
      contact_name: "Jordan Smith",
      email: "jordan@example.com",
      phone_number: "(212) 555-0100",
      post_type: "one_time",
      post_date: "2026-03-20",
      post_date_from: "2026-03-20",
      post_time: "09:00:00",
      placement: "Standard",
      product_id: "prod-1",
      reminder_minutes: 15,
      custom_dates: [],
      media: [],
      payment: "pending",
      price: 50,
    };
    mockState.existingAdvertiser = {
      id: "adv-1",
      advertiser_name: "Acme Co",
      status: "active",
    };
    mockState.product = {
      id: "prod-1",
      product_name: "Base Package",
      price: 50,
      placement: "Standard",
    };
    mockState.updatedAd = {
      id: "ad-1",
      ad_name: "Spring Promo",
      product_id: "prod-1",
      product_name: "Base Package",
      payment: "Pending",
    };
    // Another concurrent request already deleted this pending row.
    mockState.cleanupPendingRow = null;

    const response = await POST(
      new Request("https://example.com/api/admin/pending-ads/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pending_ad_id: "pending-1",
          use_existing_advertiser: true,
          existing_advertiser_id: "adv-1",
        }),
      }),
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.credits_applied).toBe(true);
    expect(data.notifications_sent).toBe(false);
    expect(sendInvoiceCoveredByCreditsNotice).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(notifyInternalChannels).not.toHaveBeenCalled();
    expect(updateAdvertiserNextAdDate).toHaveBeenCalledWith("Acme Co");
  });

  it("sends credit notice when this request wins pending cleanup", async () => {
    mockState.pendingAd = {
      id: "pending-1",
      ad_name: "Spring Promo",
      advertiser_name: "Acme Co",
      contact_name: "Jordan Smith",
      email: "jordan@example.com",
      phone_number: "(212) 555-0100",
      post_type: "one_time",
      post_date: "2026-03-20",
      post_date_from: "2026-03-20",
      post_time: "09:00:00",
      placement: "Standard",
      product_id: "prod-1",
      reminder_minutes: 15,
      custom_dates: [],
      media: [],
      payment: "pending",
      price: 50,
    };
    mockState.existingAdvertiser = {
      id: "adv-1",
      advertiser_name: "Acme Co",
      status: "active",
    };
    mockState.product = {
      id: "prod-1",
      product_name: "Base Package",
      price: 50,
      placement: "Standard",
    };
    mockState.updatedAd = {
      id: "ad-1",
      ad_name: "Spring Promo",
      product_id: "prod-1",
      product_name: "Base Package",
      payment: "Pending",
    };
    mockState.cleanupPendingRow = { id: "pending-1" };

    const response = await POST(
      new Request("https://example.com/api/admin/pending-ads/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pending_ad_id: "pending-1",
          use_existing_advertiser: true,
          existing_advertiser_id: "adv-1",
        }),
      }),
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.credits_applied).toBe(true);
    expect(data.notifications_sent).toBe(true);
    expect(sendInvoiceCoveredByCreditsNotice).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(notifyInternalChannels).not.toHaveBeenCalled();
  });
});
