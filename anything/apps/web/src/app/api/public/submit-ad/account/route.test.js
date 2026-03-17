// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../utils/public-rate-limit.js", () => ({
  clientIpFromHeaders: vi.fn().mockReturnValue("127.0.0.1"),
  consumePublicRateLimit: vi.fn().mockResolvedValue({ limited: false }),
}));

vi.mock("../../../utils/supabase-db.js", () => ({
  db: vi.fn(() => ({
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "jordan@example.com" } },
          error: null,
        }),
        updateUserById: vi.fn(),
      },
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  })),
  table: vi.fn((name) => `cbnads_web_${name}`),
}));

vi.mock("../../../utils/advertiser-auth.js", () => ({
  assertAdvertiserVerificationConfig: vi.fn(),
  createAdvertiserVerificationToken: vi.fn(() => "verify-token"),
  ensureAdvertiserRecord: vi.fn().mockResolvedValue({ id: "adv-1" }),
  findAuthUserByEmail: vi.fn().mockResolvedValue(null),
  normalizeEmail: vi.fn((value) => String(value || "").trim().toLowerCase()),
  sendAdvertiserVerificationEmail: vi
    .fn()
    .mockRejectedValue(new Error("Missing configuration: RESEND_API_KEY")),
  updatePendingAdAccountEmail: vi.fn().mockResolvedValue(true),
  upsertAdvertiserProfile: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

import { POST } from "./route.js";

describe("public submit-ad account route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the advertiser account even when verification email sending fails", async () => {
    const response = await POST(
      new Request("https://example.com/api/public/submit-ad/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advertiserName: "Acme Co",
          contactName: "Jordan Smith",
          phoneNumber: "(212) 555-0100",
          email: "jordan@example.com",
          password: "Password1!",
          confirmPassword: "Password1!",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.email).toBe("jordan@example.com");
    expect(data.verificationRequired).toBe(true);
    expect(data.verificationEmailSent).toBe(false);
  });
});
