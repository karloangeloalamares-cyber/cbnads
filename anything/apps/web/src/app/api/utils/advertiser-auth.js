import crypto from "node:crypto";
import { db, table } from "./supabase-db.js";
import { sendEmail } from "./send-email.js";
import { APP_TIME_ZONE } from "../../../lib/timezone.js";
import { normalizeUSPhoneNumber } from "../../../lib/phone.js";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const TOKEN_TYPE = "advertiser_verify";

const readServerEnv = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
};

const getAdvertiserVerificationSecret = () =>
  readServerEnv("AUTH_SECRET", "NEXTAUTH_SECRET", "SUPABASE_SERVICE_ROLE_KEY");

const requireAdvertiserVerificationSecret = () => {
  const secret = getAdvertiserVerificationSecret();
  if (!secret) {
    throw new Error("Missing configuration: AUTH_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  }
  return secret;
};

const base64UrlEncode = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const base64UrlDecode = (value) => {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
};

export const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

export const getAdvertiserAuthBaseUrl = (request) => {
  const configured = readServerEnv(
    "APP_URL",
    "AUTH_URL",
    "NEXT_PUBLIC_APP_URL",
    "VITE_APP_URL",
  );
  if (configured) {
    try {
      return new URL(configured).toString().replace(/\/$/, "");
    } catch {
      // Fall back to the request origin below.
    }
  }

  try {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "http://localhost:4000";
  }
};

export const assertAdvertiserVerificationConfig = () => {
  const missing = [];

  if (!getAdvertiserVerificationSecret()) {
    missing.push("AUTH_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    throw new Error(`Missing configuration: ${missing.join(", ")}`);
  }
};

export const assertAdvertiserEmailConfig = () => {
  assertAdvertiserVerificationConfig();

  if (!String(process.env.RESEND_API_KEY || "").trim()) {
    throw new Error("Missing configuration: RESEND_API_KEY");
  }
};

const signValue = (value) =>
  crypto
    .createHmac("sha256", requireAdvertiserVerificationSecret())
    .update(value)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

export const createAdvertiserVerificationToken = ({
  userId,
  email,
  advertiserId,
  pendingAdId,
}) => {
  const payload = {
    type: TOKEN_TYPE,
    sub: userId,
    email: normalizeEmail(email),
    advertiserId: advertiserId || null,
    pendingAdId: pendingAdId || null,
    nonce: crypto.randomBytes(12).toString("hex"),
    exp: Date.now() + TOKEN_TTL_MS,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
};

export const verifyAdvertiserVerificationToken = (token) => {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid verification token");
  }

  const expectedSignature = signValue(encodedPayload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length) {
    throw new Error("Invalid verification token");
  }
  const isMatch = crypto.timingSafeEqual(providedBuffer, expectedBuffer);

  if (!isMatch) {
    throw new Error("Invalid verification token");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (payload?.type !== TOKEN_TYPE) {
    throw new Error("Invalid verification token");
  }

  if (!payload?.sub || !payload?.email) {
    throw new Error("Invalid verification token");
  }

  if (Number(payload.exp) <= Date.now()) {
    throw new Error("Verification link has expired");
  }

  return payload;
};

export const findAuthUserByEmail = async (supabase, email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  // Supabase auth-js listUsers() does not support an email filter. Passing a
  // `filter` key is ignored, which can cause false positives if we only read
  // the first returned user. Perform an exact email match across paginated
  // results instead.
  const perPage = 200;
  let page = 1;

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const users = Array.isArray(data?.users) ? data.users : [];
    const matchedUser = users.find(
      (user) => normalizeEmail(user?.email) === normalizedEmail,
    );

    if (matchedUser) {
      return matchedUser;
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }
};

const getDefaultTenantId = async (supabase) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("tenant_id")
    .not("tenant_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.tenant_id || null;
};

const isProfilesIdOnConflictError = (error) => {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").trim();
  return (
    code === "42P10" ||
    /no unique or exclusion constraint matching the ON CONFLICT specification/i.test(
      message,
    )
  );
};

const buildAdvertiserProfilePayload = ({
  userId,
  advertiserId,
  email,
  fullName,
  onboardingComplete,
  tenantId,
}) => ({
  id: userId,
  tenant_id: tenantId,
  role: "Advertiser",
  advertiser_id: advertiserId || null,
  full_name: String(fullName || "").trim() || normalizeEmail(email),
  email: normalizeEmail(email),
  timezone: APP_TIME_ZONE,
  onboarding_complete: Boolean(onboardingComplete),
  updated_at: new Date().toISOString(),
});

export const ensureAdvertiserRecord = async ({
  advertiserName,
  contactName,
  email,
  phoneNumber,
}) => {
  const supabase = db();
  const normalizedEmail = normalizeEmail(email);
  const normalizedAdvertiserName = String(advertiserName || "").trim();

  const normalizedPhoneNumber = normalizeUSPhoneNumber(phoneNumber || "");
  const now = new Date().toISOString();

  const basePayload = {
    advertiser_name: normalizedAdvertiserName || normalizedEmail,
    contact_name: String(contactName || "").trim() || null,
    email: normalizedEmail,
    phone: normalizedPhoneNumber || null,
    updated_at: now,
  };

  const extendedPayload = {
    ...basePayload,
    phone_number: normalizedPhoneNumber || null,
    status: "active",
  };

  // Prefer an atomic email upsert when email is present. This prevents race
  // conditions from creating duplicate advertiser rows for the same email.
  if (normalizedEmail) {
    let upsertResult = await supabase
      .from(table("advertisers"))
      .upsert(extendedPayload, { onConflict: "email" })
      .select("*");

    if (upsertResult.error) {
      const message = String(upsertResult.error.message || "");
      const missingCompatColumn =
        message.includes("phone_number") || message.includes("status");
      if (!missingCompatColumn) {
        throw upsertResult.error;
      }

      upsertResult = await supabase
        .from(table("advertisers"))
        .upsert(basePayload, { onConflict: "email" })
        .select("*");
      if (upsertResult.error) {
        throw upsertResult.error;
      }
    }

    const upsertedRow = Array.isArray(upsertResult.data)
      ? upsertResult.data[0] || null
      : null;
    if (!upsertedRow) {
      throw new Error("Failed to upsert advertiser record.");
    }
    return upsertedRow;
  }

  let existing = null;
  if (normalizedAdvertiserName) {
    const { data, error } = await supabase
      .from(table("advertisers"))
      .select("*")
      .ilike("advertiser_name", normalizedAdvertiserName)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }
    existing = data || null;
  }

  if (existing?.id) {
    let updateResult = await supabase
      .from(table("advertisers"))
      .update(extendedPayload)
      .eq("id", existing.id)
      .select("*");

    if (updateResult.error) {
      const message = String(updateResult.error.message || "");
      const missingCompatColumn =
        message.includes("phone_number") || message.includes("status");
      if (!missingCompatColumn) {
        throw updateResult.error;
      }

      updateResult = await supabase
        .from(table("advertisers"))
        .update(basePayload)
        .eq("id", existing.id)
        .select("*");
      if (updateResult.error) {
        throw updateResult.error;
      }
    }

    const updatedRow = Array.isArray(updateResult.data)
      ? updateResult.data[0] || null
      : null;
    if (!updatedRow) {
      throw new Error("Failed to update advertiser record.");
    }
    return updatedRow;
  }

  let insertResult = await supabase
    .from(table("advertisers"))
    .insert({
      ...extendedPayload,
      created_at: now,
    })
    .select("*");

  if (insertResult.error) {
    const message = String(insertResult.error.message || "");
    const missingCompatColumn =
      message.includes("phone_number") || message.includes("status");
    if (!missingCompatColumn) {
      throw insertResult.error;
    }

    insertResult = await supabase
      .from(table("advertisers"))
      .insert({
        ...basePayload,
        created_at: now,
      })
      .select("*");
    if (insertResult.error) {
      throw insertResult.error;
    }
  }

  const insertedRow = Array.isArray(insertResult.data)
    ? insertResult.data[0] || null
    : null;
  if (!insertedRow) {
    throw new Error("Failed to insert advertiser record.");
  }
  return insertedRow;
};

export const upsertAdvertiserProfile = async ({
  userId,
  advertiserId,
  email,
  fullName,
  onboardingComplete,
}) => {
  const supabase = db();
  const tenantId = await getDefaultTenantId(supabase);
  const profilePayload = buildAdvertiserProfilePayload({
    userId,
    advertiserId,
    email,
    fullName,
    onboardingComplete,
    tenantId,
  });

  const { data, error } = await supabase
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" })
    .select("*")
    .single();

  if (error && isProfilesIdOnConflictError(error)) {
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfileError) {
      throw existingProfileError;
    }

    if (existingProfile?.id) {
      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update(profilePayload)
        .eq("id", userId)
        .select("*")
        .single();

      if (updateError) {
        throw updateError;
      }

      return updatedProfile;
    }

    const { data: insertedProfile, error: insertError } = await supabase
      .from("profiles")
      .insert(profilePayload)
      .select("*")
      .single();

    if (insertError) {
      throw insertError;
    }

    return insertedProfile;
  }

  if (error) {
    throw error;
  }

  return data;
};

export const updatePendingAdAccountEmail = async ({
  pendingAdId,
  email,
  advertiserId = null,
}) => {
  if (!pendingAdId) {
    return null;
  }

  const supabase = db();
  const payload = {
    email: normalizeEmail(email),
    updated_at: new Date().toISOString(),
  };

  if (advertiserId) {
    payload.advertiser_id = advertiserId;
  }

  let { error } = await supabase
    .from(table("pending_ads"))
    .update(payload)
    .eq("id", pendingAdId);

  // Support environments where the advertiser_id migration has not been applied yet.
  if (
    error &&
    advertiserId &&
    /advertiser_id/i.test(String(error.message || ""))
  ) {
    ({ error } = await supabase
      .from(table("pending_ads"))
      .update({
        email: normalizeEmail(email),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pendingAdId));
  }

  if (error) {
    throw error;
  }

  return true;
};

export const sendAdvertiserVerificationEmail = async ({
  request,
  email,
  contactName,
  verificationToken,
}) => {
  const baseUrl = getAdvertiserAuthBaseUrl(request);
  const verifyUrl = `${baseUrl}/account/verify-advertiser?token=${encodeURIComponent(
    verificationToken,
  )}`;
  const safeName = String(contactName || "").trim() || "there";

  await sendEmail({
    to: normalizeEmail(email),
    subject: "Verify your advertiser account",
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <div style="max-width: 560px; margin: 0 auto; padding: 32px 20px;">
          <img
            src="https://cbnads.com/icons/icon-512.png"
            alt="CBN"
            style="height: 48px; width: auto; margin-bottom: 24px;"
          />
          <h1 style="font-size: 28px; line-height: 1.2; margin: 0 0 16px;">Verify your advertiser account</h1>
          <p style="margin: 0 0 16px;">Hi ${safeName},</p>
          <p style="margin: 0 0 24px;">
            Your ad request was received. To activate your advertiser login, verify your email address using the button below.
          </p>
          <p style="margin: 0 0 24px;">
            <a
              href="${verifyUrl}"
              style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;"
            >
              Verify account
            </a>
          </p>
          <p style="margin: 0 0 12px; font-size: 14px; color: #4b5563;">
            This link expires in 24 hours.
          </p>
          <p style="margin: 0; font-size: 14px; color: #4b5563;">
            If the button does not work, open this link:
          </p>
          <p style="margin: 8px 0 0; font-size: 14px; word-break: break-all;">
            <a href="${verifyUrl}">${verifyUrl}</a>
          </p>
        </div>
      </div>
    `,
  });
};

