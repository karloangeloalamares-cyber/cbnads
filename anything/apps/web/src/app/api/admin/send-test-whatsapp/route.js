import { db, table } from "../../utils/supabase-db.js";
import { requirePermission } from "../../utils/auth-check.js";
import {
  sendWhatsAppMessageDetailed,
  sendWhatsAppTemplateDetailed,
} from "../../utils/send-whatsapp.js";

const E164_LIKE_PATTERN = /^\+?\d{8,15}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

function normalizeSendMode(value, fallback = "text") {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "text" || mode === "template" || mode === "auto") {
    return mode;
  }
  return fallback;
}

function toRecipientList(value) {
  const source = Array.isArray(value) ? value : [];
  const normalized = [];
  const seen = new Set();

  for (const entry of source) {
    const number = normalizePhone(
      typeof entry === "string"
        ? entry
        : entry?.phone_e164 || entry?.phone || entry?.to || entry?.recipient,
    );
    if (!number) {
      continue;
    }
    const key = number.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(number);
  }

  return normalized;
}

const toTemplateParams = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
};

const toWhatsAppMedia = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const type = String(value?.type || "").trim().toLowerCase();
  const url = String(value?.url || value?.cdnUrl || "").trim();

  if (!url) {
    return { error: "Media URL is required when media is provided." };
  }

  if (type !== "image" && type !== "video") {
    return { error: "Media type must be 'image' or 'video'." };
  }

  return { type, url };
};

const normalizeStoredWhatsAppRecipients = (value) => {
  const source = Array.isArray(value) ? value : [];
  const normalized = [];
  const seen = new Set();

  for (const entry of source) {
    if (!entry || typeof entry !== "object" || entry.is_active === false) {
      continue;
    }
    const number = normalizePhone(entry.phone_e164 || entry.phone || entry.to || "");
    if (!number) {
      continue;
    }
    const key = number.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(number);
  }

  return normalized;
};

const normalizeStoredWhatsAppSettings = (value) => {
  const source = value && typeof value === "object" ? value : {};
  return {
    enabled: source?.enabled !== false,
    include_media: source?.include_media !== false,
    use_template_fallback: source?.use_template_fallback === true,
    send_mode: normalizeSendMode(source?.send_mode, "text"),
    template_name: String(source?.template_name || "").trim(),
    template_language: String(source?.template_language || "en_US").trim() || "en_US",
  };
};

async function findPreferenceRow(supabase, userId, email) {
  if (userId) {
    const { data, error } = await supabase
      .from(table("admin_notification_preferences"))
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (email) {
    const { data, error } = await supabase
      .from(table("admin_notification_preferences"))
      .select("*")
      .ilike("email_address", email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  return null;
}

async function resolveSavedWhatsAppConfig(user) {
  const userId = UUID_REGEX.test(String(user?.id || "")) ? String(user.id) : null;
  const email = String(user?.email || "").trim();
  if (!userId && !email) {
    return {
      recipients: [],
      settings: normalizeStoredWhatsAppSettings(null),
    };
  }

  try {
    const row = await findPreferenceRow(db(), userId, email);
    return {
      recipients: normalizeStoredWhatsAppRecipients(row?.whatsapp_recipients),
      settings: normalizeStoredWhatsAppSettings(row?.whatsapp_settings),
    };
  } catch (error) {
    console.error("[whatsapp] Failed to resolve saved recipients/settings:", error);
    return {
      recipients: [],
      settings: normalizeStoredWhatsAppSettings(null),
    };
  }
}

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

    const explicitTo = normalizePhone(body?.to);
    const explicitRecipientList = toRecipientList(
      body?.to_recipients || body?.recipients || body?.tos,
    );
    const useSavedRecipients = body?.use_saved_recipients !== false;
    const savedConfig = await resolveSavedWhatsAppConfig(auth.user);
    const savedRecipients = useSavedRecipients ? savedConfig.recipients : [];
    const fallbackRecipient = normalizePhone(process.env.WHATSAPP_BROADCAST_NUMBER);

    let recipients = [];
    let recipientSource = "none";

    if (explicitTo) {
      recipients = [explicitTo];
      recipientSource = "body_to";
    } else if (explicitRecipientList.length > 0) {
      recipients = explicitRecipientList;
      recipientSource = "body_list";
    } else if (savedRecipients.length > 0) {
      recipients = savedRecipients;
      recipientSource = "saved_recipients";
    } else if (fallbackRecipient) {
      recipients = [fallbackRecipient];
      recipientSource = "env";
    }

    if (recipients.length === 0) {
      return Response.json(
        {
          error:
            "Recipient number is required. Provide `to`, `to_recipients`, configure active WhatsApp recipients, or set WHATSAPP_BROADCAST_NUMBER.",
        },
        { status: 400 },
      );
    }

    if (
      recipientSource === "saved_recipients" &&
      savedConfig.settings.enabled === false &&
      body?.ignore_channel_enabled !== true
    ) {
      return Response.json(
        {
          error:
            "WhatsApp channel is disabled in settings. Enable it or provide an explicit `to` recipient.",
        },
        { status: 400 },
      );
    }

    const invalidRecipients = recipients.filter((entry) => !E164_LIKE_PATTERN.test(entry));
    if (invalidRecipients.length > 0) {
      return Response.json(
        {
          error: "Recipient number must look like E.164 (example: 639064746034 or +639064746034).",
          invalid_recipients: invalidRecipients,
        },
        { status: 400 },
      );
    }

    const hasTextField = Object.prototype.hasOwnProperty.call(body || {}, "text");
    const text = hasTextField
      ? String(body?.text || "").trim()
      : `CBN Ads WhatsApp test (${new Date().toISOString()})`;
    const media = toWhatsAppMedia(body?.media);
    if (media?.error) {
      return Response.json({ success: false, error: media.error }, { status: 400 });
    }

    const includeMedia =
      body?.include_media !== undefined
        ? body.include_media !== false
        : savedConfig.settings.include_media !== false;
    const mediaForSend = includeMedia ? media : null;

    const configuredTemplateName = String(process.env.WHATSAPP_ADMIN_TEMPLATE_NAME || "").trim();
    const configuredTemplateLanguage = String(
      process.env.WHATSAPP_ADMIN_TEMPLATE_LANGUAGE || "en_US",
    ).trim() || "en_US";

    const requestedTemplateName = String(body?.template_name || "").trim();
    const requestedTemplateLanguage = String(body?.template_language || "").trim();
    const templateName =
      requestedTemplateName || savedConfig.settings.template_name || configuredTemplateName;
    const templateLanguage =
      requestedTemplateLanguage ||
      savedConfig.settings.template_language ||
      configuredTemplateLanguage;
    const templateBodyParams = toTemplateParams(body?.template_body_params);

    const hasExplicitText = Boolean(String(body?.text || "").trim());
    const effectiveSendMode = normalizeSendMode(
      body?.send_mode,
      normalizeSendMode(savedConfig.settings.send_mode, "text"),
    );
    const templateFallbackEnabled =
      body?.use_template_fallback === true ||
      (body?.use_template_fallback !== false &&
        savedConfig.settings.use_template_fallback === true);
    const shouldUseTemplate =
      body?.use_template === true ||
      (body?.use_template !== false &&
        Boolean(templateName) &&
        (effectiveSendMode === "template" || !hasExplicitText)) ||
      (body?.use_template !== false &&
        !hasExplicitText &&
        templateFallbackEnabled &&
        Boolean(templateName));
    const templateOnly = body?.template_only === true;
    const sendTextAfterTemplate = body?.send_text_after_template === true;

    const sendToRecipient = async (to) => {
      let templateResult = null;
      if (shouldUseTemplate) {
        if (!templateName) {
          if (templateOnly) {
            return {
              success: false,
              to,
              error: "Template mode requested but no template is configured.",
              upstream_status: 400,
            };
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
        return {
          success: true,
          to,
          send_mode: "template",
          template_name: templateName,
          message_id: templateResult.messageId || null,
          delivery_state: "accepted_by_meta",
          message: `WhatsApp API accepted template '${templateName}' for ${to}.`,
        };
      }

      const followUpResult = await sendWhatsAppMessageDetailed({ to, text, media: mediaForSend });
      if (!followUpResult.ok) {
        if (templateResult?.ok) {
          return {
            success: true,
            to,
            send_mode: "template_with_text_fallback_failure",
            template_name: templateName,
            template_message_id: templateResult.messageId || null,
            message_id: templateResult.messageId || null,
            delivery_state: "accepted_by_meta",
            warning: "Template accepted, but follow-up message failed.",
            text_error: followUpResult.error || "Failed to send follow-up message.",
            text_upstream_status: followUpResult.status || null,
          };
        }

        return {
          success: false,
          to,
          error: followUpResult.error || "Failed to send WhatsApp test message.",
          upstream_status: followUpResult.status || null,
          ...(templateResult?.error
            ? {
                template_error: templateResult.error,
                template_upstream_status: templateResult.status || null,
              }
            : {}),
        };
      }

      const followUpMode = followUpResult?.phase === "media" ? "media" : "text";
      const mode = templateResult?.ok ? `template_then_${followUpMode}` : followUpMode;

      return {
        success: true,
        to,
        send_mode: mode,
        template_name: templateResult?.ok ? templateName : null,
        template_message_id: templateResult?.ok ? templateResult.messageId || null : null,
        message_id: followUpResult.messageId || templateResult?.messageId || null,
        delivery_state: "accepted_by_meta",
        message:
          mode === "template_then_media"
            ? `WhatsApp API accepted template '${templateName}' and follow-up media for ${to}.`
            : mode === "template_then_text"
              ? `WhatsApp API accepted template '${templateName}' and follow-up text for ${to}.`
              : mode === "media"
                ? `WhatsApp API accepted the media message to ${to}.`
                : `WhatsApp API accepted the text message to ${to}.`,
      };
    };

    const results = [];
    for (const recipient of recipients) {
      const result = await sendToRecipient(recipient);
      results.push(result);
    }

    const successful = results.filter((entry) => entry.success);
    const failed = results.filter((entry) => !entry.success);
    const usedDefaultRecipient = recipientSource === "env" || recipientSource === "saved_recipients";

    if (results.length === 1) {
      const single = results[0];
      if (!single.success) {
        return Response.json(
          {
            success: false,
            to: single.to || null,
            error: single.error || "Failed to send WhatsApp message.",
            upstream_status: single.upstream_status || null,
            ...(single.template_error
              ? {
                  template_error: single.template_error,
                  template_upstream_status: single.template_upstream_status || null,
                }
              : {}),
          },
          { status: 502 },
        );
      }

      return Response.json({
        ...single,
        used_default_recipient: usedDefaultRecipient,
        recipient_source: recipientSource,
      });
    }

    const primary = successful[0] || results[0];
    const isPartialSuccess = successful.length > 0 && failed.length > 0;
    const status = failed.length === 0 ? 200 : isPartialSuccess ? 207 : 502;

    return Response.json(
      {
        success: failed.length === 0,
        partial_success: isPartialSuccess,
        recipient_source: recipientSource,
        used_default_recipient: usedDefaultRecipient,
        requested_recipient_count: recipients.length,
        successful_count: successful.length,
        failed_count: failed.length,
        to: primary?.to || null,
        send_mode: primary?.send_mode || null,
        message_id: primary?.message_id || null,
        warning: failed.length > 0 ? `${failed.length} recipient(s) failed.` : null,
        recipients: results,
      },
      { status },
    );
  } catch (err) {
    console.error("POST /api/admin/send-test-whatsapp error", err);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  return POST(request);
}
