import { db, table } from "../../utils/supabase-db.js";
import crypto from "node:crypto";

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseSignature(signatureHeader) {
  const normalized = String(signatureHeader || "").trim();
  if (!normalized.toLowerCase().startsWith("sha256=")) {
    return "";
  }
  return normalized.slice(7).trim().toLowerCase();
}

function hasValidSignature(request, rawBody) {
  if (!WHATSAPP_APP_SECRET) {
    console.error("[whatsapp] Missing WHATSAPP_APP_SECRET.");
    return false;
  }

  const providedHex = parseSignature(request.headers.get("x-hub-signature-256"));
  if (!/^[a-f0-9]{64}$/.test(providedHex)) {
    return false;
  }

  const expectedHex = crypto
    .createHmac("sha256", WHATSAPP_APP_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");

  const provided = Buffer.from(providedHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

function summarizeStatusUpdate(statusItem = {}) {
  const errors = Array.isArray(statusItem.errors)
    ? statusItem.errors.map((entry) => ({
        code: entry?.code ?? null,
        title: entry?.title || entry?.message || "",
        details: entry?.details || "",
      }))
    : [];

  return {
    message_id: statusItem.id || null,
    recipient_id: statusItem.recipient_id || null,
    status: statusItem.status || "unknown",
    timestamp: statusItem.timestamp || null,
    conversation_id: statusItem?.conversation?.id || null,
    conversation_type: statusItem?.conversation?.origin?.type || null,
    pricing_category: statusItem?.pricing?.category || null,
    pricing_model: statusItem?.pricing?.pricing_model || null,
    billable:
      typeof statusItem?.pricing?.billable === "boolean"
        ? statusItem.pricing.billable
        : null,
    errors,
  };
}

// GET: Webhook verification step required by Meta
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode && token) {
    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  return new Response("Unauthorized", { status: 401 });
}

// POST: Handle incoming WhatsApp message payloads (Ad approvals/declines)
export async function POST(request) {
  try {
    const rawBody = await request.text();
    if (!hasValidSignature(request, rawBody)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Verify this is an event from the WhatsApp Business API
    if (body.object !== "whatsapp_business_account") {
      return new Response("Not a WhatsApp event", { status: 404 });
    }

    // Process the entries in the payload
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === "messages") {
          const value = change.value || {};

          if (Array.isArray(value.statuses) && value.statuses.length > 0) {
            for (const statusItem of value.statuses) {
              const summary = summarizeStatusUpdate(statusItem);
              if (summary.status === "failed" || summary.errors.length > 0) {
                console.error("[whatsapp] Delivery status update (failed):", summary);
              } else {
                console.log("[whatsapp] Delivery status update:", summary);
              }
            }
          }

          if (value.messages && value.messages.length > 0) {
            const message = value.messages[0];

            // We only care about interactive button replies
            if (message.type === "interactive" && message.interactive.type === "button_reply") {
              const buttonReply = message.interactive.button_reply;
              const payloadId = String(buttonReply?.id || "").trim();

              // Extract action and Ad ID from the button ID string
              const [action, adId] = payloadId.split("_");

              if (!adId) {
                console.error("No Ad ID found in button payload:", payloadId);
                continue; // Skip this message
              }
              if (!isUuid(adId)) {
                console.error("Invalid Ad ID format in button payload:", payloadId);
                continue;
              }

              let newStatus = null;
              if (action === "approve") {
                newStatus = "approved";
              } else if (action === "decline") {
                newStatus = "not_approved";
              }

              // Update the Ad's status in Supabase if a valid action was detected
              if (newStatus) {
                const supabaseAdmin = db();
                const now = new Date().toISOString();

                const { error } = await supabaseAdmin
                  .from(table("pending_ads"))
                  .update({
                    status: newStatus,
                    updated_at: now,
                    ...(newStatus === "not_approved" ? { review_notes: "Declined via WhatsApp" } : {})
                  })
                  .eq("id", adId);

                if (error) {
                  console.error(`Failed to update Ad ${adId} to ${newStatus}:`, error.message);
                } else {
                  console.log(`Ad ${adId} successfully marked as ${newStatus} via WhatsApp webhook.`);
                }
              }
            }
          }
        }
      }
    }

    // Always return a 200 OK to acknowledge receipt to Meta
    return new Response("OK", { status: 200 });

  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error);
    // Even on error, we usually want to return 200 to prevent Meta from retrying the failed message
    return new Response("Internal Server Error", { status: 500 });
  }
}
