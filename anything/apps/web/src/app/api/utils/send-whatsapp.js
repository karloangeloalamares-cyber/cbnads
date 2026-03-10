/**
 * @file send-whatsapp.js
 * Utility functions for interacting with the Meta WhatsApp Business Cloud API.
 */

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const MAX_WHATSAPP_TEXT_BODY_LENGTH = 4096;
const MAX_WHATSAPP_MEDIA_CAPTION_LENGTH = 1024;
const MAX_WHATSAPP_TEMPLATE_PARAM_LENGTH = 1024;

function clampWhatsAppText(value, maxLength) {
  const normalized = String(value ?? "");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const suffix = "\n\n...[truncated]";
  const allowed = Math.max(0, maxLength - suffix.length);
  return `${normalized.slice(0, allowed)}${suffix}`;
}

async function postWhatsAppPayload(payload, errorPrefix) {
  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawBody = await response.text();
    let parsedBody = null;
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = null;
      }
    }

    if (!response.ok) {
      const errorText = rawBody || `${errorPrefix}: request failed`;
      console.error("[whatsapp] Meta API Error:", errorText);
      return {
        ok: false,
        status: response.status,
        error: errorText,
        body: parsedBody,
      };
    }

    return {
      ok: true,
      status: response.status,
      body: parsedBody,
      messageId: parsedBody?.messages?.[0]?.id || null,
    };
  } catch (error) {
    const errorText = error?.message || String(error);
    console.error("[whatsapp] Network Error:", error);
    return {
      ok: false,
      status: 0,
      error: errorText,
      body: null,
    };
  }
}

/**
 * Sends an interactive WhatsApp message with Approve/Decline buttons to the admin.
 * Assumes you have configured a WhatsApp Message Template named "ad_approval" 
 * with two quick-reply buttons.
 * 
 * @param {string} to - The recipient's phone number with country code (e.g. "15551234567")
 * @param {string} adId - The UUID of the pending ad
 * @param {string} advertiserName - Name of who submitted the ad
 * @param {string} adName - Name of the Ad
 */
export async function sendWhatsAppInteractive({ to, adId, advertiserName, adName }) {
  if (!WHATSAPP_API_URL || !WHATSAPP_API_TOKEN) {
    console.warn("[whatsapp] Missing API URL or Token. Cannot send interactive message.");
    return false;
  }

  // NOTE: You must have an approved template named "ad_approval" in Meta Business Manager.
  // We use the button payload to encode the Ad ID and the action.
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "template",
    template: {
      name: "ad_approval", // Change this to your actual template name in Meta
      language: {
        code: "en_US"
      },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: advertiserName || "Unknown Advertiser" },
            { type: "text", text: adName || "Untitled Ad" }
          ]
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "0",
          parameters: [
            { type: "payload", payload: `approve_${adId}` }
          ]
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "1",
          parameters: [
            { type: "payload", payload: `decline_${adId}` }
          ]
        }
      ]
    }
  };

  try {
    const result = await postWhatsAppPayload(payload, "Failed to send interactive template");
    return result.ok;
  } catch (error) {
    console.error("[whatsapp] Network Error:", error);
    return false;
  }
}

export async function sendWhatsAppTemplateDetailed({
  to,
  templateName,
  languageCode = "en_US",
  bodyParameters = [],
}) {
  if (!WHATSAPP_API_URL || !WHATSAPP_API_TOKEN) {
    console.warn("[whatsapp] Missing API URL or Token. Cannot send template message.");
    return {
      ok: false,
      status: 0,
      error: "Missing API URL or Token",
      body: null,
      messageId: null,
      phase: "template",
    };
  }

  const normalizedTemplateName = String(templateName || "").trim();
  if (!normalizedTemplateName) {
    return {
      ok: false,
      status: 0,
      error: "Template name is required.",
      body: null,
      messageId: null,
      phase: "template",
    };
  }

  const normalizedParameters = Array.isArray(bodyParameters)
    ? bodyParameters
        .map((value) => clampWhatsAppText(value, MAX_WHATSAPP_TEMPLATE_PARAM_LENGTH).trim())
        .filter(Boolean)
    : [];

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: normalizedTemplateName,
      language: {
        code: String(languageCode || "").trim() || "en_US",
      },
      ...(normalizedParameters.length > 0
        ? {
            components: [
              {
                type: "body",
                parameters: normalizedParameters.map((text) => ({
                  type: "text",
                  text,
                })),
              },
            ],
          }
        : {}),
    },
  };

  const templateResult = await postWhatsAppPayload(payload, "Failed to send template message");
  return {
    ...templateResult,
    phase: "template",
  };
}

/**
 * Sends a standard WhatsApp message (text + optional image/video) to a broadcast list.
 * Note: If sending outside of the 24-hour customer service window, you MUST use an approved template.
 * For freeform messages, the user must have messaged you within the last 24 hours.
 * 
 * @param {string} to - The recipient's phone number with country code
 * @param {string} text - The body of the message
 * @param {Object} [media] - Optional media object { type: 'image' | 'video', url: string }
 */
export async function sendWhatsAppMessageDetailed({ to, text, media }) {
  if (!WHATSAPP_API_URL || !WHATSAPP_API_TOKEN) {
    console.warn("[whatsapp] Missing API URL or Token. Cannot send broadcast message.");
    return {
      ok: false,
      status: 0,
      error: "Missing API URL or Token",
      body: null,
      messageId: null,
    };
  }

  const textBody = clampWhatsAppText(text, MAX_WHATSAPP_TEXT_BODY_LENGTH);
  const mediaCaption = clampWhatsAppText(text, MAX_WHATSAPP_MEDIA_CAPTION_LENGTH);

  // Send the media block first if it exists
  if (media && media.url) {
    const mediaPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: media.type === "video" ? "video" : "image",
      [media.type === "video" ? "video" : "image"]: {
        link: media.url,
        caption: mediaCaption // Keep caption within Meta's media caption length limit.
      }
    };

    const mediaResult = await postWhatsAppPayload(mediaPayload, "Failed to send media");
    return {
      ...mediaResult,
      phase: "media",
    };
  }

  // Fallback to text only if no media
  const textPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "text",
    text: {
      preview_url: false,
      body: textBody
    }
  };

  const textResult = await postWhatsAppPayload(textPayload, "Failed to send text message");
  return {
    ...textResult,
    phase: "text",
  };
}

export async function sendWhatsAppMessage({ to, text, media }) {
  const result = await sendWhatsAppMessageDetailed({ to, text, media });
  return result.ok;
}
