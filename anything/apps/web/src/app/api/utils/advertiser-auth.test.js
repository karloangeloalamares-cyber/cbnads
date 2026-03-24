// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
  },
}));

vi.mock("./supabase-db.js", () => ({
  db: vi.fn(() => mockSupabase),
  table: vi.fn((name) => name),
}));

vi.mock("./send-email.js", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("../../../lib/timezone.js", () => ({
  APP_TIME_ZONE: "America/New_York",
}));

vi.mock("../../../lib/phone.js", () => ({
  normalizeUSPhoneNumber: vi.fn((value) => value),
}));

import { upsertAdvertiserProfile } from "./advertiser-auth.js";

const makeDefaultTenantQuery = (tenantId = "tenant-1") => ({
  select: vi.fn(() => ({
    not: vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: tenantId ? { tenant_id: tenantId } : null,
            error: null,
          }),
        })),
      })),
    })),
  })),
});

const makeUpsertConflictQuery = () => ({
  upsert: vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "42P10",
          message:
            "there is no unique or exclusion constraint matching the ON CONFLICT specification",
        },
      }),
    })),
  })),
});

const makeExistingProfileQuery = (profile) => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({
        data: profile,
        error: null,
      }),
    })),
  })),
});

describe("upsertAdvertiserProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to insert when profiles id upsert conflicts are unsupported", async () => {
    const insertSingle = vi.fn().mockImplementation(async () => ({
      data: {
        id: "user-1",
        advertiser_id: "adv-1",
        email: "jordan@example.com",
        role: "Advertiser",
      },
      error: null,
    }));

    const insertQuery = {
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: insertSingle,
        })),
      })),
    };

    mockSupabase.from
      .mockImplementationOnce(() => makeDefaultTenantQuery())
      .mockImplementationOnce(() => makeUpsertConflictQuery())
      .mockImplementationOnce(() => makeExistingProfileQuery(null))
      .mockImplementationOnce(() => insertQuery);

    const result = await upsertAdvertiserProfile({
      userId: "user-1",
      advertiserId: "adv-1",
      email: "Jordan@example.com",
      fullName: "Jordan Smith",
      onboardingComplete: false,
    });

    expect(result).toMatchObject({
      id: "user-1",
      advertiser_id: "adv-1",
      email: "jordan@example.com",
      role: "Advertiser",
    });
    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-1",
        tenant_id: "tenant-1",
        advertiser_id: "adv-1",
        full_name: "Jordan Smith",
        email: "jordan@example.com",
        role: "Advertiser",
        timezone: "America/New_York",
        onboarding_complete: false,
      }),
    );
  });

  it("falls back to update when the profile row already exists", async () => {
    const updateSingle = vi.fn().mockImplementation(async () => ({
      data: {
        id: "user-1",
        advertiser_id: "adv-2",
        email: "jordan@example.com",
        full_name: "Jordan Smith",
      },
      error: null,
    }));

    const updateQuery = {
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: updateSingle,
          })),
        })),
      })),
    };

    mockSupabase.from
      .mockImplementationOnce(() => makeDefaultTenantQuery())
      .mockImplementationOnce(() => makeUpsertConflictQuery())
      .mockImplementationOnce(() => makeExistingProfileQuery({ id: "user-1" }))
      .mockImplementationOnce(() => updateQuery);

    const result = await upsertAdvertiserProfile({
      userId: "user-1",
      advertiserId: "adv-2",
      email: "Jordan@example.com",
      fullName: "Jordan Smith",
      onboardingComplete: true,
    });

    expect(result).toMatchObject({
      id: "user-1",
      advertiser_id: "adv-2",
      email: "jordan@example.com",
      full_name: "Jordan Smith",
    });
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-1",
        tenant_id: "tenant-1",
        advertiser_id: "adv-2",
        email: "jordan@example.com",
        onboarding_complete: true,
      }),
    );
  });
});
