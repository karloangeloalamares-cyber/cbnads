import crypto from "node:crypto";
import { db } from "../../utils/supabase-db.js";
import {
  applySolaPaymentPayload,
  findInvoiceFromSolaPayload,
} from "../../utils/sola-payment-processing.js";

const SOLA_PAYMENTS_WEBHOOK_PIN = String(
  process.env.SOLA_PAYMENTS_WEBHOOK_PIN || process.env.SOLA_WEBHOOK_PIN || "",
).trim();
const SOLA_PAYMENTS_DEBUG_WEBHOOK =
  String(process.env.SOLA_PAYMENTS_DEBUG_WEBHOOK || "").trim().toLowerCase() === "true";

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const parseWebhookPayload = (rawBody) => {
  const params = new URLSearchParams(rawBody);
  const payload = {};

  for (const [key, value] of params.entries()) {
    if (!(key in payload)) {
      payload[key] = value;
    }
  }

  return payload;
};

const buildSignatureString = (rawBody) => {
  const params = new URLSearchParams(rawBody);
  const normalized = [];

  for (const [key, value] of params.entries()) {
    normalized.push([String(key || "").toLowerCase(), value]);
  }

  normalized.sort(([left], [right]) => left.localeCompare(right));
  return normalized.map(([, value]) => value).join("") + SOLA_PAYMENTS_WEBHOOK_PIN;
};

const buildExpectedSignature = (rawBody) => {
  if (!SOLA_PAYMENTS_WEBHOOK_PIN) {
    return "";
  }

  return crypto
    .createHash("md5")
    .update(buildSignatureString(rawBody), "utf8")
    .digest("hex")
    .toLowerCase();
};

const hasValidSignature = (request, rawBody) => {
  if (!SOLA_PAYMENTS_WEBHOOK_PIN) {
    return false;
  }

  const provided = String(request.headers.get("ck-signature") || "").trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(provided)) {
    return false;
  }

  const expected = buildExpectedSignature(rawBody);

  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
};

const logWebhookDebug = (request, rawBody) => {
  if (!SOLA_PAYMENTS_DEBUG_WEBHOOK) {
    return;
  }

  console.log("[webhook/sola] Debug capture", {
    url: request.url,
    content_type: request.headers.get("content-type"),
    signature_header: String(request.headers.get("ck-signature") || "").trim() || null,
    expected_signature: buildExpectedSignature(rawBody) || null,
    raw_body: rawBody,
  });
};

const isApprovedPaymentEvent = (payload) => {
  const result = normalizeText(payload?.xResult || payload?.xresult);
  const responseResult = normalizeText(
    payload?.xResponseResult || payload?.xStatus || payload?.xresponseresult || payload?.xstatus,
  );
  const command = normalizeText(payload?.xCommand || payload?.xcommand);

  const approved = result === "a" || responseResult === "approved";
  if (!approved) {
    return false;
  }

  if (!command) {
    return true;
  }

  if (
    command.includes("save") ||
    command.includes("avsonly") ||
    command.includes("credit") ||
    command.includes("refund") ||
    command.includes("void") ||
    command.includes("reverse")
  ) {
    return false;
  }

  return true;
};

export async function GET() {
  return Response.json({
    ok: true,
    provider: "sola",
  });
}

export async function POST(request) {
  try {
    if (!SOLA_PAYMENTS_WEBHOOK_PIN) {
      console.error("[webhook/sola] Missing SOLA_PAYMENTS_WEBHOOK_PIN.");
      return Response.json({ error: "Webhook not configured" }, { status: 503 });
    }

    const rawBody = await request.text();
    logWebhookDebug(request, rawBody);

    if (!hasValidSignature(request, rawBody)) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = parseWebhookPayload(rawBody);
    if (!isApprovedPaymentEvent(payload)) {
      return Response.json({
        received: true,
        processed: false,
        reason: "ignored_event",
      });
    }

    const supabase = db();
    const invoice = await findInvoiceFromSolaPayload(supabase, payload);
    if (!invoice?.id) {
      return Response.json({
        received: true,
        processed: false,
        reason: "invoice_not_found",
      });
    }

    return Response.json(await applySolaPaymentPayload({ request, supabase, payload }));
  } catch (error) {
    console.error("[webhook/sola] Failed:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
