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

vi.mock("./send-whatsapp.js", () => ({
  sendWhatsAppInteractive: vi.fn().mockResolvedValue({ ok: true }),
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

const defaultProducts = [
  { id: "prod-base", product_name: "Base Package", placement: "WhatsApp", price: 20 },
  { id: "prod-week-2", product_name: "Week 2 Upgrade", placement: "Website", price: 35 },
];

const buildMockSupabase = ({
  insertResults = [],
  products = defaultProducts,
  availability = { available: true, is_day_full: false, is_time_blocked: false },
} = {}) => {
  const pendingAdResults = [...insertResults];
  const insertCalls = [];
  const productRows = [...products];

  const selectBuilder = (tableName, payload) => {
    if (tableName !== "cbnads_web_pending_ads") {
      throw new Error(`Unexpected select table: ${tableName}`);
    }

    const defaultData = Array.isArray(payload)
      ? payload.map((_, index) => ({ id: `pending-${index + 1}` }))
      : { id: "pending-1" };

    const buildResult = () =>
      pendingAdResults.shift() || {
        data: defaultData,
        error: null,
      };

    return {
      async single() {
        return buildResult();
      },
      async maybeSingle() {
        return buildResult();
      },
      then(resolve, reject) {
        return Promise.resolve(buildResult()).then(resolve, reject);
      },
    };
  };

  return {
    insertCalls,
    client: {
      from(tableName) {
        if (tableName === "cbnads_web_pending_ads") {
          return {
            insert(payload) {
              insertCalls.push(structuredClone(payload));
              return {
                select() {
                  return selectBuilder(tableName, payload);
                },
              };
            },
            select() {
              return {
                or() {
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
          };
        }

        if (tableName === "cbnads_web_products") {
          return {
            select() {
              return {
                eq(_column, value) {
                  return {
                    async maybeSingle() {
                      return {
                        data:
                          productRows.find((item) => String(item.id) === String(value)) || null,
                        error: null,
                      };
                    },
                  };
                },
                in(_column, values) {
                  return Promise.resolve({
                    data: productRows.filter((item) => values.includes(item.id)),
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (tableName === "cbnads_web_admin_settings") {
          return {
            select() {
              return {
                order() {
                  return {
                    limit() {
                      return Promise.resolve({
                        data: [{ max_ads_per_day: 5, max_ads_per_slot: 5 }],
                        error: null,
                      });
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
                or() {
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
          };
        }
        throw new Error(`Unexpected table lookup: ${tableName}`);
      },
    },
  };
};

describe("createPendingAdSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts reminder labels to integer minutes before insert", async () => {
    const { client, insertCalls } = buildMockSupabase();

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
    const { client, insertCalls } = buildMockSupabase({
      insertResults: [
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
      ],
    });

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

  it("creates one pending row per week with product overrides and series linkage", async () => {
    const { client, insertCalls } = buildMockSupabase();

    const result = await createPendingAdSubmission({
      request: buildRequest(),
      supabase: client,
      submission: buildSubmission({
        product_id: "prod-base",
        post_type: "Multi-week booking (TBD)",
        reminder_minutes: "30-min",
        multi_week: {
          weeks: 2,
          series_week_start: "2026-03-15",
          overrides: [
            {
              post_date_from: "2026-03-15",
              post_time: "09:00",
              reminder_minutes: "15-min",
            },
            {
              product_id: "prod-week-2",
              placement: "Website",
              ad_name: "Week 2 Promo",
              post_date_from: "2026-03-22",
              post_time: "10:00",
              reminder_minutes: "1-hour",
            },
          ],
        },
      }),
    });

    expect(result.series_id).toBeTruthy();
    expect(result.pendingAd).toEqual({ id: "pending-1" });
    expect(insertCalls).toHaveLength(1);
    expect(Array.isArray(insertCalls[0])).toBe(true);
    expect(insertCalls[0]).toHaveLength(2);
    expect(insertCalls[0][0]).toMatchObject({
      product_id: "prod-base",
      product_name: "Base Package",
      placement: "WhatsApp",
      price: 20,
      series_index: 1,
      series_total: 2,
      series_week_start: "2026-03-15",
      reminder_minutes: 15,
    });
    expect(insertCalls[0][1]).toMatchObject({
      product_id: "prod-week-2",
      product_name: "Week 2 Upgrade",
      placement: "Website",
      price: 35,
      ad_name: "Week 2 Promo",
      series_index: 2,
      series_total: 2,
      series_week_start: "2026-03-22",
      reminder_minutes: 60,
    });
  });

  it("rejects multi-week submissions without a base product", async () => {
    const { client, insertCalls } = buildMockSupabase();

    const result = await createPendingAdSubmission({
      request: buildRequest(),
      supabase: client,
      submission: buildSubmission({
        post_type: "Multi-week booking (TBD)",
        multi_week: {
          weeks: 2,
          series_week_start: "2026-03-15",
          overrides: [],
        },
      }),
    });

    expect(result).toMatchObject({
      error: "Select a base product for this multi-week booking",
      status: 400,
    });
    expect(insertCalls).toHaveLength(0);
  });

  it("allows public multi-week submissions without a base product", async () => {
    const { client, insertCalls } = buildMockSupabase();

    const result = await createPendingAdSubmission({
      request: buildRequest(),
      supabase: client,
      requireProductForMultiWeek: false,
      submission: buildSubmission({
        post_type: "Multi-week booking (TBD)",
        reminder_minutes: "30-min",
        multi_week: {
          weeks: 2,
          series_week_start: "2026-03-15",
          overrides: [
            {
              placement: "WhatsApp",
              post_date_from: "2026-03-15",
              post_time: "09:00",
            },
            {
              placement: "Website",
              schedule_tbd: true,
            },
          ],
        },
      }),
    });

    expect(result.pendingAds).toHaveLength(2);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][0]).toMatchObject({
      series_index: 1,
      placement: "WhatsApp",
      product_id: null,
      product_name: null,
      price: 0,
    });
    expect(insertCalls[0][1]).toMatchObject({
      series_index: 2,
      placement: "Website",
      product_id: null,
      product_name: null,
      price: 0,
      post_date_from: null,
      post_time: null,
    });
  });

  it("ignores stale multi-week product ids when product assignment is deferred", async () => {
    const { client, insertCalls } = buildMockSupabase();

    const result = await createPendingAdSubmission({
      request: buildRequest(),
      supabase: client,
      requireProductForMultiWeek: false,
      submission: buildSubmission({
        product_id: "missing-base-product",
        post_type: "Multi-week booking (TBD)",
        multi_week: {
          weeks: 2,
          series_week_start: "2026-03-15",
          overrides: [
            {
              product_id: "missing-week-product",
              placement: "WhatsApp",
              post_date_from: "2026-03-15",
              post_time: "09:00",
            },
            {
              placement: "Website",
              schedule_tbd: true,
            },
          ],
        },
      }),
    });

    expect(result.pendingAds).toHaveLength(2);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][0]).toMatchObject({
      product_id: null,
      product_name: null,
      price: 0,
      placement: "WhatsApp",
    });
    expect(insertCalls[0][1]).toMatchObject({
      product_id: null,
      product_name: null,
      price: 0,
      placement: "Website",
    });
  });
});
