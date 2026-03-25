// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/upload-access.js", () => ({
  enforceUploadAccess: vi.fn(),
}));

vi.mock("../../../../lib/supabaseAdmin.js", () => ({
  adminBucketName: vi.fn((baseName) => `test_${baseName}`),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("../../utils/media-asset-url.js", () => ({
  buildMediaAssetUrl: vi.fn(() => "/api/upload/object?token=test-token"),
}));

import { enforceUploadAccess } from "../../utils/upload-access.js";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin.js";
import { POST } from "./route.js";

describe("upload signed-url route", () => {
  let supabase;
  let listBuckets;
  let createBucket;
  let updateBucket;
  let createSignedUploadUrl;

  beforeEach(() => {
    vi.clearAllMocks();

    listBuckets = vi.fn().mockResolvedValue({
      data: [{ name: "test_uploads", public: false }],
      error: null,
    });
    createBucket = vi.fn().mockResolvedValue({ error: null });
    updateBucket = vi.fn().mockResolvedValue({ error: null });
    createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: {
        token: "signed-token",
        signedUrl: "https://storage.example.com/object/upload/sign/test_uploads/ad-media/test.png?token=signed-token",
      },
      error: null,
    });

    supabase = {
      storage: {
        listBuckets,
        createBucket,
        updateBucket,
        from: vi.fn(() => ({
          createSignedUploadUrl,
        })),
      },
    };

    getSupabaseAdmin.mockReturnValue(supabase);
    enforceUploadAccess.mockResolvedValue({
      allowed: true,
      limited: false,
      response: null,
      user: null,
    });
  });

  it("creates anonymous signed upload URLs when under the rate limit", async () => {
    const response = await POST(
      new Request("https://example.com/api/upload/signed-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: "creative.png",
          mimeType: "image/png",
          fileSize: 1024,
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.bucket).toBe("test_uploads");
    expect(data.token).toBe("signed-token");
    expect(data.signedUrl).toContain("signed-token");
    expect(data.url).toBe("/api/upload/object?token=test-token");
    expect(enforceUploadAccess).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        scope: "api-upload-signed-url",
      }),
    );
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1);
    expect(createBucket).not.toHaveBeenCalled();
  });

  it("skips anonymous rate limiting when a session user is present", async () => {
    enforceUploadAccess.mockResolvedValue({
      allowed: true,
      limited: false,
      response: null,
      user: { id: "user-123" },
    });

    const response = await POST(
      new Request("https://example.com/api/upload/signed-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: "creative.mp4",
          mimeType: "video/mp4",
          fileSize: 2048,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized signed upload requests before issuing a token", async () => {
    const response = await POST(
      new Request("https://example.com/api/upload/signed-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: "creative.pdf",
          mimeType: "application/pdf",
          fileSize: (50 * 1024 * 1024) + 1,
        }),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(413);
    expect(data.error).toContain("Document uploads must be under 50 MB");
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
