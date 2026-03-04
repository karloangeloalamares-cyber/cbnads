import { dateOnly, db, normalizePostType, table, toNumber } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";
import { sendEmail } from "../../utils/send-email.js";

function getNowInET() {
  const now = new Date();
  const etTimeStr = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  return new Date(etTimeStr);
}

function parseETDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [year, month, day] = String(dateStr).split("-").map((v) => Number(v));
  const [hour, minute, second] = String(timeStr).split(":").map((v) => Number(v || 0));
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day, hour, minute, Number.isFinite(second) ? second : 0);
}

function reminderWindowToMinutes(value, unit) {
  const amount = toNumber(value, 1);
  if (unit === "minutes") return amount;
  if (unit === "days") return amount * 1440;
  return amount * 60;
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

function computeScheduledTimes(ad, todayET) {
  const type = normalizePostType(ad?.post_type);
  const times = [];

  if (type === "one_time") {
    const dateStr = dateOnly(ad?.schedule || ad?.post_date_from || ad?.post_date);
    const dt = parseETDateTime(dateStr, ad?.post_time);
    if (dt) times.push(dt);
    return times;
  }

  if (type === "daily_run") {
    const from = dateOnly(ad?.post_date_from || ad?.schedule || ad?.post_date);
    const to = dateOnly(ad?.post_date_to || from);
    if (!from || !to || !ad?.post_time) return times;
    if (todayET < from || todayET > to) return times;
    const dt = parseETDateTime(todayET, ad.post_time);
    if (dt) times.push(dt);
    return times;
  }

  if (type === "custom_schedule") {
    if (!Array.isArray(ad?.custom_dates)) return times;
    for (const entry of ad.custom_dates) {
      if (typeof entry === "string") {
        const dt = parseETDateTime(dateOnly(entry), ad?.post_time);
        if (dt) times.push(dt);
        continue;
      }
      const dt = parseETDateTime(dateOnly(entry?.date), entry?.time || ad?.post_time);
      if (dt) times.push(dt);
    }
  }

  return times;
}

function isWithinReminderWindow(scheduledAt, nowET, windowMinutes) {
  const diffMinutes = (scheduledAt.getTime() - nowET.getTime()) / (1000 * 60);
  return diffMinutes > -5 && diffMinutes <= windowMinutes;
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
    return; // graceful degradation since we are using native Resend emails
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

function generateReminderHtml(payload, isAdmin = false) {
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
    if (url) mediaLinks.push(`<div style="margin: 10px 0;"><strong>Image ${i}:</strong> <a href="${escapeHtml(url)}" target="_blank" style="word-break: break-all; color: #3b82f6;">${escapeHtml(url)}</a></div>`);
  }
  for (let i = 1; i <= payload.videoCount; i++) {
    const url = payload[`video${i}Url`];
    if (url) mediaLinks.push(`<div style="margin: 10px 0;"><strong>Video ${i}:</strong> <a href="${escapeHtml(url)}" target="_blank" style="word-break: break-all; color: #3b82f6;">${escapeHtml(url)}</a></div>`);
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
      <img src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/" alt="Logo" class="logo">
    </div>
    <div class="content">
      <div class="alert">
        <h2 style="margin-top: 0; color: #1d4ed8;">${isAdmin ? '🔔 Internal Admin Reminder' : '🔔 Upcoming Ad Reminder'}</h2>
        <p style="margin-bottom: 0;">${escapeHtml(payload.greeting)}, this is a reminder that an ad is scheduled to run ${escapeHtml(payload.timeUntilText)}.</p>
      </div>
      
      <div class="info-block">
        <div class="info-row"><span class="label">Ad Name:</span> ${escapeHtml(payload.adName)}</div>
        <div class="info-row"><span class="label">Advertiser:</span> ${escapeHtml(payload.advertiser)}</div>
        ${isAdmin ? `<div class="info-row"><span class="label">Contact:</span> <a href="mailto:${escapeHtml(payload.advertiserEmail)}">${escapeHtml(payload.advertiserEmail)}</a> ${payload.advertiserPhone ? `| ${escapeHtml(payload.advertiserPhone)}` : ''}</div>` : ''}
        ${payload.placement ? `<div class="info-row"><span class="label">Placement:</span> ${escapeHtml(payload.placement)}</div>` : ''}
        <div class="info-row"><span class="label">Scheduled For:</span> ${escapeHtml(payload.formattedDate)} at ${escapeHtml(payload.formattedTime)}</div>
      </div>
      
      ${payload.adText ? `
      <div class="info-block">
        <div class="label" style="margin-bottom: 5px;">Ad Content:</div>
        <div style="white-space: pre-wrap;">${escapeHtml(payload.adText)}</div>
      </div>
      ` : ''}
      
      ${mediaLinks.length > 0 ? `
      <div class="media-section">
        <div class="label" style="margin-bottom: 10px;">Media Files (${mediaLinks.length})</div>
        ${mediaLinks.join('')}
      </div>
      ` : ''}
      
    </div>
    <div class="footer">
      <p>System Notification | ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
  `;
}

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      const configuredSecret = String(process.env.CRON_SECRET || "").trim();
      const bearerToken = String(request.headers.get("authorization") || "")
        .replace(/^Bearer\s+/i, "")
        .trim();
      const cronHeaderSecret = String(
        request.headers.get("x-cron-secret") || "",
      ).trim();

      if (
        configuredSecret &&
        bearerToken !== configuredSecret &&
        cronHeaderSecret !== configuredSecret
      ) {
        return Response.json({ error: admin.error }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const debugMode = searchParams.get("debug") === "true";

    const supabase = db();
    const nowUTC = new Date();
    const nowET = getNowInET();
    const todayET = dateOnly(nowET);

    const { data: adminPrefsRows, error: adminPrefsError } = await supabase
      .from(table("admin_notification_preferences"))
      .select("id, email_enabled, sms_enabled, reminder_time_value, reminder_time_unit, email_address, phone_number")
      .order("updated_at", { ascending: false });
    if (adminPrefsError) throw adminPrefsError;

    const { data: fallbackNotification, error: fallbackNotificationError } = await supabase
      .from(table("notification_preferences"))
      .select("email_enabled, reminder_email")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallbackNotificationError) throw fallbackNotificationError;

    const adminPrefs = [...(adminPrefsRows || [])];
    const fallbackEmail = String(fallbackNotification?.reminder_email || "").trim();
    if (
      adminPrefs.length === 0 &&
      fallbackNotification?.email_enabled &&
      fallbackEmail
    ) {
      adminPrefs.push({
        id: "fallback",
        email_enabled: true,
        sms_enabled: false,
        reminder_time_value: 1,
        reminder_time_unit: "hours",
        email_address: fallbackEmail,
        phone_number: null,
      });
    }

    const { data: upcomingAds, error: upcomingAdsError } = await supabase
      .from(table("ads"))
      .select("id, ad_name, advertiser, post_type, placement, post_date, post_date_from, post_date_to, custom_dates, schedule, post_time, media, ad_text, reminder_minutes, status")
      .eq("status", "Scheduled")
      .eq("archived", false);
    if (upcomingAdsError) throw upcomingAdsError;

    const { data: advertisers, error: advertisersError } = await supabase
      .from(table("advertisers"))
      .select("*");
    if (advertisersError) throw advertisersError;

    const advertiserByName = new Map(
      (advertisers || []).map((row) => [String(row.advertiser_name || "").trim().toLowerCase(), row]),
    );

    const results = [];
    const debug = [];

    for (const pref of adminPrefs) {
      if (!pref.email_enabled && !pref.sms_enabled) continue;
      const reminderMinutes = reminderWindowToMinutes(
        pref.reminder_time_value || 1,
        pref.reminder_time_unit || "hours",
      );

      for (const ad of upcomingAds || []) {
        const scheduledTimes = computeScheduledTimes(ad, todayET);
        const scheduledAt = scheduledTimes.find((time) =>
          isWithinReminderWindow(time, nowET, reminderMinutes),
        );

        if (debugMode) {
          debug.push({
            type: "admin",
            ad_id: ad.id,
            ad_name: ad.ad_name,
            reminderWindow: reminderMinutes,
            shouldNotify: Boolean(scheduledAt),
          });
        }

        if (!scheduledAt) continue;

        const alreadySent = await hasRecentReminder(supabase, ad.id, "admin");
        if (alreadySent) {
          results.push({
            type: "admin_email",
            ad_id: ad.id,
            ad_name: ad.ad_name,
            status: "already_sent",
            message: "Admin reminder already sent within last 24 hours",
          });
          continue;
        }

        const formattedDate = scheduledAt.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const formattedTime = scheduledAt.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        const dayOfWeek = scheduledAt.toLocaleDateString("en-US", {
          weekday: "long",
        });
        const greeting = greetingForHour(nowET.getHours());
        const untilText = timeUntilText(scheduledAt, nowET);
        const media = buildMediaFields(ad.media);
        const advertiserInfo = advertiserByName.get(
          String(ad.advertiser || "").trim().toLowerCase(),
        );

        if (pref.email_enabled && pref.email_address) {
          try {
            const payload = {
              recipientType: "admin",
              to: pref.email_address,
              from: "Ad Manager <advertise@cbnads.com>",
              subject: `Ad Reminder | ${ad.advertiser} | ${dayOfWeek}, ${formattedTime} ET`,
              greeting,
              firstName: "Admin",
              adName: ad.ad_name,
              advertiser: ad.advertiser,
              advertiserEmail: advertiserInfo?.email || "",
              advertiserPhone: advertiserInfo?.phone_number || advertiserInfo?.phone || "",
              placement: ad.placement,
              formattedTime: `${formattedTime} ET`,
              formattedDate,
              timeUntilText: untilText,
              adText: ad.ad_text || "",
              imageCount: media.images.length,
              videoCount: media.videos.length,
              ...media.fields,
            };

            await sendZapier(payload).catch(console.error);

            await sendEmail({
              to: pref.email_address,
              subject: payload.subject,
              html: generateReminderHtml(payload, true),
            });

            await storeReminder(supabase, ad.id, "email", "admin");
            results.push({
              type: "admin_email",
              to: pref.email_address,
              ad_name: ad.ad_name,
              status: "sent",
            });
          } catch (error) {
            results.push({
              type: "admin_email",
              to: pref.email_address,
              ad_name: ad.ad_name,
              status: "failed",
              error: error.message,
            });
          }
        }

        if (pref.sms_enabled && pref.phone_number) {
          try {
            await storeReminder(supabase, ad.id, "sms", "admin");
            results.push({
              type: "admin_sms",
              to: pref.phone_number,
              ad_name: ad.ad_name,
              status: "logged",
            });
          } catch (error) {
            results.push({
              type: "admin_sms",
              to: pref.phone_number,
              ad_name: ad.ad_name,
              status: "failed",
              error: error.message,
            });
          }
        }
      }
    }

    for (const ad of upcomingAds || []) {
      const reminderMinutes = toNumber(ad.reminder_minutes, 15);
      const scheduledTimes = computeScheduledTimes(ad, todayET);
      const scheduledAt = scheduledTimes.find((time) =>
        isWithinReminderWindow(time, nowET, reminderMinutes),
      );

      if (debugMode) {
        debug.push({
          type: "advertiser",
          ad_id: ad.id,
          ad_name: ad.ad_name,
          reminderWindow: reminderMinutes,
          shouldNotify: Boolean(scheduledAt),
        });
      }

      if (!scheduledAt) continue;

      const advertiserInfo = advertiserByName.get(
        String(ad.advertiser || "").trim().toLowerCase(),
      );
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

      const alreadySent = await hasRecentReminder(supabase, ad.id, "advertiser");
      if (alreadySent) {
        results.push({
          type: "advertiser_email",
          ad_id: ad.id,
          ad_name: ad.ad_name,
          status: "already_sent",
          message: "Advertiser reminder already sent within last 24 hours",
        });
        continue;
      }

      const formattedDate = scheduledAt.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const formattedTime = scheduledAt.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const dayOfWeek = scheduledAt.toLocaleDateString("en-US", {
        weekday: "long",
      });
      const untilText = timeUntilText(scheduledAt, nowET);
      const media = buildMediaFields(ad.media);
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
          subject: `Upcoming Ad Reminder | ${ad.ad_name} | ${dayOfWeek}, ${formattedTime} ET`,
          greeting: `Hello ${advertiserFirstName}`,
          firstName: advertiserFirstName,
          advertiserName,
          adName: ad.ad_name,
          advertiser: ad.advertiser,
          placement: ad.placement,
          formattedTime: `${formattedTime} ET`,
          formattedDate,
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
        easternTime: nowET.toLocaleString(),
        todayET,
        adminCount: adminPrefs.length,
        adCount: (upcomingAds || []).length,
        advertiserCount: (advertisers || []).length,
        checks: debug,
      };
    }

    return Response.json(response);
  } catch (err) {
    console.error("POST /api/admin/send-reminders error", err);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  return POST(request);
}
