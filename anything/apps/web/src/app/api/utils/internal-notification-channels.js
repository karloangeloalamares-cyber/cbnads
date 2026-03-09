import { table } from "./supabase-db.js";
import { resolveInternalNotificationEmails } from "./internal-notification-emails.js";
import { sendEmail } from "./send-email.js";
import { resolveActiveTelegramChatIds, sendTelegramToMany } from "./send-telegram.js";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const uniqueValues = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

const uniqueEmails = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeEmail(value))
        .filter(Boolean),
    ),
  );

export async function resolveInternalNotificationTargets(
  supabase,
  { excludeEmails = [] } = {},
) {
  const excluded = new Set(uniqueEmails(excludeEmails));
  let emails = [];
  let telegramChatIds = [];
  let targetError = null;

  try {
    emails = (await resolveInternalNotificationEmails(supabase)).filter(
      (email) => !excluded.has(normalizeEmail(email)),
    );
  } catch (error) {
    targetError = error;
    console.error("[internal-notifications] Failed to resolve internal emails:", error);
  }

  try {
    const { data, error } = await supabase
      .from(table("admin_notification_preferences"))
      .select("telegram_chat_ids");
    if (error) {
      throw error;
    }
    telegramChatIds = resolveActiveTelegramChatIds(data || []);
  } catch (error) {
    if (!targetError) {
      targetError = error;
    }
    console.error("[internal-notifications] Failed to resolve Telegram chats:", error);
  }

  return {
    emails: uniqueEmails(emails),
    telegram_chat_ids: uniqueValues(telegramChatIds),
    error: targetError,
  };
}

export async function notifyInternalChannels({
  supabase,
  emailSubject,
  emailHtml,
  telegramText,
  excludeEmails = [],
}) {
  const targets = await resolveInternalNotificationTargets(supabase, {
    excludeEmails,
  });

  const result = {
    emails: targets.emails,
    telegram_chat_ids: targets.telegram_chat_ids,
    email_sent: false,
    telegram_sent: false,
    email_error: null,
    telegram_error: null,
    telegram_results: [],
    target_error: targets.error ? String(targets.error?.message || targets.error) : null,
  };

  if (emailSubject && emailHtml && targets.emails.length > 0) {
    try {
      await sendEmail({
        bcc: targets.emails,
        subject: emailSubject,
        html: emailHtml,
      });
      result.email_sent = true;
    } catch (error) {
      result.email_error = String(error?.message || error || "Failed to send internal email.");
      console.error("[internal-notifications] Failed to send internal email:", error);
    }
  }

  if (telegramText && targets.telegram_chat_ids.length > 0) {
    try {
      const telegramResults = await sendTelegramToMany({
        chatIds: targets.telegram_chat_ids,
        text: telegramText,
      });
      result.telegram_results = telegramResults;
      result.telegram_sent = telegramResults.some((entry) => entry?.ok === true);
      if (!result.telegram_sent) {
        result.telegram_error = "Failed to send Telegram message to all configured chats.";
      }
    } catch (error) {
      result.telegram_error = String(
        error?.message || error || "Failed to send internal Telegram notification.",
      );
      console.error("[internal-notifications] Failed to send Telegram notification:", error);
    }
  }

  return result;
}
