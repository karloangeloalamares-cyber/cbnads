import { db, table } from "../../utils/supabase-db.js";
import { getSessionUser, requirePermission } from "../../utils/auth-check.js";
import {
  isCompleteUSPhoneNumber,
  normalizeUSPhoneNumber,
} from "../../../../lib/phone.js";
import { hasSupabaseAdminConfig } from "../../../../lib/supabaseAdmin.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WHATSAPP_E164_LIKE_REGEX = /^\+?\d{8,15}$/;

const isRecoverablePreferencesError = (error) => {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || error || "").trim();
  return (
    !hasSupabaseAdminConfig ||
    code === "PGRST204" ||
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    /does not exist/i.test(message) ||
    /Supabase admin is not configured/i.test(message)
  );
};

const isMissingWhatsAppPreferencesColumnsError = (error) => {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || error || "").trim().toLowerCase();
  return (
    code === "PGRST204" ||
    code === "42703" ||
    message.includes("whatsapp_recipients") ||
    message.includes("whatsapp_settings")
  );
};

const normalizeTelegramChatIds = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = [];
  const seen = new Set();

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const chatId = String(entry.chat_id || "").trim();
    if (!chatId) {
      continue;
    }

    const key = chatId.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    normalized.push({
      id: String(entry.id || chatId).trim() || chatId,
      label: String(entry.label || chatId).trim() || chatId,
      chat_id: chatId,
      is_active: entry.is_active !== false,
      created_at: entry.created_at || null,
      updated_at: entry.updated_at || null,
    });
  }

  return normalized;
};

const normalizeWhatsAppPhone = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  const normalized = `+${digits}`;
  return WHATSAPP_E164_LIKE_REGEX.test(normalized) ? normalized : "";
};

const normalizeWhatsAppRecipients = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = [];
  const seen = new Set();

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const phone = normalizeWhatsAppPhone(
      entry.phone_e164 || entry.phone || entry.to || entry.recipient,
    );
    if (!phone) {
      continue;
    }

    const key = phone.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    normalized.push({
      id: String(entry.id || phone).trim() || phone,
      label: String(entry.label || phone).trim() || phone,
      phone_e164: phone,
      is_active: entry.is_active !== false,
      created_at: entry.created_at || null,
      updated_at: entry.updated_at || null,
    });
  }

  return normalized;
};

const WHATSAPP_SEND_MODES = new Set(["text", "template", "auto"]);

const normalizeWhatsAppSettings = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const sendModeRaw = String(
    source?.send_mode || source?.default_send_mode || "text",
  )
    .trim()
    .toLowerCase();
  const sendMode = WHATSAPP_SEND_MODES.has(sendModeRaw) ? sendModeRaw : "text";
  const templateName = String(source?.template_name || "").trim();
  const templateLanguage = String(source?.template_language || "en_US").trim() || "en_US";

  return {
    enabled: source?.enabled !== false,
    include_media: source?.include_media !== false,
    use_template_fallback: source?.use_template_fallback === true,
    send_mode: sendMode,
    template_name: templateName || null,
    template_language: templateLanguage,
  };
};

const normalizePreferences = (row, fallbackEmail = "") => ({
  email_enabled: row?.email_enabled ?? true,
  sms_enabled: row?.sms_enabled ?? false,
  reminder_time_value: row?.reminder_time_value ?? 1,
  reminder_time_unit: row?.reminder_time_unit ?? "hours",
  email_address: row?.email_address ?? fallbackEmail,
  phone_number: normalizeUSPhoneNumber(row?.phone_number ?? ""),
  sound_enabled: row?.sound_enabled ?? true,
  telegram_chat_ids: normalizeTelegramChatIds(row?.telegram_chat_ids),
  whatsapp_recipients: normalizeWhatsAppRecipients(row?.whatsapp_recipients),
  whatsapp_settings: normalizeWhatsAppSettings(row?.whatsapp_settings),
});

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

export async function GET(request) {
  let email = "";
  try {
    if (!hasSupabaseAdminConfig) {
      return Response.json({
        preferences: normalizePreferences(null, ""),
        degraded: true,
      });
    }

    const auth = await requirePermission("notifications:view", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const user = await getSessionUser(request);
    email = String(user?.email || "").trim();
    const userId = UUID_REGEX.test(String(user?.id || "")) ? String(user.id) : null;
    const supabase = db();

    const row = await findPreferenceRow(supabase, userId, email);
    return Response.json({
      preferences: normalizePreferences(row, email),
    });
  } catch (err) {
    console.error("GET /api/admin/notification-preferences error", err);
    return Response.json({
      preferences: normalizePreferences(null, email),
      degraded: true,
      recoverable: isRecoverablePreferencesError(err),
    });
  }
}

export async function POST(request) {
  try {
    if (!hasSupabaseAdminConfig) {
      return Response.json(
        { error: "Admin notification preferences are unavailable in this environment" },
        { status: 503 },
      );
    }

    const auth = await requirePermission("notifications:view", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const user = await getSessionUser(request);
    const email = String(user?.email || "").trim();
    const userId = UUID_REGEX.test(String(user?.id || "")) ? String(user.id) : null;
    const body = await request.json();
    const normalizedPhoneNumber = normalizeUSPhoneNumber(body?.phone_number || "");
    const includesTelegramChatIds = Object.prototype.hasOwnProperty.call(
      body || {},
      "telegram_chat_ids",
    );
    const includesWhatsAppRecipients = Object.prototype.hasOwnProperty.call(
      body || {},
      "whatsapp_recipients",
    );
    const includesWhatsAppSettings = Object.prototype.hasOwnProperty.call(
      body || {},
      "whatsapp_settings",
    );
    const normalizedWhatsAppRecipients = normalizeWhatsAppRecipients(body?.whatsapp_recipients);

    if (normalizedPhoneNumber && !isCompleteUSPhoneNumber(normalizedPhoneNumber)) {
      return Response.json(
        { error: "Phone number must be a complete US number" },
        { status: 400 },
      );
    }

    if (
      includesWhatsAppRecipients &&
      Array.isArray(body?.whatsapp_recipients) &&
      body.whatsapp_recipients.length > 0 &&
      normalizedWhatsAppRecipients.length === 0
    ) {
      return Response.json(
        { error: "Provide at least one valid WhatsApp recipient in E.164 format." },
        { status: 400 },
      );
    }

    const patch = {
      email_enabled: Boolean(body?.email_enabled),
      sms_enabled: Boolean(body?.sms_enabled),
      reminder_time_value: Number(body?.reminder_time_value) || 1,
      reminder_time_unit: body?.reminder_time_unit || "hours",
      email_address: body?.email_address || email || null,
      phone_number: normalizedPhoneNumber || null,
      sound_enabled: body?.sound_enabled !== undefined ? Boolean(body.sound_enabled) : true,
      updated_at: new Date().toISOString(),
    };
    if (includesTelegramChatIds) {
      patch.telegram_chat_ids = normalizeTelegramChatIds(body?.telegram_chat_ids);
    }
    if (includesWhatsAppRecipients) {
      patch.whatsapp_recipients = normalizedWhatsAppRecipients;
    }
    if (includesWhatsAppSettings) {
      patch.whatsapp_settings = normalizeWhatsAppSettings(body?.whatsapp_settings);
    }

    const supabase = db();
    let saved = null;
    let degradedMissingWhatsAppColumns = false;

    const writeRow = async () => {
      const fallbackPatch = {
        ...patch,
      };
      delete fallbackPatch.whatsapp_recipients;
      delete fallbackPatch.whatsapp_settings;

      if (userId) {
        const payload = {
          ...patch,
          user_id: userId,
        };
        let result = await supabase
          .from(table("admin_notification_preferences"))
          .upsert(payload, { onConflict: "user_id" })
          .select("*")
          .single();

        if (result.error && isMissingWhatsAppPreferencesColumnsError(result.error)) {
          degradedMissingWhatsAppColumns = true;
          result = await supabase
            .from(table("admin_notification_preferences"))
            .upsert(
              {
                ...fallbackPatch,
                user_id: userId,
              },
              { onConflict: "user_id" },
            )
            .select("*")
            .single();
        }

        if (result.error) throw result.error;
        saved = result.data;
      } else {
        const existing = await findPreferenceRow(supabase, null, email);
        if (existing?.id) {
          let result = await supabase
            .from(table("admin_notification_preferences"))
            .update(patch)
            .eq("id", existing.id)
            .select("*")
            .single();

          if (result.error && isMissingWhatsAppPreferencesColumnsError(result.error)) {
            degradedMissingWhatsAppColumns = true;
            result = await supabase
              .from(table("admin_notification_preferences"))
              .update(fallbackPatch)
              .eq("id", existing.id)
              .select("*")
              .single();
          }

          if (result.error) throw result.error;
          saved = result.data;
        } else {
          let result = await supabase
            .from(table("admin_notification_preferences"))
            .insert({
              ...patch,
              user_id: null,
              created_at: new Date().toISOString(),
            })
            .select("*")
            .single();

          if (result.error && isMissingWhatsAppPreferencesColumnsError(result.error)) {
            degradedMissingWhatsAppColumns = true;
            result = await supabase
              .from(table("admin_notification_preferences"))
              .insert({
                ...fallbackPatch,
                user_id: null,
                created_at: new Date().toISOString(),
              })
              .select("*")
              .single();
          }

          if (result.error) throw result.error;
          saved = result.data;
        }
      }
    };

    await writeRow();

    return Response.json({
      success: true,
      preferences: normalizePreferences(saved, email),
      degraded: degradedMissingWhatsAppColumns,
      warning: degradedMissingWhatsAppColumns
        ? "WhatsApp recipient columns are not available yet. Apply the latest migration."
        : null,
    });
  } catch (err) {
    if (isRecoverablePreferencesError(err)) {
      return Response.json(
        { error: "Admin notification preferences schema is unavailable" },
        { status: 503 },
      );
    }

    console.error("POST /api/admin/notification-preferences error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
