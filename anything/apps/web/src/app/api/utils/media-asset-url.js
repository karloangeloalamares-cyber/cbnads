import crypto from "node:crypto";

const TOKEN_TYPE = "media_asset";

const readServerEnv = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
};

const requireMediaAssetSecret = () => {
  const secret = readServerEnv("AUTH_SECRET", "NEXTAUTH_SECRET", "SUPABASE_SERVICE_ROLE_KEY");
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
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
};

const signValue = (value) =>
  crypto
    .createHmac("sha256", requireMediaAssetSecret())
    .update(value)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

export const createMediaAssetToken = ({ bucket, path }) => {
  const payload = {
    type: TOKEN_TYPE,
    bucket: String(bucket || "").trim(),
    path: String(path || "").trim(),
  };

  if (!payload.bucket || !payload.path) {
    throw new Error("Media asset bucket and path are required.");
  }

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
};

export const verifyMediaAssetToken = (token) => {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid media asset token");
  }

  const expectedSignature = signValue(encodedPayload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length) {
    throw new Error("Invalid media asset token");
  }

  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error("Invalid media asset token");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (payload?.type !== TOKEN_TYPE) {
    throw new Error("Invalid media asset token");
  }

  const bucket = String(payload?.bucket || "").trim();
  const path = String(payload?.path || "").trim();
  if (!bucket || !path) {
    throw new Error("Invalid media asset token");
  }

  return { bucket, path };
};

export const buildMediaAssetUrl = ({ bucket, path }) =>
  `/api/upload/object?token=${encodeURIComponent(createMediaAssetToken({ bucket, path }))}`;
