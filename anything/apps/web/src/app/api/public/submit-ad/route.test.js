// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/public-rate-limit.js", () => ({
  clientIpFromHeaders: vi.fn().mockReturnValue("127.0.0.1"),
  consumePublicRateLimit: vi.fn().mockResolvedValue({ limited: false }),
}));

vi.mock("../../utils/pending-ad-submission.js", () => ({
  createPendingAdSubmission: vi.fn(),
}));

import { createPendingAdSubmission } from "../../utils/pending-ad-submission.js";
import { POST } from "./route.js";

describe("public submit-ad route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pending series metadata for multi-week submissions", async () => {
    createPendingAdSubmission.mockResolvedValue({
      pendingAd: { id: "pending-1" },
      pendingAds: [{ id: "pending-1" }, { id: "pending-2" }],
      series_id: "series-123",
    });

    const response = await POST(
      new Request("https://example.com/api/public/submit-ad", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": "submission-123",
        },
        body: JSON.stringify({
          advertiser_name: "Acme Co",
          contact_name: "Jordan Smith",
          email: "jordan@example.com",
          phone_number: "(212) 555-0100",
          ad_name: "Spring Promo",
          post_type: "Multi-week booking (TBD)",
          multi_week: {
            weeks: 2,
            series_week_start: "2026-03-15",
            overrides: [],
          },
        }),
      }),
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.pending_ad).toEqual({ id: "pending-1" });
    expect(data.pending_ads).toHaveLength(2);
    expect(data.series_id).toBe("series-123");
    expect(createPendingAdSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRequestKey: expect.stringMatching(/^[0-9a-f]{24}:submission-123$/),
        sendAdvertiserReceipt: false,
        sendInternalEmailNotification: false,
        sendInternalTelegramNotification: false,
        sendAdminWhatsAppNotification: false,
      }),
    );
  });
});
