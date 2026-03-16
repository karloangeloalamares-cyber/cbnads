import { db, table } from "../utils/supabase-db.js";
import {
  getRequestStatusForError,
  isAdvertiserUser,
  requireAuth,
  requireAdminOrAdvertiser,
  resolveAdvertiserScope,
  matchesAdvertiserScope,
} from "../utils/auth-check.js";
import { createPendingAdSubmission } from "../utils/pending-ad-submission.js";
import { isCompleteUSPhoneNumber, normalizeUSPhoneNumber } from "../../../lib/phone.js";

const submissionPriority = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "pending") return 1;
  if (normalized === "not_approved") return 2;
  if (normalized === "approved") return 3;
  return 4;
};

const isMissingColumnError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    String(error?.code || "").trim() === "42703" ||
    String(error?.code || "").trim() === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the")
  );
};

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
};

const pickCompleteUSPhoneNumber = (...values) => {
  for (const value of values) {
    const normalized = normalizeUSPhoneNumber(value || "");
    if (isCompleteUSPhoneNumber(normalized)) {
      return normalized;
    }
  }
  return "";
};

const ADVERTISER_SELECT_VARIANTS = [
  "id, advertiser_name, contact_name, email, phone_number, phone",
  "id, advertiser_name, contact_name, email, phone_number",
  "id, advertiser_name, contact_name, email, phone",
  "id, advertiser_name, contact_name, email",
];

const queryAdvertiserWithFallbackColumns = async (
  supabase,
  { advertiserId = "", advertiserEmail = "", advertiserName = "" },
) => {
  const normalizedId = String(advertiserId || "").trim();
  const normalizedEmail = String(advertiserEmail || "").trim().toLowerCase();
  const normalizedName = String(advertiserName || "").trim();

  for (const selectColumns of ADVERTISER_SELECT_VARIANTS) {
    let query = supabase.from(table("advertisers")).select(selectColumns);

    if (normalizedId) {
      query = query.eq("id", normalizedId);
    } else if (normalizedEmail) {
      query = query.ilike("email", normalizedEmail).limit(1);
    } else if (normalizedName) {
      query = query.eq("advertiser_name", normalizedName).limit(1);
    } else {
      return null;
    }

    const { data, error } = await query.maybeSingle();
    if (!error) {
      return data || null;
    }

    if (!isMissingColumnError(error)) {
      throw error;
    }
  }

  return null;
};

export async function GET(request) {
  try {
    const auth = await requireAdminOrAdvertiser(request);
    if (!auth.authorized) {
      return Response.json(
        { error: auth.error },
        { status: auth.status || getRequestStatusForError(auth.error) },
      );
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = String(searchParams.get("status") || "").trim().toLowerCase();
    const search = String(searchParams.get("search") || "").trim().toLowerCase();
    const includeApproved = searchParams.get("includeApproved") === "true";

    const supabase = db();
    const { data, error } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const advertiserScope = isAdvertiserUser(auth.user)
      ? await resolveAdvertiserScope(auth.user)
      : null;

    let submissions = (data || []).filter((item) => {
      if (!includeApproved && String(item.status || "").trim().toLowerCase() === "approved") {
        return false;
      }

      if (!advertiserScope) {
        return true;
      }

      return matchesAdvertiserScope(item, advertiserScope, {
        advertiserNameFields: ["advertiser_name", "advertiser"],
        emailFields: ["email", "contact_email"],
      });
    });

    if (statusFilter && statusFilter !== "all") {
      submissions = submissions.filter(
        (item) => String(item.status || "").trim().toLowerCase() === statusFilter,
      );
    }

    if (search) {
      submissions = submissions.filter((item) => {
        const haystack = [
          item.ad_name,
          item.advertiser_name,
          item.email,
          item.post_type,
          item.notes,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return haystack.includes(search);
      });
    }

    submissions.sort((left, right) => {
      const byPriority = submissionPriority(left.status) - submissionPriority(right.status);
      if (byPriority !== 0) {
        return byPriority;
      }

      const leftTime = new Date(left.created_at || 0).valueOf();
      const rightTime = new Date(right.created_at || 0).valueOf();
      return rightTime - leftTime;
    });

    return Response.json({ submissions });
  } catch (error) {
    console.error("Error fetching submissions:", error);
    return Response.json({ error: "Failed to fetch submissions" }, { status: 500 });
  }
}

const loadAdvertiserForScope = async (supabase, scope) => {
  const advertiserId = String(scope?.id || "").trim();
  const advertiserEmail = String(scope?.email || "").trim().toLowerCase();
  const advertiserName = String(scope?.name || "").trim();

  if (advertiserId) {
    const data = await queryAdvertiserWithFallbackColumns(supabase, {
      advertiserId,
    });
    if (data?.id) {
      return data;
    }
  }

  if (advertiserEmail) {
    const data = await queryAdvertiserWithFallbackColumns(supabase, {
      advertiserEmail,
    });
    if (data?.id) {
      return data;
    }
  }

  if (advertiserName) {
    const data = await queryAdvertiserWithFallbackColumns(supabase, {
      advertiserName,
    });
    if (data?.id) {
      return data;
    }
  }

  return null;
};

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return Response.json(
        { error: auth.error },
        { status: auth.status || getRequestStatusForError(auth.error) },
      );
    }

    if (!isAdvertiserUser(auth.user)) {
      return Response.json(
        { error: "Unauthorized - Advertiser access required" },
        { status: 403 },
      );
    }

    const supabase = db();
    const scope = await resolveAdvertiserScope(auth.user);
    const advertiser = await loadAdvertiserForScope(supabase, scope);
    const body = await request.json();
    const normalizedProductId = String(body?.product_id || "").trim();

    const canonicalAdvertiserName =
      String(advertiser?.advertiser_name || scope?.name || auth.user?.advertiser_name || "").trim();
    const canonicalEmail =
      String(advertiser?.email || scope?.email || auth.user?.email || "").trim().toLowerCase();
    const canonicalContactName = pickFirstNonEmpty(
      advertiser?.contact_name,
      auth.user?.name,
      body?.contact_name,
      canonicalAdvertiserName,
      canonicalEmail,
    );
    const canonicalPhoneNumber = pickCompleteUSPhoneNumber(
      advertiser?.phone_number,
      advertiser?.phone,
      auth.user?.whatsapp_number,
      auth.user?.phone_number,
      auth.user?.phone,
      body?.phone_number,
    );

    if (!canonicalAdvertiserName || !canonicalEmail) {
      return Response.json(
        { error: "Advertiser account is not linked correctly. Please contact support." },
        { status: 403 },
      );
    }

    const result = await createPendingAdSubmission({
      request,
      supabase,
      requireProductForMultiWeek: false,
      submission: {
        ...body,
        product_id: normalizedProductId || null,
        advertiser_id: advertiser?.id || scope?.id || auth.user?.advertiser_id || null,
        advertiser_name: canonicalAdvertiserName,
        email: canonicalEmail,
        contact_name: canonicalContactName,
        phone_number: canonicalPhoneNumber,
      },
      requirePhoneNumber: false,
    });

    if (result?.error) {
      return Response.json(
        {
          error: result.error,
          fully_booked_dates: result.fully_booked_dates,
        },
        { status: result.status || 400 },
      );
    }

    return Response.json({
      success: true,
      pending_ad: result.pendingAd,
    });
  } catch (error) {
    console.error("Error creating advertiser submission:", error);
    const message = String(error?.message || "").trim();
    const isInvalidAdvertiserId = /invalid input syntax for type uuid/i.test(message);
    const isSchemaMismatch = isMissingColumnError(error);

    if (isInvalidAdvertiserId) {
      return Response.json(
        { error: "Your advertiser account link is invalid. Please contact support." },
        { status: 400 },
      );
    }

    if (isSchemaMismatch) {
      return Response.json(
        {
          error:
            "Submission service schema is out of date. Please run the latest database migrations.",
        },
        { status: 500 },
      );
    }

    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
