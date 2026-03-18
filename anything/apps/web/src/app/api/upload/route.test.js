// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/upload-access.js", () => ({
  enforceUploadAccess: vi.fn(),
}));

vi.mock("../../../lib/supabaseAdmin.js", () => ({
  adminBucketName: vi.fn((baseName) => `test_${baseName}`),
  getSupabaseAdmin: vi.fn(),
}));

import { enforceUploadAccess } from "../utils/upload-access.js";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin.js";
import { POST } from "./route.js";

describe("upload route", () => {
  let supabase;
  let listBuckets;
  let createBucket;
  let upload;
  let getPublicUrl;

  beforeEach(() => {
    vi.clearAllMocks();

    listBuckets = vi.fn().mockResolvedValue({
      data: [{ name: "test_uploads" }],
      error: null,
    });
    createBucket = vi.fn().mockResolvedValue({ error: null });
    upload = vi.fn().mockResolvedValue({ error: null });
    getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://example.com/ad-media/test.png" },
    });

    supabase = {
      storage: {
        listBuckets,
        createBucket,
        from: vi.fn(() => ({
          upload,
          getPublicUrl,
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

  it("allows anonymous octet-stream uploads when under the rate limit", async () => {
    const response = await POST(
      new Request("https://example.com/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent("creative.png"),
          "X-Mime-Type": "image/png",
        },
        body: Uint8Array.from([1, 2, 3, 4]),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe("https://example.com/ad-media/test.png");
    expect(data.mimeType).toBe("image/png");
    expect(enforceUploadAccess).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        scope: "api-upload",
      }),
    );
    expect(upload).toHaveBeenCalledTimes(1);
    expect(createBucket).not.toHaveBeenCalled();
  });

  it("returns 429 when anonymous uploads are rate limited", async () => {
    enforceUploadAccess.mockResolvedValue({
      allowed: false,
      limited: true,
      response: Response.json(
        { error: "Too many uploads. Please try again later." },
        { status: 429 },
      ),
      user: null,
    });

    const response = await POST(
      new Request("https://example.com/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: Uint8Array.from([1, 2, 3]),
      }),
    );

    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBe("Too many uploads. Please try again later.");
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });
});
