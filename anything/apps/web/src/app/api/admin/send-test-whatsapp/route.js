import { requirePermission } from "../../utils/auth-check.js";
import {
  sendWhatsAppMessageDetailed,
  sendWhatsAppTemplateDetailed,
} from "../../utils/send-whatsapp.js";

const E164_LIKE_PATTERN = /^\+?\d{8,15}$/;

function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

const toTemplateParams = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
};

export async function POST(request) {
  try {
    const auth = await requirePermission("whatsapp:view", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const defaultRecipient = process.env.WHATSAPP_BROADCAST_NUMBER;
    const to = normalizePhone(body?.to || defaultRecipient);
    if (!to) {
      return Response.json(
        {
          error:
            "Recipient number is required. Provide `to` in the request body or set WHATSAPP_BROADCAST_NUMBER.",
        },
        { status: 400 },
      );
    }

    if (!E164_LIKE_PATTERN.test(to)) {
      return Response.json(
        {
          error: "Recipient number must look like E.164 (example: 639064746034 or +639064746034).",
        },
        { status: 400 },
      );
    }

    const text =
      String(body?.text || "").trim() ||
      `CBN Ads WhatsApp test (${new Date().toISOString()})`;

    const configuredTemplateName = String(process.env.WHATSAPP_ADMIN_TEMPLATE_NAME || "").trim();
    const configuredTemplateLanguage = String(
      process.env.WHATSAPP_ADMIN_TEMPLATE_LANGUAGE || "en_US",
    ).trim() || "en_US";

    const requestedTemplateName = String(body?.template_name || "").trim();
    const requestedTemplateLanguage = String(body?.template_language || "").trim();
    const templateName = requestedTemplateName || configuredTemplateName;
    const templateLanguage = requestedTemplateLanguage || configuredTemplateLanguage;
    const templateBodyParams = toTemplateParams(body?.template_body_params);

    const hasExplicitText = Boolean(String(body?.text || "").trim());
    const shouldUseTemplate =
      body?.use_template === true ||
      (body?.use_template !== false && !hasExplicitText && Boolean(templateName));
    const templateOnly = body?.template_only === true;
    const sendTextAfterTemplate = body?.send_text_after_template === true;

    let templateResult = null;
    if (shouldUseTemplate) {
      if (!templateName) {
        if (templateOnly) {
          return Response.json(
            { success: false, error: "Template mode requested but no template is configured." },
            { status: 400 },
          );
        }
      } else {
        templateResult = await sendWhatsAppTemplateDetailed({
          to,
          templateName,
          languageCode: templateLanguage,
          bodyParameters: templateBodyParams,
        });
      }
    }

    if (templateResult?.ok && (templateOnly || !sendTextAfterTemplate)) {
      return Response.json({
        success: true,
        to,
        used_default_recipient: !body?.to,
        send_mode: "template",
        template_name: templateName,
        message_id: templateResult.messageId || null,
        delivery_state: "accepted_by_meta",
        message: `WhatsApp API accepted template '${templateName}' for ${to}.`,
      });
    }

    const textResult = await sendWhatsAppMessageDetailed({ to, text });
    if (!textResult.ok) {
      if (templateResult?.ok) {
        return Response.json({
          success: true,
          to,
          used_default_recipient: !body?.to,
          send_mode: "template_with_text_fallback_failure",
          template_name: templateName,
          template_message_id: templateResult.messageId || null,
          message_id: templateResult.messageId || null,
          delivery_state: "accepted_by_meta",
          warning: "Template accepted, but follow-up text failed.",
          text_error: textResult.error || "Failed to send follow-up text message.",
          text_upstream_status: textResult.status || null,
        });
      }

      return Response.json(
        {
          success: false,
          error: textResult.error || "Failed to send WhatsApp test message.",
          upstream_status: textResult.status || null,
          ...(templateResult?.error
            ? {
                template_error: templateResult.error,
                template_upstream_status: templateResult.status || null,
              }
            : {}),
        },
        { status: 502 },
      );
    }

    const mode = templateResult?.ok ? "template_then_text" : "text";

    return Response.json({
      success: true,
      to,
      used_default_recipient: !body?.to,
      send_mode: mode,
      template_name: templateResult?.ok ? templateName : null,
      template_message_id: templateResult?.ok ? templateResult.messageId || null : null,
      message_id: textResult.messageId || templateResult?.messageId || null,
      delivery_state: "accepted_by_meta",
      message:
        mode === "template_then_text"
          ? `WhatsApp API accepted template '${templateName}' and follow-up text for ${to}.`
          : `WhatsApp API accepted the text message to ${to}.`,
    });
  } catch (err) {
    console.error("POST /api/admin/send-test-whatsapp error", err);
    return Response.json(
      { error: err?.message || "Failed to send WhatsApp test message" },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  return POST(request);
}
