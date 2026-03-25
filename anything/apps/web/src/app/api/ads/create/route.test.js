// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  advertiserRow: null,
  productRow: null,
  candidateAds: [],
}));

vi.mock("../../utils/supabase-db.js", () => ({
  db: vi.fn(() => ({
    from(tableName) {
      if (tableName === "cbnads_web_advertisers") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: mockState.advertiserRow,
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
                    data: mockState.productRow,
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
                  eq: vi.fn().mockResolvedValue({
                    data: mockState.candidateAds,
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
  dateOnly: vi.fn((value) => String(value || "").trim().slice(0, 10)),
  normalizePostType: vi.fn((value) => String(value || "").trim().toLowerCase().replace(/[-\s]+/g, "_")),
  table: vi.fn((name) => `cbnads_web_${name}`),
}));

vi.mock("../../utils/auth-check.js", () => ({
  requireInternalUser: vi.fn(),
}));

vi.mock("../../utils/update-advertiser-next-ad.js", () => ({
  updateAdvertiserNextAdDate: vi.fn(),
}));

vi.mock("../../../../lib/timezone.js", () => ({
  APP_TIME_ZONE: "America/New_York",
}));

vi.mock("../../utils/ad-availability.js", () => ({
  checkBatchAvailability: vi.fn().mockResolvedValue({ results: {} }),
  checkSingleDateAvailability: vi.fn().mockResolvedValue({
    available: true,
    is_day_full: false,
    is_time_blocked: false,
  }),
  expandDateRange: vi.fn(() => []),
}));

vi.mock("../../utils/slot-capacity-error.js", () => ({
  getSlotCapacityErrorPayload: vi.fn().mockReturnValue(null),
}));

vi.mock("../../utils/create-ad-atomic.js", () => ({
  createAdAtomic: vi.fn(),
  resolveAdCreateRequestKey: vi.fn(),
}));

import { requireInternalUser } from "../../utils/auth-check.js";
import { updateAdvertiserNextAdDate } from "../../utils/update-advertiser-next-ad.js";
import { createAdAtomic, resolveAdCreateRequestKey } from "../../utils/create-ad-atomic.js";
import { POST } from "./route.js";

describe("ads create route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockState.advertiserRow = {
      id: "adv-1",
      advertiser_name: "Zach Schwartz",
      status: "active",
    };
    mockState.productRow = {
      id: "prod-1",
      product_name: "WhatsApp Package",
      price: 5000,
    };
    mockState.candidateAds = [];

    requireInternalUser.mockResolvedValue({
      authorized: true,
      user: { id: "admin-1", role: "admin" },
    });
    resolveAdCreateRequestKey.mockReturnValue({
      key: "ad-create:auto:test-key",
      source: "auto",
    });
    createAdAtomic.mockResolvedValue({
      ad: {
        id: "ad-existing",
        ad_name: "Codex Stress Collide",
        status: "Draft",
      },
      created: false,
      reason: "idempotency_reuse",
    });
    updateAdvertiserNextAdDate.mockResolvedValue(undefined);
  });

  it("returns a warning when the atomic create reuses an existing ad", async () => {
    const request = new Request("http://localhost:4000/api/ads/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        advertiser: "Zach Schwartz",
        advertiser_id: "adv-1",
        ad_name: "Codex Stress Collide",
        placement: "WhatsApp",
        payment: "Pending",
        status: "Draft",
        product_id: "prod-1",
        post_type: "one_time",
        schedule: "2026-06-10",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(resolveAdCreateRequestKey).toHaveBeenCalled();
    expect(createAdAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        ad: expect.objectContaining({
          source_request_key: "ad-create:auto:test-key",
        }),
      }),
    );
    expect(data.warning).toBe(true);
    expect(data.deduplicated).toBe(true);
    expect(data.duplicateId).toBe("ad-existing");
    expect(data.ad?.id).toBe("ad-existing");
    expect(updateAdvertiserNextAdDate).not.toHaveBeenCalled();
  });

  it("does not auto-generate a request key when duplicate checks are skipped", async () => {
    resolveAdCreateRequestKey.mockReturnValue({
      key: null,
      source: null,
    });
    createAdAtomic.mockResolvedValue({
      ad: {
        id: "ad-new",
        ad_name: "Forced Duplicate",
      },
      created: true,
      reason: "created",
    });

    const request = new Request("http://localhost:4000/api/ads/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        advertiser: "Zach Schwartz",
        advertiser_id: "adv-1",
        ad_name: "Forced Duplicate",
        placement: "WhatsApp",
        payment: "Pending",
        status: "Draft",
        product_id: "prod-1",
        post_type: "one_time",
        schedule: "2026-06-11",
        skip_duplicate_check: true,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(createAdAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        ad: expect.objectContaining({
          source_request_key: null,
        }),
      }),
    );
    expect(data.warning).toBeUndefined();
    expect(data.ad?.id).toBe("ad-new");
    expect(updateAdvertiserNextAdDate).toHaveBeenCalledWith("Zach Schwartz");
  });
});
