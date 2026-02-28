import crypto from "node:crypto";
import { db, table } from "./supabase-db.js";
import { sendEmail } from "./send-email.js";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const TOKEN_TYPE = "advertiser_verify";

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
  const configured = String(process.env.APP_URL || process.env.AUTH_URL || "").trim();
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

  if (!String(process.env.AUTH_SECRET || "").trim()) {
    missing.push("AUTH_SECRET");
  }

  if (!String(process.env.APP_URL || process.env.AUTH_URL || "").trim()) {
    missing.push("APP_URL or AUTH_URL");
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
    .createHmac("sha256", String(process.env.AUTH_SECRET || ""))
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

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find(
      (item) => normalizeEmail(item?.email) === normalizedEmail,
    );

    if (match) {
      return match;
    }

    if (users.length < 200) {
      break;
    }
  }

  return null;
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

export const ensureAdvertiserRecord = async ({
  advertiserName,
  contactName,
  email,
  phoneNumber,
}) => {
  const supabase = db();
  const normalizedEmail = normalizeEmail(email);

  const { data: existing, error: fetchError } = await supabase
    .from(table("advertisers"))
    .select("*")
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  const payload = {
    advertiser_name: String(advertiserName || "").trim() || normalizedEmail,
    contact_name: String(contactName || "").trim() || null,
    email: normalizedEmail,
    phone: String(phoneNumber || "").trim() || null,
    phone_number: String(phoneNumber || "").trim() || null,
    status: "active",
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from(table("advertisers"))
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await supabase
    .from(table("advertisers"))
    .insert({
      ...payload,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
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

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        tenant_id: tenantId,
        role: "Advertiser",
        advertiser_id: advertiserId || null,
        full_name: String(fullName || "").trim() || normalizeEmail(email),
        email: normalizeEmail(email),
        onboarding_complete: Boolean(onboardingComplete),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

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
            src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
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
