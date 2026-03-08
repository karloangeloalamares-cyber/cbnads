/**
 * @file send-whatsapp.js
 * Utility functions for interacting with the Meta WhatsApp Business Cloud API.
 */

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;

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
    const response = await fetch(WHATSAPP_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[whatsapp] Meta API Error:", errBody);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[whatsapp] Network Error:", error);
    return false;
  }
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
export async function sendWhatsAppMessage({ to, text, media }) {
  if (!WHATSAPP_API_URL || !WHATSAPP_API_TOKEN) {
    console.warn("[whatsapp] Missing API URL or Token. Cannot send broadcast message.");
    return false;
  }

  // Send the media block first if it exists
  if (media && media.url) {
    const mediaPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: media.type === "video" ? "video" : "image",
      [media.type === "video" ? "video" : "image"]: {
        link: media.url,
        caption: text // We can append the caption directly to the media to save a message
      }
    };

    try {
      const response = await fetch(WHATSAPP_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WHATSAPP_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(mediaPayload)
      });
      
      if (!response.ok) {
        console.error("[whatsapp] Failed to send media:", await response.text());
        return false;
      }
      return true; // Sent purely as a captioned media message
    } catch (err) {
      console.error("[whatsapp] Media Network Error:", err);
      return false;
    }
  }

  // Fallback to text only if no media
  const textPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "text",
    text: {
      preview_url: false,
      body: text
    }
  };

  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(textPayload)
    });

    if (!response.ok) {
       console.error("[whatsapp] Failed to send text msg:", await response.text());
       return false;
    }
    return true;
  } catch (err) {
    console.error("[whatsapp] Text Network Error:", err);
    return false;
  }
}
