// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  auth: { authorized: true },
  count: 0,
  error: null,
  hasSupabaseAdminConfig: true,
}));

vi.mock("../../../utils/supabase-db.js", () => ({
  db: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            count: mockState.count,
            error: mockState.error,
          }),
        })),
      })),
    })),
  })),
  table: vi.fn(() => "cbnads_web_pending_ads"),
}));

vi.mock("../../../utils/auth-check.js", () => ({
  requirePermission: vi.fn(async () => mockState.auth),
}));

vi.mock("../../../../../lib/supabaseAdmin.js", () => ({
  get hasSupabaseAdminConfig() {
    return mockState.hasSupabaseAdminConfig;
  },
}));

import { GET } from "./route.js";

describe("admin pending unread-count route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.auth = { authorized: true };
    mockState.count = 0;
    mockState.error = null;
    mockState.hasSupabaseAdminConfig = true;
  });

  it("returns the unread count on success", async () => {
    mockState.count = 7;

    const response = await GET(new Request("http://localhost/api/admin/pending-ads/unread-count"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ count: 7 });
  });

  it("treats upstream 502 HTML responses as recoverable and logs a sanitized summary", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockState.error = {
      status: 502,
      message:
        "<!DOCTYPE html><html><head><title>nwiovokagddmcmwkrejy.supabase.co | 502: Bad gateway</title></head><body>Cloudflare Bad gateway</body></html>",
    };

    const response = await GET(new Request("http://localhost/api/admin/pending-ads/unread-count"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      count: 0,
      degraded: true,
      recoverable: true,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();

    const [, context] = warnSpy.mock.calls[0];
    expect(context).toMatchObject({
      status: 502,
      code: null,
      recoverable: true,
    });
    expect(context.message).toContain("502: Bad gateway");
    expect(context.message).toContain("Cloudflare");
    expect(context.message).not.toContain("<!DOCTYPE html>");
    expect(String(context.message).length).toBeLessThanOrEqual(240);
  });
});
