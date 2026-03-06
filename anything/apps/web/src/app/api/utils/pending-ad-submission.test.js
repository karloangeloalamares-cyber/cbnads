// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./send-email.js", () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: "email-1" }),
}));

vi.mock("./internal-notification-channels.js", () => ({
  notifyInternalChannels: vi.fn().mockResolvedValue({
    email_sent: true,
    telegram_sent: true,
  }),
}));

import { createPendingAdSubmission } from "./pending-ad-submission.js";

const buildRequest = () =>
  new Request("https://example.com/api/public/submit-ad", {
    method: "POST",
  });

const buildSubmission = (overrides = {}) => ({
  advertiser_name: "Acme Co",
  contact_name: "Jordan Smith",
  email: "jordan@example.com",
  phone_number: "(212) 555-0100",
  ad_name: "Spring Promo",
  post_type: "One-Time Post",
  media: [],
  ...overrides,
});

const buildMockSupabase = (results) => {
  const pendingAdResults = [...results];
  const insertCalls = [];

  return {
    insertCalls,
    client: {
      from(tableName) {
        if (tableName !== "cbnads_web_pending_ads") {
          throw new Error(`Unexpected table lookup: ${tableName}`);
        }

        return {
          insert(payload) {
            insertCalls.push(structuredClone(payload));
            const result = pendingAdResults.shift() || {
              data: { id: "pending-1" },
              error: null,
            };

            return {
              select() {
                return {
                  async single() {
                    return result;
                  },
                };
              },
            };
          },
        };
      },
    },
  };
};

describe("createPendingAdSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts reminder labels to integer minutes before insert", async () => {
    const { client, insertCalls } = buildMockSupabase([
      { data: { id: "pending-1" }, error: null },
    ]);

    const result = await createPendingAdSubmission({
      request: buildRequest(),
      supabase: client,
      submission: buildSubmission({
        reminder_minutes: "1-hour",
      }),
    });

    expect(result.pendingAd).toEqual({ id: "pending-1" });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].reminder_minutes).toBe(60);
  });

  it("retries inserts when optional pending submission columns are missing", async () => {
    const { client, insertCalls } = buildMockSupabase([
      {
        data: null,
        error: { message: "column cbnads_web_pending_ads.advertiser_id does not exist" },
      },
      {
        data: null,
        error: { message: "column cbnads_web_pending_ads.product_id does not exist" },
      },
      {
        data: null,
        error: { message: "column cbnads_web_pending_ads.product_name does not exist" },
      },
      {
        data: null,
        error: { message: "column cbnads_web_pending_ads.price does not exist" },
      },
      { data: { id: "pending-2" }, error: null },
    ]);

    const result = await createPendingAdSubmission({
      request: buildRequest(),
      supabase: client,
      submission: buildSubmission(),
    });

    expect(result.pendingAd).toEqual({ id: "pending-2" });
    expect(insertCalls).toHaveLength(5);
    expect(insertCalls[0]).toMatchObject({
      advertiser_id: null,
      product_id: null,
      product_name: null,
      price: 0,
    });
    expect(insertCalls[4]).not.toHaveProperty("advertiser_id");
    expect(insertCalls[4]).not.toHaveProperty("product_id");
    expect(insertCalls[4]).not.toHaveProperty("product_name");
    expect(insertCalls[4]).not.toHaveProperty("price");
  });
});
