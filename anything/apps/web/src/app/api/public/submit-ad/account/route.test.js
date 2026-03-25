// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { findAuthUserByEmail } from "../../../utils/advertiser-auth.js";

const {
  createUserMock,
  updateUserByIdMock,
  sendPendingSubmissionAdminWhatsAppNotificationMock,
  sendPendingSubmissionAdvertiserReceiptMock,
  sendPendingSubmissionInternalEmailNotificationMock,
  sendPendingSubmissionInternalTelegramNotificationMock,
} = vi.hoisted(() => ({
  createUserMock: vi.fn(),
  updateUserByIdMock: vi.fn(),
  sendPendingSubmissionAdminWhatsAppNotificationMock: vi
    .fn()
    .mockResolvedValue({ sent: true }),
  sendPendingSubmissionAdvertiserReceiptMock: vi.fn().mockResolvedValue({ sent: true }),
  sendPendingSubmissionInternalEmailNotificationMock: vi
    .fn()
    .mockResolvedValue({ sent: true }),
  sendPendingSubmissionInternalTelegramNotificationMock: vi
    .fn()
    .mockResolvedValue({ sent: true }),
}));

vi.mock("../../../utils/public-rate-limit.js", () => ({
  clientIpFromHeaders: vi.fn().mockReturnValue("127.0.0.1"),
  consumePublicRateLimit: vi.fn().mockResolvedValue({ limited: false }),
}));

vi.mock("../../../utils/supabase-db.js", () => ({
  db: vi.fn(() => ({
    auth: {
      admin: {
        createUser: createUserMock,
        updateUserById: updateUserByIdMock,
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

vi.mock("../../../utils/pending-ad-submission.js", () => ({
  sendPendingSubmissionAdminWhatsAppNotification:
    sendPendingSubmissionAdminWhatsAppNotificationMock,
  sendPendingSubmissionAdvertiserReceipt: sendPendingSubmissionAdvertiserReceiptMock,
  sendPendingSubmissionInternalEmailNotification:
    sendPendingSubmissionInternalEmailNotificationMock,
  sendPendingSubmissionInternalTelegramNotification:
    sendPendingSubmissionInternalTelegramNotificationMock,
}));

import { POST } from "./route.js";

describe("public submit-ad account route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "jordan@example.com" } },
      error: null,
    });
    updateUserByIdMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "jordan@example.com" } },
      error: null,
    });
    sendPendingSubmissionAdminWhatsAppNotificationMock.mockResolvedValue({
      sent: true,
    });
    sendPendingSubmissionAdvertiserReceiptMock.mockResolvedValue({ sent: true });
    sendPendingSubmissionInternalEmailNotificationMock.mockResolvedValue({
      sent: true,
    });
    sendPendingSubmissionInternalTelegramNotificationMock.mockResolvedValue({
      sent: true,
    });
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
    expect(sendPendingSubmissionAdvertiserReceiptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingAdId: "",
      }),
    );
    expect(sendPendingSubmissionInternalTelegramNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingAdId: "",
      }),
    );
    expect(sendPendingSubmissionInternalEmailNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingAdId: "",
      }),
    );
    expect(sendPendingSubmissionAdminWhatsAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingAdId: "",
      }),
    );
  });

  it("returns a validation error for weak passwords", async () => {
    const response = await POST(
      new Request("https://example.com/api/public/submit-ad/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advertiserName: "Acme Co",
          contactName: "Jordan Smith",
          phoneNumber: "(212) 555-0100",
          email: "jordan@example.com",
          password: "password",
          confirmPassword: "password",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe(
      "Password must be at least 8 characters long and include letters, numbers, and special characters.",
    );
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("maps Supabase password policy errors to a validation error", async () => {
    createUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()_+-=[]{};':\"\\|,.<>/?" },
    });

    const response = await POST(
      new Request("https://example.com/api/public/submit-ad/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advertiserName: "Acme Co",
          contactName: "Jordan Smith",
          phoneNumber: "(212) 555-0100",
          email: "jordan@example.com",
          password: "Password123",
          confirmPassword: "Password123",
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe(
      "Password must be at least 8 characters long and include letters, numbers, and special characters.",
    );
  });

  it("returns a generic success response for existing verified advertiser accounts", async () => {
    vi.mocked(findAuthUserByEmail).mockResolvedValueOnce({
      id: "user-existing",
      user_metadata: {
        role: "Advertiser",
        account_verified: true,
      },
      app_metadata: {
        role: "Advertiser",
        advertiser_id: "adv-1",
      },
    });

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
    expect(data).toMatchObject({
      success: true,
      email: "jordan@example.com",
      advertiserId: "adv-1",
      verificationRequired: true,
      verificationEmailSent: true,
    });
    expect(createUserMock).not.toHaveBeenCalled();
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });
});
