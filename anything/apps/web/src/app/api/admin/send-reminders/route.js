import { dateOnly, db, normalizePostType, table, toNumber } from "../../utils/supabase-db.js";
import { requireInternalUser } from "../../utils/auth-check.js";
import { getDefaultEmailSender, sendEmail } from "../../utils/send-email.js";
import { resolveInternalNotificationEmails } from "../../utils/internal-notification-emails.js";
import crypto from "node:crypto";
import {
  sendTelegramMediaToMany,
  sendTelegramToMany,
  resolveActiveTelegramChatIds,
} from "../../utils/send-telegram.js";
import { parseReminderMinutes } from "../../utils/reminder-minutes.js";
import { sendWhatsAppMessageDetailed } from "../../utils/send-whatsapp.js";

const ET_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const WHATSAPP_E164_LIKE_PATTERN = /^\+?\d{8,15}$/;
const SUPPORTED_REMINDER_MEDIA_TYPES = new Set([
  "image",
  "video",
  "audio",
  "document",
]);

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function timingSafeSecretMatch(providedSecret, configuredSecret) {
  const expected = String(configuredSecret || "");
  if (!expected) {
    return false;
  }

  const provided = String(providedSecret || "");
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function parseNaiveDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [year, month, day] = String(dateStr).split("-").map((value) => Number(value));
  const [hour, minute, second] = String(timeStr).split(":").map((value) => Number(value || 0));
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, Number.isFinite(second) ? second : 0));
}

function buildScheduleKey(scheduledAt) {
  if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.valueOf())) {
    return "";
  }
  return scheduledAt.toISOString().slice(0, 19);
}

function createScheduledEntry(scheduledAt, reminderMinutes) {
  if (!scheduledAt) return null;
  const scheduleKey = buildScheduleKey(scheduledAt);
  if (!scheduleKey) return null;
  return {
    scheduledAt,
    reminderMinutes,
    scheduleKey,
  };
}

function getNowInET() {
  const parts = {};
  for (const part of ET_DATE_TIME_FORMATTER.formatToParts(new Date())) {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  }

  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}:${parts.second}`;
  const pseudoDate = parseNaiveDateTime(date, time);

  return {
    date,
    time,
    hour: Number(parts.hour || 0),
    pseudoDate,
  };
}

function computeScheduledEntries(ad, todayET) {
  const type = normalizePostType(ad?.post_type);
  const entries = [];
  const defaultReminderMinutes = parseReminderMinutes(ad?.reminder_minutes, 15);

  if (type === "one_time") {
    const dateStr = dateOnly(ad?.schedule || ad?.post_date_from || ad?.post_date);
    const scheduledAt = parseNaiveDateTime(dateStr, ad?.post_time);
    const scheduledEntry = createScheduledEntry(scheduledAt, defaultReminderMinutes);
    if (scheduledEntry) {
      entries.push(scheduledEntry);
    }
    return entries;
  }

  if (type === "daily_run") {
    const from = dateOnly(ad?.post_date_from || ad?.schedule || ad?.post_date);
    const to = dateOnly(ad?.post_date_to || from);
    if (!from || !to || !ad?.post_time) return entries;
    if (todayET < from || todayET > to) return entries;

    const scheduledAt = parseNaiveDateTime(todayET, ad?.post_time);
    const scheduledEntry = createScheduledEntry(scheduledAt, defaultReminderMinutes);
    if (scheduledEntry) {
      entries.push(scheduledEntry);
    }
    return entries;
  }

  if (type === "custom_schedule") {
    if (!Array.isArray(ad?.custom_dates)) return entries;

    for (const entry of ad.custom_dates) {
      if (typeof entry === "string") {
        const scheduledAt = parseNaiveDateTime(dateOnly(entry), ad?.post_time);
        const scheduledEntry = createScheduledEntry(scheduledAt, defaultReminderMinutes);
        if (scheduledEntry) {
          entries.push(scheduledEntry);
        }
        continue;
      }

      const dateKey = dateOnly(entry?.date);
      const timeValue = entry?.time || ad?.post_time;
      const scheduledAt = parseNaiveDateTime(dateKey, timeValue);
      const scheduledEntry = createScheduledEntry(
        scheduledAt,
        parseReminderMinutes(entry?.reminder, defaultReminderMinutes),
      );
      if (!scheduledEntry) continue;

      entries.push(scheduledEntry);
    }
  }

  return entries.sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());
}

function isWithinReminderWindow(scheduledAt, nowET, windowMinutes) {
  const diffMinutes = (scheduledAt.getTime() - nowET.getTime()) / (1000 * 60);
  return diffMinutes > -5 && diffMinutes <= windowMinutes;
}

function isWithinScheduleTriggerWindow(scheduledAt, nowET, graceMinutes = 5) {
  const diffMinutes = (nowET.getTime() - scheduledAt.getTime()) / (1000 * 60);
  return diffMinutes >= 0 && diffMinutes < graceMinutes;
}

function isReminderEligibleStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === "scheduled" || normalized === "approved";
}

function isMissingScheduleKeyError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes("schedule_key") && (
    text.includes("does not exist") ||
    text.includes("could not find") ||
    text.includes("column") ||
    text.includes("schema cache")
  );
}

async function hasRecentReminderLegacy(supabase, adId, recipientType) {
  const thresholdIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(table("sent_reminders"))
    .select("id")
    .eq("ad_id", adId)
    .eq("recipient_type", recipientType)
    .gt("sent_at", thresholdIso)
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

async function hasReminderForOccurrence(supabase, adId, recipientType, scheduleKey) {
  const { data, error } = await supabase
    .from(table("sent_reminders"))
    .select("id")
    .eq("ad_id", adId)
    .eq("recipient_type", recipientType)
    .eq("schedule_key", scheduleKey)
    .limit(1);
  if (error) {
    if (isMissingScheduleKeyError(error)) {
      return hasRecentReminderLegacy(supabase, adId, recipientType);
    }
    throw error;
  }
  if ((data || []).length > 0) {
    return true;
  }

  // Backward compatibility for reminder rows stored before schedule_key existed.
  const thresholdIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: legacyData, error: legacyError } = await supabase
    .from(table("sent_reminders"))
    .select("id")
    .eq("ad_id", adId)
    .eq("recipient_type", recipientType)
    .is("schedule_key", null)
    .gt("sent_at", thresholdIso)
    .limit(1);
  if (legacyError) {
    if (isMissingScheduleKeyError(legacyError)) {
      return false;
    }
    throw legacyError;
  }
  return (legacyData || []).length > 0;
}

async function storeReminder(supabase, adId, type, recipientType, scheduleKey) {
  const payload = {
    ad_id: adId,
    reminder_type: type,
    recipient_type: recipientType,
    schedule_key: scheduleKey,
    sent_at: new Date().toISOString(),
  };

  const { error } = await supabase.from(table("sent_reminders")).insert(payload);
  if (!error) {
    return;
  }

  if (!isMissingScheduleKeyError(error)) {
    throw error;
  }

  const { error: legacyError } = await supabase.from(table("sent_reminders")).insert({
    ad_id: payload.ad_id,
    reminder_type: payload.reminder_type,
    recipient_type: payload.recipient_type,
    sent_at: payload.sent_at,
  });
  if (legacyError) throw legacyError;
}

function buildMediaFields(media) {
  const items = Array.isArray(media) ? media : [];
  const images = [];
  const videos = [];
  const audios = [];
  const documents = [];
  const fields = {};

  const resolveMediaType = (item) => {
    const declaredType = String(item?.type || "").trim().toLowerCase();
    if (SUPPORTED_REMINDER_MEDIA_TYPES.has(declaredType)) {
      return declaredType;
    }

    const mimeType = String(item?.mimeType || item?.mime_type || "").toLowerCase();
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType === "application/pdf") return "document";

    const source = String(item?.name || item?.url || item?.cdnUrl || "").toLowerCase();
    const extensionIndex = source.lastIndexOf(".");
    const extension = extensionIndex >= 0 ? source.slice(extensionIndex) : "";
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".heic", ".heif"].includes(extension)) {
      return "image";
    }
    if ([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"].includes(extension)) {
      return "video";
    }
    if ([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".flac"].includes(extension)) {
      return "audio";
    }
    if (extension === ".pdf") {
      return "document";
    }

    return "";
  };

  for (const item of items) {
    const url = String(item?.url || item?.cdnUrl || "").trim();
    if (!url) continue;

    const type = resolveMediaType(item);
    if (type === "image") {
      images.push({ ...item, url, type });
      continue;
    }
    if (type === "video") {
      videos.push({ ...item, url, type });
      continue;
    }
    if (type === "audio") {
      audios.push({ ...item, url, type });
      continue;
    }
    if (type === "document") {
      documents.push({ ...item, url, type });
    }
  }

  images.forEach((item, index) => {
    fields[`image${index + 1}Url`] = item.url || item.cdnUrl || "";
  });
  videos.forEach((item, index) => {
    fields[`video${index + 1}Url`] = item.url || item.cdnUrl || "";
  });
  audios.forEach((item, index) => {
    fields[`audio${index + 1}Url`] = item.url || item.cdnUrl || "";
  });
  documents.forEach((item, index) => {
    fields[`document${index + 1}Url`] = item.url || item.cdnUrl || "";
  });

  return { images, videos, audios, documents, fields };
}

function buildPrimaryMedia(media) {
  for (const item of Array.isArray(media) ? media : []) {
    const type = String(item?.type || "").trim().toLowerCase();
    const url = String(item?.url || item?.cdnUrl || "").trim();
    if (SUPPORTED_REMINDER_MEDIA_TYPES.has(type) && url) {
      return { type, url };
    }

    const mimeType = String(item?.mimeType || item?.mime_type || "").toLowerCase();
    if (!url) continue;
    if (mimeType.startsWith("image/")) return { type: "image", url };
    if (mimeType.startsWith("video/")) return { type: "video", url };
    if (mimeType.startsWith("audio/")) return { type: "audio", url };
    if (mimeType === "application/pdf") return { type: "document", url };

    const source = String(item?.name || url).toLowerCase();
    const extensionIndex = source.lastIndexOf(".");
    const extension = extensionIndex >= 0 ? source.slice(extensionIndex) : "";
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".heic", ".heif"].includes(extension)) {
      return { type: "image", url };
    }
    if ([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"].includes(extension)) {
      return { type: "video", url };
    }
    if ([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".flac"].includes(extension)) {
      return { type: "audio", url };
    }
    if (extension === ".pdf") {
      return { type: "document", url };
    }
  }
  return null;
}

function normalizeWhatsAppPhone(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  const normalized = hasPlus ? `+${digits}` : digits;
  return WHATSAPP_E164_LIKE_PATTERN.test(normalized) ? normalized : "";
}

async function resolveAdminWhatsAppRecipients(supabase) {
  const recipients = [];
  const seen = new Set();

  const addRecipient = (value) => {
    const normalized = normalizeWhatsAppPhone(value);
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    recipients.push(normalized);
  };

  try {
    const { data, error } = await supabase
      .from(table("admin_notification_preferences"))
      .select("*");
    if (error) throw error;

    for (const row of data || []) {
      const list = Array.isArray(row?.whatsapp_recipients) ? row.whatsapp_recipients : [];
      for (const entry of list) {
        if (!entry || typeof entry !== "object" || entry.is_active === false) {
          continue;
        }
        addRecipient(entry.phone_e164 || entry.phone || entry.to || entry.recipient);
      }
    }
  } catch (error) {
    console.error("[send-reminders] Failed to resolve admin WhatsApp recipients:", error);
  }

  addRecipient(process.env.WHATSAPP_BROADCAST_NUMBER);
  return recipients;
}

function buildReminderBodyText(payload) {
  const adText = String(payload?.adText || "").trim();
  if (adText) return adText;

  const adName = String(payload?.adName || "").trim();
  if (adName) return adName;

  return "Upcoming ad reminder";
}

function buildWhatsAppBodyText(ad) {
  return String(ad?.ad_text || "").trim();
}

function generateReminderHtml(payload) {
  const bodyText = buildReminderBodyText(payload);
  const mediaBlocks = [];

  for (let i = 1; i <= payload.imageCount; i++) {
    const url = payload[`image${i}Url`];
    if (url) {
      mediaBlocks.push(
        `<div style="margin: 0 0 16px;"><img src="${escapeHtml(url)}" alt="" style="display: block; width: 100%; max-width: 100%; height: auto; border: 0; border-radius: 12px;"></div>`,
      );
    }
  }

  for (let i = 1; i <= payload.videoCount; i++) {
    const url = payload[`video${i}Url`];
    if (url) {
      mediaBlocks.push(
        `<div style="margin: 0 0 16px;"><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" style="color: #2563eb; word-break: break-all;">Open video ${i}</a></div>`,
      );
    }
  }

  for (let i = 1; i <= payload.audioCount; i++) {
    const url = payload[`audio${i}Url`];
    if (url) {
      mediaBlocks.push(
        `<div style="margin: 0 0 16px;"><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" style="color: #2563eb; word-break: break-all;">Open audio ${i}</a></div>`,
      );
    }
  }

  for (let i = 1; i <= payload.documentCount; i++) {
    const url = payload[`document${i}Url`];
    if (url) {
      mediaBlocks.push(
        `<div style="margin: 0 0 16px;"><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" style="color: #2563eb; word-break: break-all;">Open document ${i}</a></div>`,
      );
    }
  }

  return `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 24px; background: #ffffff; color: #111827; font-family: Arial, sans-serif;">
  <div style="max-width: 640px; margin: 0 auto;">
    ${bodyText ? `<div style="margin: 0 0 ${mediaBlocks.length > 0 ? "20px" : "0"}; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(bodyText)}</div>` : ""}
    ${mediaBlocks.join("")}
  </div>
</body>
</html>
  `;
}

function normalizeInternalEmails(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeEmail(value))
        .filter((value) => value && isValidEmail(value)),
    ),
  );
}

function resolveAdvertiserInfo(ad, { byId, byName }) {
  const advertiserId = String(ad?.advertiser_id || "").trim();
  if (advertiserId && byId.has(advertiserId)) {
    return byId.get(advertiserId);
  }

  const advertiserName = normalizeEmail(String(ad?.advertiser || "").trim());
  if (advertiserName && byName.has(advertiserName)) {
    return byName.get(advertiserName);
  }

  return null;
}

function formatScheduledDateTime(scheduledAt) {
  return {
    formattedDate: scheduledAt.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    formattedTime: scheduledAt.toLocaleTimeString("en-US", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    dayOfWeek: scheduledAt.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "long",
    }),
  };
}

export async function POST(request) {
  try {
    const auth = await requireInternalUser(request);
    if (!auth.authorized) {
      const configuredSecret = String(process.env.CRON_SECRET || "").trim();
      const bearerToken = String(request.headers.get("authorization") || "")
        .replace(/^Bearer\s+/i, "")
        .trim();
      const cronHeaderSecret = String(request.headers.get("x-cron-secret") || "").trim();
      const bearerMatches = timingSafeSecretMatch(bearerToken, configuredSecret);
      const cronHeaderMatches = timingSafeSecretMatch(cronHeaderSecret, configuredSecret);

      if (
        !configuredSecret ||
        (!bearerMatches && !cronHeaderMatches)
      ) {
        return Response.json({ error: auth.error }, { status: auth.status || 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const debugMode = searchParams.get("debug") === "true";

    const supabase = db();
    const nowUTC = new Date();
    const nowET = getNowInET();
    const todayET = nowET.date;

    if (!nowET.pseudoDate) {
      throw new Error("Unable to compute current ET time");
    }

    const { data: adsRows, error: adsError } = await supabase
      .from(table("ads"))
      .select("id, ad_name, advertiser, advertiser_id, post_type, placement, post_date, post_date_from, post_date_to, custom_dates, schedule, post_time, media, ad_text, reminder_minutes, status")
      .eq("archived", false);
    if (adsError) throw adsError;

    const upcomingAds = (adsRows || []).filter((ad) => isReminderEligibleStatus(ad?.status));

    const { data: advertisers, error: advertisersError } = await supabase
      .from(table("advertisers"))
      .select("id, advertiser_name, contact_name, email, phone_number, phone");
    if (advertisersError) throw advertisersError;

    const advertiserById = new Map(
      (advertisers || []).map((row) => [String(row.id || "").trim(), row]),
    );
    const advertiserByName = new Map(
      (advertisers || []).map((row) => [
        normalizeEmail(String(row.advertiser_name || "").trim()),
        row,
      ]),
    );

    const [internalEmailsResolved, telegramPrefsResult, adminWhatsAppRecipients] = await Promise.all([
      resolveInternalNotificationEmails(supabase),
      supabase
        .from(table("admin_notification_preferences"))
        .select("telegram_chat_ids"),
      resolveAdminWhatsAppRecipients(supabase),
    ]);

    const internalEmails = normalizeInternalEmails(internalEmailsResolved);

    const activeTelegramChatIds = resolveActiveTelegramChatIds(
      telegramPrefsResult.data || [],
    );

    const results = [];
    const debug = [];
    const defaultSender = getDefaultEmailSender();

    for (const ad of upcomingAds) {
      const scheduleEntries = computeScheduledEntries(ad, todayET);
      const dueEntry = scheduleEntries.find((entry) =>
        isWithinReminderWindow(entry.scheduledAt, nowET.pseudoDate, entry.reminderMinutes),
      );
      const scheduleTriggerEntry = scheduleEntries.find((entry) =>
        isWithinScheduleTriggerWindow(entry.scheduledAt, nowET.pseudoDate, 5),
      );

      if (debugMode) {
        debug.push({
          ad_id: ad.id,
          ad_name: ad.ad_name,
          status: ad.status,
          scheduleChecks: scheduleEntries.length,
          dueNow: Boolean(dueEntry),
          dueReminderWindowMinutes: dueEntry?.reminderMinutes || null,
          dueScheduleNow: Boolean(scheduleTriggerEntry),
          dueScheduleKey: scheduleTriggerEntry?.scheduleKey || null,
        });
      }

      if (!dueEntry && !scheduleTriggerEntry) continue;

      const media = buildMediaFields(ad.media);
      const primaryMedia = buildPrimaryMedia(ad.media);
      const advertiserInfo = resolveAdvertiserInfo(ad, {
        byId: advertiserById,
        byName: advertiserByName,
      });
      const reminderBodyText = buildReminderBodyText({
        adName: ad.ad_name,
        adText: ad.ad_text,
      });
      const whatsappBodyText = buildWhatsAppBodyText(ad);

      if (dueEntry) {
        const scheduleMeta = formatScheduledDateTime(dueEntry.scheduledAt);

        if (internalEmails.length > 0) {
          const alreadySentInternal = await hasReminderForOccurrence(
            supabase,
            ad.id,
            "internal",
            dueEntry.scheduleKey,
          );
          if (alreadySentInternal) {
            results.push({
              type: "internal_email",
              ad_id: ad.id,
              ad_name: ad.ad_name,
              status: "already_sent",
              message: "Internal reminder already sent for this scheduled occurrence",
            });
          } else {
            try {
              const payload = {
                recipientType: "internal",
                to: internalEmails,
                from: defaultSender,
                subject: `Ad Reminder | ${ad.advertiser} | ${scheduleMeta.dayOfWeek}, ${scheduleMeta.formattedTime} ET`,
                adName: ad.ad_name,
                advertiser: ad.advertiser,
                advertiserEmail: advertiserInfo?.email || "",
                advertiserPhone: advertiserInfo?.phone_number || advertiserInfo?.phone || "",
                placement: ad.placement,
                formattedTime: `${scheduleMeta.formattedTime} ET`,
                formattedDate: scheduleMeta.formattedDate,
                adText: ad.ad_text || "",
                imageCount: media.images.length,
                videoCount: media.videos.length,
                audioCount: media.audios.length,
                documentCount: media.documents.length,
                ...media.fields,
              };

              await sendEmail({
                bcc: internalEmails,
                subject: payload.subject,
                html: generateReminderHtml(payload),
                text: reminderBodyText,
              });

              let telegramResults = [];
              if (activeTelegramChatIds.length > 0) {
                telegramResults = primaryMedia
                  ? await sendTelegramMediaToMany({
                      chatIds: activeTelegramChatIds,
                      media: primaryMedia,
                      caption: reminderBodyText,
                      parseMode: null,
                    })
                  : await sendTelegramToMany({
                      chatIds: activeTelegramChatIds,
                      text: reminderBodyText,
                      parseMode: null,
                    });
              }

              await storeReminder(supabase, ad.id, "email", "internal", dueEntry.scheduleKey);
              results.push({
                type: "internal_email",
                to: internalEmails,
                ad_name: ad.ad_name,
                status: "sent",
                telegram_sent: telegramResults.some((entry) => entry.ok),
              });
            } catch (error) {
              results.push({
                type: "internal_email",
                to: internalEmails,
                ad_name: ad.ad_name,
                status: "failed",
                error: error.message,
              });
            }
          }
        } else {
          results.push({
            type: "internal_email",
            ad_id: ad.id,
            ad_name: ad.ad_name,
            status: "skipped",
            message: "No internal recipient emails found",
          });
        }

        if (!advertiserInfo?.email) {
          results.push({
            type: "advertiser_email",
            ad_id: ad.id,
            ad_name: ad.ad_name,
            status: "skipped",
            message: "No advertiser email found",
          });
        } else {
          const alreadySentAdvertiser = await hasReminderForOccurrence(
            supabase,
            ad.id,
            "advertiser",
            dueEntry.scheduleKey,
          );
          if (alreadySentAdvertiser) {
            results.push({
              type: "advertiser_email",
              ad_id: ad.id,
              ad_name: ad.ad_name,
              status: "already_sent",
              message: "Advertiser reminder already sent for this scheduled occurrence",
            });
          } else {
            const advertiserName = advertiserInfo.contact_name || advertiserInfo.advertiser_name;

            try {
              const payload = {
                recipientType: "advertiser",
                to: advertiserInfo.email,
                advertiserEmail: advertiserInfo.email,
                advertiserPhone: advertiserInfo.phone_number || advertiserInfo.phone || "",
                from: defaultSender,
                subject: `Upcoming Ad Reminder | ${ad.ad_name} | ${scheduleMeta.dayOfWeek}, ${scheduleMeta.formattedTime} ET`,
                advertiserName,
                adName: ad.ad_name,
                advertiser: ad.advertiser,
                placement: ad.placement,
                formattedTime: `${scheduleMeta.formattedTime} ET`,
                formattedDate: scheduleMeta.formattedDate,
                adText: ad.ad_text || "",
                imageCount: media.images.length,
                videoCount: media.videos.length,
                audioCount: media.audios.length,
                documentCount: media.documents.length,
                ...media.fields,
              };

              await sendEmail({
                to: advertiserInfo.email,
                subject: payload.subject,
                html: generateReminderHtml(payload),
                text: reminderBodyText,
              });

              await storeReminder(supabase, ad.id, "email", "advertiser", dueEntry.scheduleKey);
              results.push({
                type: "advertiser_email",
                to: advertiserInfo.email,
                ad_name: ad.ad_name,
                advertiser: advertiserName,
                status: "sent",
              });
            } catch (error) {
              results.push({
                type: "advertiser_email",
                to: advertiserInfo.email,
                ad_name: ad.ad_name,
                status: "failed",
                error: error.message,
              });
            }
          }
        }
      }

      if (scheduleTriggerEntry) {
        if (adminWhatsAppRecipients.length === 0) {
          results.push({
            type: "admin_whatsapp",
            ad_id: ad.id,
            ad_name: ad.ad_name,
            status: "skipped",
            message: "No admin WhatsApp recipients configured",
          });
        } else {
          const alreadySentWhatsApp = await hasReminderForOccurrence(
            supabase,
            ad.id,
            "admin_whatsapp",
            scheduleTriggerEntry.scheduleKey,
          );
          if (alreadySentWhatsApp) {
            results.push({
              type: "admin_whatsapp",
              ad_id: ad.id,
              ad_name: ad.ad_name,
              status: "already_sent",
              message: "Scheduled WhatsApp content already sent for this occurrence",
            });
          } else if (!whatsappBodyText && !primaryMedia) {
            results.push({
              type: "admin_whatsapp",
              ad_id: ad.id,
              ad_name: ad.ad_name,
              status: "skipped",
              message: "No ad text or media to send",
            });
          } else {
            const recipientResults = [];
            for (const recipient of adminWhatsAppRecipients) {
              try {
                const sendResult = await sendWhatsAppMessageDetailed({
                  to: recipient,
                  text: whatsappBodyText,
                  media: primaryMedia,
                });
                recipientResults.push({
                  to: recipient,
                  ok: sendResult.ok === true,
                  phase: sendResult.phase || null,
                  message_id: sendResult.messageId || null,
                  upstream_status: Number(sendResult.status || 0) || null,
                  error:
                    sendResult.ok === true
                      ? null
                      : sendResult.error || "Failed to send scheduled WhatsApp message.",
                });
              } catch (error) {
                recipientResults.push({
                  to: recipient,
                  ok: false,
                  phase: null,
                  message_id: null,
                  upstream_status: null,
                  error: String(
                    error?.message || error || "Failed to send scheduled WhatsApp message.",
                  ),
                });
              }
            }

            const successfulCount = recipientResults.filter((entry) => entry.ok).length;
            const failedCount = recipientResults.length - successfulCount;

            if (successfulCount > 0) {
              await storeReminder(
                supabase,
                ad.id,
                "whatsapp",
                "admin_whatsapp",
                scheduleTriggerEntry.scheduleKey,
              );
            }

            results.push({
              type: "admin_whatsapp",
              ad_id: ad.id,
              ad_name: ad.ad_name,
              schedule_key: scheduleTriggerEntry.scheduleKey,
              status: failedCount === 0 ? "sent" : successfulCount > 0 ? "partial" : "failed",
              successful_count: successfulCount,
              failed_count: failedCount,
              recipients: recipientResults,
            });
          }
        }
      }
    }

    const response = {
      success: true,
      totalResults: results.length,
      results,
    };

    if (debugMode) {
      response.debug = {
        serverTimeUTC: nowUTC.toISOString(),
        easternTimeDate: nowET.date,
        easternTimeTime: nowET.time,
        todayET,
        internalRecipientCount: internalEmails.length,
        adminWhatsAppRecipientCount: adminWhatsAppRecipients.length,
        eligibleAdCount: upcomingAds.length,
        advertiserCount: (advertisers || []).length,
        checks: debug,
      };
    }

    return Response.json(response);
  } catch (err) {
    console.error("POST /api/admin/send-reminders error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
