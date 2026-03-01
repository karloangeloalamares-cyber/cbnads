import { db } from "../../../utils/supabase-db.js";
import {
  assertAdvertiserEmailConfig,
  createAdvertiserVerificationToken,
  ensureAdvertiserRecord,
  findAuthUserByEmail,
  normalizeEmail,
  sendAdvertiserVerificationEmail,
  updatePendingAdAccountEmail,
  upsertAdvertiserProfile,
} from "../../../utils/advertiser-auth.js";
import { getTodayInAppTimeZone } from "../../../../../lib/timezone.js";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 8;

const getRateLimitStore = () => {
  const globalKey = "__cbnadsAdvertiserSignupRateLimit";
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = new Map();
  }
  return globalThis[globalKey];
};

const clientIpFromHeaders = (headers) => {
  const forwarded = String(headers.get("x-forwarded-for") || "").trim();
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return String(headers.get("x-real-ip") || "").trim();
};

const isRateLimited = (key) => {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const store = getRateLimitStore();

  for (const [entryKey, timestamps] of store.entries()) {
    const filtered = timestamps.filter((value) => value >= cutoff);
    if (filtered.length === 0) {
      store.delete(entryKey);
      continue;
    }
    store.set(entryKey, filtered);
  }

  const attempts = store.get(key) || [];
  if (attempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    return true;
  }
  store.set(key, [...attempts, now]);
  return false;
};

const buildMetadata = ({
  existingMetadata,
  advertiserId,
  pendingAdId,
  advertiserName,
  contactName,
}) => ({
  ...(existingMetadata || {}),
  role: "Advertiser",
  advertiser_id: advertiserId,
  pending_ad_id: pendingAdId || null,
  advertiser_name: advertiserName || null,
  full_name: contactName || advertiserName || null,
  account_verified: false,
  signup_source: "submit_ad",
});

export async function POST(request) {
  try {
    assertAdvertiserEmailConfig();

    const requesterIp = clientIpFromHeaders(request.headers) || "unknown";
    const body = await request.json();
    const pendingAdId = String(body.pendingAdId || "").trim();
    const advertiserName = String(body.advertiserName || "").trim();
    const contactName = String(body.contactName || "").trim();
    const phoneNumber = String(body.phoneNumber || "").trim();
    const normalizedEmail = normalizeEmail(body.email);
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");

    const rateLimitKey = `${requesterIp}:${normalizedEmail}:${getTodayInAppTimeZone()}`;
    if (isRateLimited(rateLimitKey)) {
      return Response.json(
        { error: "Too many account setup attempts. Please try again later." },
        { status: 429 },
      );
    }

    if (!normalizedEmail || !password || !confirmPassword) {
      return Response.json(
        { error: "Email, password, and verify password are required." },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    if (password !== confirmPassword) {
      return Response.json({ error: "Passwords do not match." }, { status: 400 });
    }

    const advertiser = await ensureAdvertiserRecord({
      advertiserName,
      contactName,
      email: normalizedEmail,
      phoneNumber,
    });

    if (pendingAdId) {
      await updatePendingAdAccountEmail({
        pendingAdId,
        email: normalizedEmail,
        advertiserId: advertiser.id,
      });
    }

    const supabase = db();
    const existingUser = await findAuthUserByEmail(supabase, normalizedEmail);
    const fullName = contactName || advertiserName || normalizedEmail;
    let authUser = existingUser;

    if (existingUser) {
      const existingRole = String(
        existingUser?.user_metadata?.role ||
          existingUser?.app_metadata?.role ||
          "",
      ).toLowerCase();

      if (existingRole && existingRole !== "advertiser") {
        return Response.json(
          {
            error:
              "This email is already in use by a non-advertiser account. Please use a different email.",
          },
          { status: 409 },
        );
      }

      if (existingUser?.user_metadata?.account_verified === true) {
        return Response.json(
          {
            error: "An advertiser account already exists for this email. Please sign in.",
          },
          { status: 409 },
        );
      }

      const { data, error } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        {
          password,
          user_metadata: buildMetadata({
            existingMetadata: existingUser.user_metadata,
            advertiserId: advertiser.id,
            pendingAdId,
            advertiserName,
            contactName: fullName,
          }),
          app_metadata: {
            ...(existingUser.app_metadata || {}),
            role: "Advertiser",
            advertiser_id: advertiser.id,
          },
        },
      );

      if (error) {
        throw error;
      }

      authUser = data.user;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: buildMetadata({
          advertiserId: advertiser.id,
          pendingAdId,
          advertiserName,
          contactName: fullName,
        }),
        app_metadata: {
          role: "Advertiser",
          advertiser_id: advertiser.id,
        },
      });

      if (error) {
        throw error;
      }

      authUser = data.user;
    }

    if (!authUser?.id) {
      throw new Error("Failed to create advertiser account");
    }

    await upsertAdvertiserProfile({
      userId: authUser.id,
      advertiserId: advertiser.id,
      email: normalizedEmail,
      fullName,
      onboardingComplete: false,
    });

    const verificationToken = createAdvertiserVerificationToken({
      userId: authUser.id,
      email: normalizedEmail,
      advertiserId: advertiser.id,
      pendingAdId,
    });

    await sendAdvertiserVerificationEmail({
      request,
      email: normalizedEmail,
      contactName: fullName,
      verificationToken,
    });

    return Response.json({
      success: true,
      email: normalizedEmail,
      advertiserId: advertiser.id,
      pendingAdId,
      verificationRequired: true,
    });
  } catch (error) {
    console.error("[submit-ad/account] Failed to create advertiser account:", error);
    return Response.json(
      { error: error?.message || "Failed to create advertiser account." },
      { status: 500 },
    );
  }
}
