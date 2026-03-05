import { dateOnly, db, normalizePostType, table, toNumber } from "../../utils/supabase-db.js";
import { requireInternalUser } from "../../utils/auth-check.js";
import { sendEmail } from "../../utils/send-email.js";
import { resolveInternalNotificationEmails } from "../../utils/internal-notification-emails.js";
import { sendTelegramToMany, resolveActiveTelegramChatIds } from "../../utils/send-telegram.js";

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

const REMINDER_PRESET_MINUTES = {
  "15-min": 15,
  "15m": 15,
  "30-min": 30,
  "30m": 30,
  "1-hour": 60,
  "1h": 60,
  "1-day": 1440,
  "1d": 1440,
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

function parseNaiveDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [year, month, day] = String(dateStr).split("-").map((value) => Number(value));
  const [hour, minute, second] = String(timeStr).split(":").map((value) => Number(value || 0));
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, Number.isFinite(second) ? second : 0));
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

function parseReminderMinutes(value, fallback = 15) {
  const fallbackMinutes = Math.max(1, toNumber(fallback, 15));

  if (value === null || value === undefined || value === "") {
    return fallbackMinutes;
  }

  if (typeof value === "number") {
    return Math.max(1, toNumber(value, fallbackMinutes));
  }

  const text = String(value).trim().toLowerCase();
  if (!text) return fallbackMinutes;

  if (/^\d+$/.test(text)) {
    return Math.max(1, Number(text));
  }

  if (REMINDER_PRESET_MINUTES[text]) {
    return REMINDER_PRESET_MINUTES[text];
  }

  const unitMatch = text.match(/^(\d+)\s*(minute|minutes|min|mins|hour|hours|day|days)$/i);
  if (!unitMatch) {
    return fallbackMinutes;
  }

  const amount = Math.max(1, Number(unitMatch[1]));
  const unit = String(unitMatch[2] || "").toLowerCase();
  if (unit.startsWith("day")) return amount * 1440;
  if (unit.startsWith("hour")) return amount * 60;
  return amount;
}

function timeUntilText(scheduledAt, nowET) {
  const minutesUntil = Math.round((scheduledAt.getTime() - nowET.getTime()) / (1000 * 60));
  if (minutesUntil < 0) return "now";
  if (minutesUntil < 60) return `in ${minutesUntil} minute${minutesUntil !== 1 ? "s" : ""}`;
  if (minutesUntil < 1440) {
    const hours = Math.round(minutesUntil / 60);
    return `in ${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  const days = Math.round(minutesUntil / 1440);
  return `in ${days} day${days !== 1 ? "s" : ""}`;
}

function greetingForHour(hour) {
  if (hour >= 17) return "Good Evening";
  if (hour >= 12) return "Good Afternoon";
  return "Good Morning";
}

function computeScheduledEntries(ad, todayET) {
  const type = normalizePostType(ad?.post_type);
  const entries = [];
  const defaultReminderMinutes = parseReminderMinutes(ad?.reminder_minutes, 15);

  if (type === "one_time") {
    const dateStr = dateOnly(ad?.schedule || ad?.post_date_from || ad?.post_date);
    const scheduledAt = parseNaiveDateTime(dateStr, ad?.post_time);
    if (scheduledAt) {
      entries.push({
        scheduledAt,
        reminderMinutes: defaultReminderMinutes,
      });
    }
    return entries;
  }

  if (type === "daily_run") {
    const from = dateOnly(ad?.post_date_from || ad?.schedule || ad?.post_date);
    const to = dateOnly(ad?.post_date_to || from);
    if (!from || !to || !ad?.post_time) return entries;
    if (todayET < from || todayET > to) return entries;

    const scheduledAt = parseNaiveDateTime(todayET, ad?.post_time);
    if (scheduledAt) {
      entries.push({
        scheduledAt,
        reminderMinutes: defaultReminderMinutes,
      });
    }
    return entries;
  }

  if (type === "custom_schedule") {
    if (!Array.isArray(ad?.custom_dates)) return entries;

    for (const entry of ad.custom_dates) {
      if (typeof entry === "string") {
        const scheduledAt = parseNaiveDateTime(dateOnly(entry), ad?.post_time);
        if (scheduledAt) {
          entries.push({
            scheduledAt,
            reminderMinutes: defaultReminderMinutes,
          });
        }
        continue;
      }

      const dateKey = dateOnly(entry?.date);
      const timeValue = entry?.time || ad?.post_time;
      const scheduledAt = parseNaiveDateTime(dateKey, timeValue);
      if (!scheduledAt) continue;

      entries.push({
        scheduledAt,
        reminderMinutes: parseReminderMinutes(entry?.reminder, defaultReminderMinutes),
      });
    }
  }

  return entries;
}

function isWithinReminderWindow(scheduledAt, nowET, windowMinutes) {
  const diffMinutes = (scheduledAt.getTime() - nowET.getTime()) / (1000 * 60);
  return diffMinutes > -5 && diffMinutes <= windowMinutes;
}

function isReminderEligibleStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === "scheduled" || normalized === "approved";
}

async function hasRecentReminder(supabase, adId, recipientType) {
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

async function storeReminder(supabase, adId, type, recipientType) {
  const { error } = await supabase.from(table("sent_reminders")).insert({
    ad_id: adId,
    reminder_type: type,
    recipient_type: recipientType,
    sent_at: new Date().toISOString(),
  });
  if (error) throw error;
}

function buildMediaFields(media) {
  const items = Array.isArray(media) ? media : [];
  const images = items.filter((item) => item?.type === "image");
  const videos = items.filter((item) => item?.type === "video");
  const fields = {};

  images.forEach((item, index) => {
    fields[`image${index + 1}Url`] = item.url || item.cdnUrl || "";
  });
  videos.forEach((item, index) => {
    fields[`video${index + 1}Url`] = item.url || item.cdnUrl || "";
  });

  return { images, videos, fields };
}

async function sendZapier(payload) {
  if (!process.env.ZAPIER_WEBHOOK_URL) {
    return;
  }

  const response = await fetch(process.env.ZAPIER_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Zapier webhook returned status ${response.status}: ${text}`);
  }
}

function generateReminderHtml(payload, isInternal = false) {
  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const mediaLinks = [];
  for (let i = 1; i <= payload.imageCount; i++) {
    const url = payload[`image${i}Url`];
    if (url) {
      mediaLinks.push(
        `<div style="margin: 10px 0;"><strong>Image ${i}:</strong> <a href="${escapeHtml(url)}" target="_blank" style="word-break: break-all; color: #3b82f6;">${escapeHtml(url)}</a></div>`,
      );
    }
  }
  for (let i = 1; i <= payload.videoCount; i++) {
    const url = payload[`video${i}Url`];
    if (url) {
      mediaLinks.push(
        `<div style="margin: 10px 0;"><strong>Video ${i}:</strong> <a href="${escapeHtml(url)}" target="_blank" style="word-break: break-all; color: #3b82f6;">${escapeHtml(url)}</a></div>`,
      );
    }
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #3b82f6; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .alert { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; }
    .info-block { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; display: inline-block; min-width: 120px; }
    .media-section { margin-top: 20px; padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 5px; }
    .footer { text-align: center; padding: 20px 0; border-top: 1px solid #ddd; color: #777; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cbnads.com/icons/icon-512.png" alt="Logo" class="logo">
    </div>
    <div class="content">
      <div class="alert">
        <h2 style="margin-top: 0; color: #1d4ed8;">${isInternal ? "Internal Team Reminder" : "Upcoming Ad Reminder"}</h2>
        <p style="margin-bottom: 0;">${escapeHtml(payload.greeting)}, this is a reminder that an ad is scheduled to run ${escapeHtml(payload.timeUntilText)}.</p>
      </div>
      
      <div class="info-block">
        <div class="info-row"><span class="label">Ad Name:</span> ${escapeHtml(payload.adName)}</div>
        <div class="info-row"><span class="label">Advertiser:</span> ${escapeHtml(payload.advertiser)}</div>
        ${isInternal ? `<div class="info-row"><span class="label">Contact:</span> <a href="mailto:${escapeHtml(payload.advertiserEmail)}">${escapeHtml(payload.advertiserEmail)}</a> ${payload.advertiserPhone ? `| ${escapeHtml(payload.advertiserPhone)}` : ""}</div>` : ""}
        ${payload.placement ? `<div class="info-row"><span class="label">Placement:</span> ${escapeHtml(payload.placement)}</div>` : ""}
        <div class="info-row"><span class="label">Scheduled For:</span> ${escapeHtml(payload.formattedDate)} at ${escapeHtml(payload.formattedTime)}</div>
      </div>
      
      ${payload.adText
    ? `
      <div class="info-block">
        <div class="label" style="margin-bottom: 5px;">Ad Content:</div>
        <div style="white-space: pre-wrap;">${escapeHtml(payload.adText)}</div>
      </div>
      `
    : ""}
      
      ${mediaLinks.length > 0
    ? `
      <div class="media-section">
        <div class="label" style="margin-bottom: 10px;">Media Files (${mediaLinks.length})</div>
        ${mediaLinks.join("")}
      </div>
      `
    : ""}
      
    </div>
    <div class="footer">
      <p>System Notification | ${new Date().toLocaleString()}</p>
    </div>
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

      if (
        !configuredSecret ||
        (bearerToken !== configuredSecret && cronHeaderSecret !== configuredSecret)
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

    const [internalEmailsResolved, telegramPrefsResult] = await Promise.all([
      resolveInternalNotificationEmails(supabase),
      supabase
        .from(table("admin_notification_preferences"))
        .select("telegram_chat_ids"),
    ]);

    const internalEmails = normalizeInternalEmails(internalEmailsResolved);

    const activeTelegramChatIds = resolveActiveTelegramChatIds(
      telegramPrefsResult.data || [],
    );

    const results = [];
    const debug = [];

    for (const ad of upcomingAds) {
      const scheduleEntries = computeScheduledEntries(ad, todayET);
      const dueEntry = scheduleEntries.find((entry) =>
        isWithinReminderWindow(entry.scheduledAt, nowET.pseudoDate, entry.reminderMinutes),
      );

      if (debugMode) {
        debug.push({
          ad_id: ad.id,
          ad_name: ad.ad_name,
          status: ad.status,
          scheduleChecks: scheduleEntries.length,
          dueNow: Boolean(dueEntry),
          dueReminderWindowMinutes: dueEntry?.reminderMinutes || null,
        });
      }

      if (!dueEntry) continue;

      const scheduleMeta = formatScheduledDateTime(dueEntry.scheduledAt);
      const untilText = timeUntilText(dueEntry.scheduledAt, nowET.pseudoDate);
      const greeting = greetingForHour(nowET.hour);
      const media = buildMediaFields(ad.media);
      const advertiserInfo = resolveAdvertiserInfo(ad, {
        byId: advertiserById,
        byName: advertiserByName,
      });

      if (internalEmails.length > 0) {
        const alreadySentInternal = await hasRecentReminder(supabase, ad.id, "internal");
        if (alreadySentInternal) {
          results.push({
            type: "internal_email",
            ad_id: ad.id,
            ad_name: ad.ad_name,
            status: "already_sent",
            message: "Internal reminder already sent within last 24 hours",
          });
        } else {
          try {
            const payload = {
              recipientType: "internal",
              to: internalEmails,
              from: "Ad Manager <advertise@cbnads.com>",
              subject: `Ad Reminder | ${ad.advertiser} | ${scheduleMeta.dayOfWeek}, ${scheduleMeta.formattedTime} ET`,
              greeting,
              firstName: "Team",
              adName: ad.ad_name,
              advertiser: ad.advertiser,
              advertiserEmail: advertiserInfo?.email || "",
              advertiserPhone: advertiserInfo?.phone_number || advertiserInfo?.phone || "",
              placement: ad.placement,
              formattedTime: `${scheduleMeta.formattedTime} ET`,
              formattedDate: scheduleMeta.formattedDate,
              timeUntilText: untilText,
              adText: ad.ad_text || "",
              imageCount: media.images.length,
              videoCount: media.videos.length,
              ...media.fields,
            };

            await sendZapier(payload).catch(console.error);
            await sendEmail({
              to: internalEmails,
              subject: payload.subject,
              html: generateReminderHtml(payload, true),
            });

            if (activeTelegramChatIds.length > 0) {
              const telegramText =
                `<b>Ad Reminder</b>\n\n` +
                `<b>${ad.ad_name}</b>\n` +
                `Advertiser: ${ad.advertiser}\n` +
                `Placement: ${ad.placement}\n` +
                `Scheduled: ${scheduleMeta.formattedDate} at ${scheduleMeta.formattedTime} ET\n` +
                `${untilText ? `Due: ${untilText}` : ""}`.trim();
              await sendTelegramToMany({ chatIds: activeTelegramChatIds, text: telegramText })
                .catch((err) => console.error("[send-reminders] Telegram send failed:", err));
            }

            await storeReminder(supabase, ad.id, "email", "internal");
            results.push({
              type: "internal_email",
              to: internalEmails,
              ad_name: ad.ad_name,
              status: "sent",
              telegram_sent: activeTelegramChatIds.length > 0,
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
        continue;
      }

      const alreadySentAdvertiser = await hasRecentReminder(supabase, ad.id, "advertiser");
      if (alreadySentAdvertiser) {
        results.push({
          type: "advertiser_email",
          ad_id: ad.id,
          ad_name: ad.ad_name,
          status: "already_sent",
          message: "Advertiser reminder already sent within last 24 hours",
        });
        continue;
      }

      const advertiserName = advertiserInfo.contact_name || advertiserInfo.advertiser_name;
      const advertiserFirstName = String(advertiserName || "Advertiser")
        .split(" ")
        .filter(Boolean)[0];

      try {
        const payload = {
          recipientType: "advertiser",
          to: advertiserInfo.email,
          advertiserEmail: advertiserInfo.email,
          advertiserPhone: advertiserInfo.phone_number || advertiserInfo.phone || "",
          from: "Ad Manager <advertise@cbnads.com>",
          subject: `Upcoming Ad Reminder | ${ad.ad_name} | ${scheduleMeta.dayOfWeek}, ${scheduleMeta.formattedTime} ET`,
          greeting: `Hello ${advertiserFirstName}`,
          firstName: advertiserFirstName,
          advertiserName,
          adName: ad.ad_name,
          advertiser: ad.advertiser,
          placement: ad.placement,
          formattedTime: `${scheduleMeta.formattedTime} ET`,
          formattedDate: scheduleMeta.formattedDate,
          timeUntilText: untilText,
          adText: ad.ad_text || "",
          imageCount: media.images.length,
          videoCount: media.videos.length,
          ...media.fields,
        };

        await sendZapier(payload).catch(console.error);
        await sendEmail({
          to: advertiserInfo.email,
          subject: payload.subject,
          html: generateReminderHtml(payload, false),
        });

        await storeReminder(supabase, ad.id, "email", "advertiser");
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
