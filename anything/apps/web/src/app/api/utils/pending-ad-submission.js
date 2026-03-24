import { db, normalizePostType, table } from "./supabase-db.js";
import { sendEmail } from "./send-email.js";
import { notifyInternalChannels } from "./internal-notification-channels.js";
import { sendWhatsAppInteractive } from "./send-whatsapp.js";
import {
  checkBatchAvailability,
  checkSingleDateAvailability,
  expandDateRange,
} from "./ad-availability.js";
import {
  isCompleteUSPhoneNumber,
  normalizeUSPhoneNumber,
} from "../../../lib/phone.js";
import { parseReminderMinutes } from "./reminder-minutes.js";
import {
  buildSeriesWeekStarts,
  clampWeeks,
  normalizeDateKeyStrict,
  resolveWeeklyCreative,
} from "./series-helpers.js";
import {
  AD_NAME_MAX_LENGTH,
  AD_TEXT_MAX_LENGTH,
  ADVERTISER_NAME_MAX_LENGTH,
  CUSTOM_DATE_MAX_COUNT,
  EMAIL_MAX_LENGTH,
  MEDIA_ITEM_MAX_COUNT,
  MULTI_WEEK_MAX_COUNT,
  NOTES_MAX_LENGTH,
  PERSON_NAME_MAX_LENGTH,
  PLACEMENT_MAX_LENGTH,
} from "../../../lib/inputLimits.js";
import { resolveMediaType } from "../../../lib/media.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value) || 0);

const toSafeHttpUrl = (value) => {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const readCustomDates = (customDates) =>
  Array.isArray(customDates)
    ? customDates
      .map((entry) => {
        if (entry && typeof entry === "object") {
          const date = String(entry.date || "").slice(0, 10);
          if (!date) return null;
          return {
            ...entry,
            date,
          };
        }
        const date = String(entry || "").slice(0, 10);
        return date ? { date } : null;
      })
      .filter(Boolean)
    : [];

const buildReviewSubmissionUrl = (request) => {
  const safeAppUrl = toSafeHttpUrl(process.env.APP_URL);
  if (safeAppUrl) {
    return new URL("/ads?section=Submissions", safeAppUrl).toString();
  }

  try {
    const requestUrl = new URL(request.url);
    return new URL("/ads?section=Submissions", `${requestUrl.protocol}//${requestUrl.host}`).toString();
  } catch {
    return null;
  }
};

const optionalPendingSubmissionColumns = new Set([
  "advertiser_id",
  "product_id",
  "product_name",
  "price",
  "series_id",
  "series_index",
  "series_total",
  "series_week_start",
  "source_request_key",
]);

const missingColumnName = (error) => {
  const message = String(error?.message || "");
  const postgresMatch = message.match(/column\s+(?:[a-z0-9_]+\.)?([a-z0-9_]+)\s+does not exist/i);
  if (postgresMatch?.[1]) {
    return postgresMatch[1].toLowerCase();
  }

  const schemaCacheMatch = message.match(/could not find the '([^']+)' column/i);
  return schemaCacheMatch?.[1] ? schemaCacheMatch[1].toLowerCase() : "";
};

const normalizeSourceRequestKey = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, 255);
};

const buildSourceRequestKey = (baseKey, suffix = "") => {
  const normalizedBase = normalizeSourceRequestKey(baseKey);
  if (!normalizedBase) {
    return null;
  }

  const normalizedSuffix = String(suffix || "").trim().toLowerCase();
  if (!normalizedSuffix) {
    return normalizedBase;
  }

  return `${normalizedBase}:${normalizedSuffix}`.slice(0, 255);
};

const validateTextLimit = (value, maxLength, label) => {
  const normalized = String(value ?? "");
  if (normalized.length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`;
  }
  return "";
};

const isSourceRequestKeyUniqueViolation = (error) => {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "");
  const details = String(error?.details || "");
  const hint = String(error?.hint || "");
  return (
    code === "23505" &&
    /source_request_key|cbnads_web_pending_ads_source_request_key_uniq/i.test(
      `${message} ${details} ${hint}`,
    )
  );
};

const fetchPendingAdBySourceRequestKey = async (supabase, sourceRequestKey) => {
  const normalizedKey = normalizeSourceRequestKey(sourceRequestKey);
  if (!normalizedKey) {
    return null;
  }

  const { data, error } = await supabase
    .from(table("pending_ads"))
    .select("*")
    .eq("source_request_key", normalizedKey)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data || null;
};

const fetchPendingAdsBySourceRequestKeys = async (supabase, sourceRequestKeys) => {
  const normalizedKeys = (Array.isArray(sourceRequestKeys) ? sourceRequestKeys : [])
    .map((value) => normalizeSourceRequestKey(value))
    .filter(Boolean);

  if (normalizedKeys.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from(table("pending_ads"))
    .select("*")
    .in("source_request_key", normalizedKeys);
  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const byKey = new Map(
    rows.map((row) => [normalizeSourceRequestKey(row?.source_request_key), row]),
  );

  return normalizedKeys.map((key) => byKey.get(key)).filter(Boolean);
};

const fetchPendingAdById = async (supabase, pendingAdId) => {
  const normalizedId = String(pendingAdId || "").trim();
  if (!normalizedId) {
    return null;
  }

  const { data, error } = await supabase
    .from(table("pending_ads"))
    .select("*")
    .eq("id", normalizedId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data || null;
};

const fetchPendingAdsBySeriesId = async (supabase, seriesId) => {
  const normalizedSeriesId = String(seriesId || "").trim();
  if (!normalizedSeriesId) {
    return [];
  }

  const { data, error } = await supabase
    .from(table("pending_ads"))
    .select("*")
    .eq("series_id", normalizedSeriesId)
    .order("series_index", { ascending: true });
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data : [];
};

const formatPendingReceiptPrice = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }
  return formatCurrency(numericValue);
};

const buildPendingSubmissionReceiptEmail = ({ pendingAd, pendingAds = [] }) => {
  const rows = Array.isArray(pendingAds) && pendingAds.length > 0 ? pendingAds : [pendingAd];
  const firstPendingAd = rows[0] || pendingAd;
  const isMultiWeek =
    rows.length > 1 || Number(firstPendingAd?.series_total || 0) > 1;

  const contactName = String(
    firstPendingAd?.contact_name || firstPendingAd?.advertiser_name || "there",
  ).trim();
  const advertiserName = String(firstPendingAd?.advertiser_name || "").trim();
  const normalizedEmail = String(firstPendingAd?.email || "").trim().toLowerCase();
  const normalizedPhoneNumber = String(
    firstPendingAd?.phone_number || firstPendingAd?.phone || "",
  ).trim();
  const campaignName = String(firstPendingAd?.ad_name || "Submission").trim();
  const placement = String(firstPendingAd?.placement || "").trim();
  const productName = String(firstPendingAd?.product_name || "").trim();
  const priceText = formatPendingReceiptPrice(firstPendingAd?.price);
  const startDate = String(
    firstPendingAd?.post_date_from || firstPendingAd?.post_date || "",
  ).trim();
  const endDate = String(firstPendingAd?.post_date_to || "").trim();
  const postTime = String(firstPendingAd?.post_time || "").trim();
  const postType = String(firstPendingAd?.post_type || "").trim();
  const weekCount = rows.length;

  const escaped = {
    contactName: escapeHtml(contactName),
    advertiserName: escapeHtml(advertiserName),
    email: escapeHtml(normalizedEmail),
    phoneNumber: escapeHtml(normalizedPhoneNumber),
    campaignName: escapeHtml(campaignName),
    placement: escapeHtml(placement),
    productName: escapeHtml(productName),
    priceText: escapeHtml(priceText),
    startDate: escapeHtml(startDate),
    endDate: escapeHtml(endDate),
    postTime: escapeHtml(postTime),
    postType: escapeHtml(postType),
    weekCount: escapeHtml(String(weekCount)),
  };

  const multiWeekRowsHtml = isMultiWeek
    ? rows
        .map((row, index) => {
          const weekPlacement = String(row?.placement || "").trim();
          const weekProductName = String(row?.product_name || "").trim();
          const weekPriceText = formatPendingReceiptPrice(row?.price);
          const weekDate = String(row?.post_date_from || row?.post_date || "").trim();
          const weekTime = String(row?.post_time || "").trim();
          const scheduleSummary =
            weekDate && weekTime
              ? `${escapeHtml(weekDate)} at ${escapeHtml(weekTime)}`
              : weekDate
                ? escapeHtml(weekDate)
                : "TBD";

          return `
            <div class="info-row">
              <span class="label">Week ${index + 1}:</span>
              ${escapeHtml(String(row?.ad_name || campaignName).trim() || campaignName)}
              ${weekPlacement ? `, ${escapeHtml(weekPlacement)}` : ""}
              ${weekProductName ? `, ${escapeHtml(weekProductName)}` : ""}
              ${weekPriceText ? `, ${escapeHtml(weekPriceText)}` : ""}
              , ${scheduleSummary}
            </div>
          `;
        })
        .join("")
    : "";

  return {
    to: normalizedEmail,
    subject: isMultiWeek
      ? `Multi-week Booking Request Received (Pending) - ${campaignName.replace(/[\r\n]+/g, " ").trim()}`
      : `Ad Submission Received (Pending) - ${campaignName.replace(/[\r\n]+/g, " ").trim()}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #0066cc; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .info-block { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .footer { text-align: center; padding: 20px 0; border-top: 1px solid #ddd; color: #777; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cbnads.com/icons/icon-512.png" alt="Logo" class="logo">
    </div>

    <div class="content">
      <h2>${isMultiWeek ? "Thank You for Your Multi-week Booking Request" : "Thank You for Your Ad Submission"}</h2>
      <p>Dear ${escaped.contactName},</p>
      <p>Your advertiser account has been created and we have your submission on file.</p>

      <div class="info-block">
        <div class="info-row"><span class="label">Advertiser Name:</span> ${escaped.advertiserName}</div>
        <div class="info-row"><span class="label">Email:</span> ${escaped.email}</div>
        ${normalizedPhoneNumber ? `<div class="info-row"><span class="label">Phone:</span> ${escaped.phoneNumber}</div>` : ""}
        <div class="info-row"><span class="label">${isMultiWeek ? "Campaign Name" : "Ad Name"}:</span> ${escaped.campaignName}</div>
        ${isMultiWeek ? `<div class="info-row"><span class="label">Weeks:</span> ${escaped.weekCount}</div>` : ""}
        ${!isMultiWeek && postType ? `<div class="info-row"><span class="label">Post Type:</span> ${escaped.postType}</div>` : ""}
        ${productName ? `<div class="info-row"><span class="label">Product:</span> ${escaped.productName}</div>` : ""}
        ${placement ? `<div class="info-row"><span class="label">Placement:</span> ${escaped.placement}</div>` : ""}
        ${priceText ? `<div class="info-row"><span class="label">Quoted Price:</span> ${escaped.priceText} per scheduled post</div>` : ""}
        ${!isMultiWeek && startDate ? `<div class="info-row"><span class="label">Start Date:</span> ${escaped.startDate}</div>` : ""}
        ${!isMultiWeek && endDate ? `<div class="info-row"><span class="label">End Date:</span> ${escaped.endDate}</div>` : ""}
        ${!isMultiWeek && postTime ? `<div class="info-row"><span class="label">Post Time:</span> ${escaped.postTime}</div>` : ""}
        ${multiWeekRowsHtml}
      </div>

      <p><strong>Next Steps:</strong></p>
      <p>Your submission is now in <strong>Pending</strong> status while our team reviews it. Once approved and invoiced, you will receive a <strong>Ready for Payment</strong> email.</p>
      <p>Best regards,<br>CBN Team</p>
    </div>

    <div class="footer">
      <p>This is an automated confirmation email. Please do not reply to this message.</p>
    </div>
  </div>
</body>
</html>
`,
  };
};

export async function sendPendingSubmissionAdvertiserReceipt({
  request: _request,
  pendingAdId,
  supabase = db(),
}) {
  const normalizedPendingAdId = String(pendingAdId || "").trim();
  if (!normalizedPendingAdId) {
    return { sent: false, reason: "missing_pending_ad" };
  }

  const pendingAd = await fetchPendingAdById(supabase, normalizedPendingAdId);
  if (!pendingAd?.id) {
    return { sent: false, reason: "pending_ad_not_found" };
  }

  const pendingAds =
    pendingAd?.series_id
      ? await fetchPendingAdsBySeriesId(supabase, pendingAd.series_id)
      : [pendingAd];
  const receiptRows =
    Array.isArray(pendingAds) && pendingAds.length > 0 ? pendingAds : [pendingAd];

  if (receiptRows.some((row) => String(row?.advertiser_receipt_sent_at || "").trim())) {
    return { sent: false, reason: "already_sent" };
  }

  const emailPayload = buildPendingSubmissionReceiptEmail({
    pendingAd,
    pendingAds: receiptRows,
  });

  if (!emailPayload.to) {
    return { sent: false, reason: "missing_email" };
  }

  await sendEmail(emailPayload);

  const receiptSentAt = new Date().toISOString();
  const updateQuery =
    pendingAd?.series_id
      ? supabase
          .from(table("pending_ads"))
          .update({
            advertiser_receipt_sent_at: receiptSentAt,
            updated_at: receiptSentAt,
          })
          .eq("series_id", pendingAd.series_id)
      : supabase
          .from(table("pending_ads"))
          .update({
            advertiser_receipt_sent_at: receiptSentAt,
            updated_at: receiptSentAt,
          })
          .eq("id", normalizedPendingAdId);

  const { error } = await updateQuery;
  if (error) {
    const missingColumn = missingColumnName(error);
    if (missingColumn !== "advertiser_receipt_sent_at") {
      throw error;
    }
  }

  return { sent: true };
}

const buildPendingSubmissionInternalTelegramText = ({
  pendingAd,
  pendingAds = [],
  reviewSubmissionUrl,
}) => {
  const rows = Array.isArray(pendingAds) && pendingAds.length > 0 ? pendingAds : [pendingAd];
  const firstPendingAd = rows[0] || pendingAd;
  const isMultiWeek =
    rows.length > 1 || Number(firstPendingAd?.series_total || 0) > 1;

  if (isMultiWeek) {
    return [
      "<b>New Multi-week Booking Request (Pending)</b>",
      "",
      `<b>Advertiser:</b> ${escapeHtml(String(firstPendingAd?.advertiser_name || "").trim())}`,
      `<b>Contact:</b> ${escapeHtml(String(firstPendingAd?.contact_name || "").trim())} (${escapeHtml(String(firstPendingAd?.email || "").trim().toLowerCase())})`,
      `<b>Campaign:</b> ${escapeHtml(String(firstPendingAd?.ad_name || "").trim())}`,
      `<b>Weeks:</b> ${escapeHtml(String(rows.length))}`,
      `<b>Week 1 starts:</b> ${escapeHtml(String(firstPendingAd?.series_week_start || firstPendingAd?.post_date_from || "").trim())}`,
      firstPendingAd?.placement
        ? `<b>Placement:</b> ${escapeHtml(String(firstPendingAd.placement).trim())}`
        : "",
      firstPendingAd?.product_name
        ? `<b>Product:</b> ${escapeHtml(String(firstPendingAd.product_name).trim())}`
        : "",
      firstPendingAd?.series_id
        ? `<b>Series ID:</b> ${escapeHtml(String(firstPendingAd.series_id).trim())}`
        : "",
      reviewSubmissionUrl ? `<b>Review:</b> ${escapeHtml(reviewSubmissionUrl)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "<b>New Ad Submission Received (Pending)</b>",
    "",
    `<b>Advertiser:</b> ${escapeHtml(String(firstPendingAd?.advertiser_name || "").trim())}`,
    `<b>Contact:</b> ${escapeHtml(String(firstPendingAd?.contact_name || "").trim())} (${escapeHtml(String(firstPendingAd?.email || "").trim().toLowerCase())})`,
    `<b>Ad:</b> ${escapeHtml(String(firstPendingAd?.ad_name || "").trim())}`,
    `<b>Post Type:</b> ${escapeHtml(String(firstPendingAd?.post_type || "").trim())}`,
    firstPendingAd?.product_name
      ? `<b>Product:</b> ${escapeHtml(String(firstPendingAd.product_name).trim())}`
      : "",
    firstPendingAd?.placement
      ? `<b>Placement:</b> ${escapeHtml(String(firstPendingAd.placement).trim())}`
      : "",
    Number(firstPendingAd?.price) > 0
      ? `<b>Quoted Price:</b> ${escapeHtml(formatCurrency(firstPendingAd.price))} per scheduled post`
      : "",
    firstPendingAd?.post_date_from
      ? `<b>Start Date:</b> ${escapeHtml(String(firstPendingAd.post_date_from).trim())}`
      : "",
    firstPendingAd?.post_date_to
      ? `<b>End Date:</b> ${escapeHtml(String(firstPendingAd.post_date_to).trim())}`
      : "",
    firstPendingAd?.post_time
      ? `<b>Post Time:</b> ${escapeHtml(String(firstPendingAd.post_time).trim())}`
      : "",
    reviewSubmissionUrl ? `<b>Review:</b> ${escapeHtml(reviewSubmissionUrl)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

export async function sendPendingSubmissionInternalTelegramNotification({
  request,
  pendingAdId,
  supabase = db(),
}) {
  const normalizedPendingAdId = String(pendingAdId || "").trim();
  if (!normalizedPendingAdId) {
    return { sent: false, reason: "missing_pending_ad" };
  }

  const pendingAd = await fetchPendingAdById(supabase, normalizedPendingAdId);
  if (!pendingAd?.id) {
    return { sent: false, reason: "pending_ad_not_found" };
  }

  const pendingAds =
    pendingAd?.series_id
      ? await fetchPendingAdsBySeriesId(supabase, pendingAd.series_id)
      : [pendingAd];
  const telegramRows =
    Array.isArray(pendingAds) && pendingAds.length > 0 ? pendingAds : [pendingAd];

  if (telegramRows.some((row) => String(row?.internal_telegram_sent_at || "").trim())) {
    return { sent: false, reason: "already_sent" };
  }

  const reviewSubmissionUrl = buildReviewSubmissionUrl(request);
  const telegramText = buildPendingSubmissionInternalTelegramText({
    pendingAd,
    pendingAds: telegramRows,
    reviewSubmissionUrl,
  });

  if (!telegramText) {
    return { sent: false, reason: "missing_telegram_payload" };
  }

  const notificationResult = await notifyInternalChannels({
    supabase,
    telegramText,
  });

  if (!notificationResult?.telegram_sent) {
    return {
      sent: false,
      reason: notificationResult?.telegram_error || "telegram_not_sent",
    };
  }

  const sentAt = new Date().toISOString();
  const updateQuery =
    pendingAd?.series_id
      ? supabase
          .from(table("pending_ads"))
          .update({
            internal_telegram_sent_at: sentAt,
            updated_at: sentAt,
          })
          .eq("series_id", pendingAd.series_id)
      : supabase
          .from(table("pending_ads"))
          .update({
            internal_telegram_sent_at: sentAt,
            updated_at: sentAt,
          })
          .eq("id", normalizedPendingAdId);

  const { error } = await updateQuery;
  if (error) {
    const missingColumn = missingColumnName(error);
    if (missingColumn !== "internal_telegram_sent_at") {
      throw error;
    }
  }

  return { sent: true };
}

const buildPendingSubmissionInternalEmailPayload = ({
  pendingAd,
  pendingAds = [],
  reviewSubmissionUrl,
}) => {
  const rows = Array.isArray(pendingAds) && pendingAds.length > 0 ? pendingAds : [pendingAd];
  const firstPendingAd = rows[0] || pendingAd;
  const isMultiWeek =
    rows.length > 1 || Number(firstPendingAd?.series_total || 0) > 1;

  const advertiserName = String(firstPendingAd?.advertiser_name || "").trim();
  const contactName = String(firstPendingAd?.contact_name || "").trim();
  const normalizedEmail = String(firstPendingAd?.email || "").trim().toLowerCase();
  const normalizedPhoneNumber = String(
    firstPendingAd?.phone_number || firstPendingAd?.phone || "",
  ).trim();
  const campaignName = String(firstPendingAd?.ad_name || "Submission").trim();
  const placement = String(firstPendingAd?.placement || "").trim();
  const productName = String(firstPendingAd?.product_name || "").trim();
  const quotedPriceText = formatPendingReceiptPrice(firstPendingAd?.price);
  const safeSubjectAdName = campaignName.replace(/[\r\n]+/g, " ").trim();
  const safeSubjectAdvertiserName = advertiserName.replace(/[\r\n]+/g, " ").trim();

  const escaped = {
    advertiserName: escapeHtml(advertiserName),
    contactName: escapeHtml(contactName),
    email: escapeHtml(normalizedEmail),
    phoneNumber: escapeHtml(normalizedPhoneNumber),
    campaignName: escapeHtml(campaignName),
    placement: escapeHtml(placement),
    productName: escapeHtml(productName),
    quotedPriceText: escapeHtml(quotedPriceText),
  };

  const weekRowsHtml = isMultiWeek
    ? rows
        .map((row, index) => {
          const weekDate = String(row?.post_date_from || row?.post_date || "").trim();
          const weekTime = String(row?.post_time || "").trim();
          const scheduleSummary =
            weekDate && weekTime
              ? `${escapeHtml(weekDate)} ${escapeHtml(weekTime)}`
              : weekDate
                ? escapeHtml(weekDate)
                : "TBD";

          return `
            <div class="info-row">
              <span class="label">Week ${index + 1}:</span>
              ${escapeHtml(String(row?.ad_name || campaignName).trim() || campaignName)} | ${scheduleSummary}
            </div>
          `;
        })
        .join("")
    : "";

  const customDateItems = rows
    .flatMap((row) => (Array.isArray(row?.custom_dates) ? row.custom_dates : []))
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const dateValue = String(entry.date || "").trim();
        const timeValue = String(entry.time || "").trim().slice(0, 5);
        if (!dateValue) {
          return "";
        }
        return escapeHtml(timeValue ? `${dateValue} ${timeValue}` : dateValue);
      }
      const dateValue = String(entry || "").trim();
      return dateValue ? escapeHtml(dateValue) : "";
    })
    .filter(Boolean);

  return {
    emailSubject: isMultiWeek
      ? `New Multi-week Booking - ${safeSubjectAdName} from ${safeSubjectAdvertiserName}`
      : `New Ad Submission - ${safeSubjectAdName} from ${safeSubjectAdvertiserName}`,
    emailHtml: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #0066cc; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    .info-section { margin: 25px 0; }
    .section-title { font-size: 18px; font-weight: bold; color: #0066cc; margin-bottom: 15px; border-bottom: 2px solid #0066cc; padding-bottom: 5px; }
    .info-block { background: #f8f9fa; padding: 20px; margin: 10px 0; border-radius: 5px; }
    .info-row { margin: 8px 0; }
    .label { font-weight: bold; color: #555; min-width: 150px; display: inline-block; }
    .button { display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
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
        <strong>${isMultiWeek ? "New Multi-week Booking Request (Pending)" : "New Ad Submission Received (Pending)"}</strong>
      </div>

      <div class="info-section">
        <div class="section-title">Advertiser Information</div>
        <div class="info-block">
          <div class="info-row"><span class="label">Advertiser Name:</span> ${escaped.advertiserName}</div>
          <div class="info-row"><span class="label">Contact Name:</span> ${escaped.contactName}</div>
          <div class="info-row"><span class="label">Email:</span> <a href="mailto:${escaped.email}">${escaped.email}</a></div>
          ${normalizedPhoneNumber ? `<div class="info-row"><span class="label">Phone Number:</span> ${escaped.phoneNumber}</div>` : ""}
        </div>
      </div>

      <div class="info-section">
        <div class="section-title">${isMultiWeek ? "Booking" : "Ad Details"}</div>
        <div class="info-block">
          <div class="info-row"><span class="label">${isMultiWeek ? "Campaign Name" : "Ad Name"}:</span> ${escaped.campaignName}</div>
          ${!isMultiWeek ? `<div class="info-row"><span class="label">Post Type:</span> ${escapeHtml(String(firstPendingAd?.post_type || "").trim())}</div>` : ""}
          ${productName ? `<div class="info-row"><span class="label">Product:</span> ${escaped.productName}</div>` : ""}
          ${placement ? `<div class="info-row"><span class="label">Placement:</span> ${escaped.placement}</div>` : ""}
          ${quotedPriceText ? `<div class="info-row"><span class="label">Quoted Price:</span> ${escaped.quotedPriceText} per scheduled post</div>` : ""}
          ${isMultiWeek ? `<div class="info-row"><span class="label">Weeks:</span> ${escapeHtml(String(rows.length))}</div>` : ""}
          ${weekRowsHtml}
          ${!isMultiWeek && firstPendingAd?.post_date_from ? `<div class="info-row"><span class="label">Start Date:</span> ${escapeHtml(String(firstPendingAd.post_date_from).trim())}</div>` : ""}
          ${!isMultiWeek && firstPendingAd?.post_date_to ? `<div class="info-row"><span class="label">End Date:</span> ${escapeHtml(String(firstPendingAd.post_date_to).trim())}</div>` : ""}
          ${!isMultiWeek && firstPendingAd?.post_time ? `<div class="info-row"><span class="label">Post Time:</span> ${escapeHtml(String(firstPendingAd.post_time).trim())}</div>` : ""}
          ${customDateItems.length > 0
            ? `
              <div class="info-row">
                <span class="label">Custom Dates:</span>
                <ul style="margin: 5px 0;">
                  ${customDateItems.map((item) => `<li>${item}</li>`).join("")}
                </ul>
              </div>
            `
            : ""}
        </div>
      </div>

      ${reviewSubmissionUrl
        ? `
          <div style="text-align: center; margin-top: 30px;">
            <a href="${escapeHtml(reviewSubmissionUrl)}" class="button">Review Submission</a>
          </div>
        `
        : ""}
    </div>

    <div class="footer">
      <p>Submission received at ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
`,
  };
};

export async function sendPendingSubmissionInternalEmailNotification({
  request,
  pendingAdId,
  supabase = db(),
}) {
  const normalizedPendingAdId = String(pendingAdId || "").trim();
  if (!normalizedPendingAdId) {
    return { sent: false, reason: "missing_pending_ad" };
  }

  const pendingAd = await fetchPendingAdById(supabase, normalizedPendingAdId);
  if (!pendingAd?.id) {
    return { sent: false, reason: "pending_ad_not_found" };
  }

  const pendingAds =
    pendingAd?.series_id
      ? await fetchPendingAdsBySeriesId(supabase, pendingAd.series_id)
      : [pendingAd];
  const emailRows =
    Array.isArray(pendingAds) && pendingAds.length > 0 ? pendingAds : [pendingAd];

  if (emailRows.some((row) => String(row?.internal_email_sent_at || "").trim())) {
    return { sent: false, reason: "already_sent" };
  }

  const reviewSubmissionUrl = buildReviewSubmissionUrl(request);
  const emailPayload = buildPendingSubmissionInternalEmailPayload({
    pendingAd,
    pendingAds: emailRows,
    reviewSubmissionUrl,
  });

  const notificationResult = await notifyInternalChannels({
    supabase,
    emailSubject: emailPayload.emailSubject,
    emailHtml: emailPayload.emailHtml,
  });

  if (!notificationResult?.email_sent) {
    return {
      sent: false,
      reason: notificationResult?.email_error || "internal_email_not_sent",
    };
  }

  const sentAt = new Date().toISOString();
  const updateQuery =
    pendingAd?.series_id
      ? supabase
          .from(table("pending_ads"))
          .update({
            internal_email_sent_at: sentAt,
            updated_at: sentAt,
          })
          .eq("series_id", pendingAd.series_id)
      : supabase
          .from(table("pending_ads"))
          .update({
            internal_email_sent_at: sentAt,
            updated_at: sentAt,
          })
          .eq("id", normalizedPendingAdId);

  const { error } = await updateQuery;
  if (error) {
    const missingColumn = missingColumnName(error);
    if (missingColumn !== "internal_email_sent_at") {
      throw error;
    }
  }

  return { sent: true };
}

export async function sendPendingSubmissionAdminWhatsAppNotification({
  pendingAdId,
  supabase = db(),
}) {
  const normalizedPendingAdId = String(pendingAdId || "").trim();
  if (!normalizedPendingAdId) {
    return { sent: false, reason: "missing_pending_ad" };
  }

  const pendingAd = await fetchPendingAdById(supabase, normalizedPendingAdId);
  if (!pendingAd?.id) {
    return { sent: false, reason: "pending_ad_not_found" };
  }

  const pendingAds =
    pendingAd?.series_id
      ? await fetchPendingAdsBySeriesId(supabase, pendingAd.series_id)
      : [pendingAd];
  const whatsappRows =
    Array.isArray(pendingAds) && pendingAds.length > 0 ? pendingAds : [pendingAd];

  if (whatsappRows.some((row) => String(row?.admin_whatsapp_sent_at || "").trim())) {
    return { sent: false, reason: "already_sent" };
  }

  const adminWhatsApp = process.env.WHATSAPP_BROADCAST_NUMBER;
  if (!adminWhatsApp) {
    return { sent: false, reason: "missing_whatsapp_recipient" };
  }

  const firstPendingAd = whatsappRows[0] || pendingAd;
  const sent = await sendWhatsAppInteractive({
    to: adminWhatsApp,
    adId: firstPendingAd.id,
    advertiserName: String(firstPendingAd?.advertiser_name || "").trim(),
    adName: String(firstPendingAd?.ad_name || "").trim() || "Untitled Ad",
  });

  if (!sent) {
    return { sent: false, reason: "whatsapp_not_sent" };
  }

  const sentAt = new Date().toISOString();
  const updateQuery =
    pendingAd?.series_id
      ? supabase
          .from(table("pending_ads"))
          .update({
            admin_whatsapp_sent_at: sentAt,
            updated_at: sentAt,
          })
          .eq("series_id", pendingAd.series_id)
      : supabase
          .from(table("pending_ads"))
          .update({
            admin_whatsapp_sent_at: sentAt,
            updated_at: sentAt,
          })
          .eq("id", normalizedPendingAdId);

  const { error } = await updateQuery;
  if (error) {
    const missingColumn = missingColumnName(error);
    if (missingColumn !== "admin_whatsapp_sent_at") {
      throw error;
    }
  }

  return { sent: true };
}

const insertPendingAd = async (supabase, payload) => {
  const insertPayload = { ...payload };

  while (true) {
    const result = await supabase.from(table("pending_ads")).insert(insertPayload).select("*").single();

    if (!result.error) {
      return {
        row: result.data || null,
        created: true,
      };
    }

    const sourceRequestKey = normalizeSourceRequestKey(insertPayload.source_request_key);
    if (sourceRequestKey && isSourceRequestKeyUniqueViolation(result.error)) {
      const existingRow = await fetchPendingAdBySourceRequestKey(supabase, sourceRequestKey);
      if (existingRow) {
        return {
          row: existingRow,
          created: false,
        };
      }
    }

    const missingColumn = missingColumnName(result.error);
    if (
      missingColumn &&
      optionalPendingSubmissionColumns.has(missingColumn) &&
      Object.prototype.hasOwnProperty.call(insertPayload, missingColumn)
    ) {
      delete insertPayload[missingColumn];
      continue;
    }

    throw result.error;
  }
};

const insertPendingAds = async (supabase, payloads) => {
  let insertPayloads = payloads.map((payload) => ({ ...payload }));

  while (true) {
    const result = await supabase.from(table("pending_ads")).insert(insertPayloads).select("*");

    if (!result.error) {
      return {
        rows: Array.isArray(result.data) ? result.data : [],
        created: true,
      };
    }

    const sourceRequestKeys = insertPayloads
      .map((payload) => normalizeSourceRequestKey(payload?.source_request_key))
      .filter(Boolean);

    if (
      sourceRequestKeys.length > 0 &&
      sourceRequestKeys.length === insertPayloads.length &&
      isSourceRequestKeyUniqueViolation(result.error)
    ) {
      const existingRows = await fetchPendingAdsBySourceRequestKeys(supabase, sourceRequestKeys);
      if (existingRows.length === sourceRequestKeys.length) {
        return {
          rows: existingRows,
          created: false,
        };
      }
    }

    const missingColumn = missingColumnName(result.error);
    if (missingColumn && optionalPendingSubmissionColumns.has(missingColumn)) {
      insertPayloads = insertPayloads.map((payload) => {
        if (Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
          const next = { ...payload };
          delete next[missingColumn];
          return next;
        }
        return payload;
      });
      continue;
    }

    throw result.error;
  }
};

const createSeriesId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

export async function createPendingAdSubmission({
  request,
  submission = {},
  supabase = db(),
  requirePhoneNumber = true,
  requireProductForMultiWeek = true,
  sourceRequestKey = null,
  sendAdvertiserReceipt = true,
  sendInternalEmailNotification = true,
  sendInternalTelegramNotification = true,
  sendAdminWhatsAppNotification = true,
}) {
  const {
    advertiser_id,
    advertiser_name,
    contact_name,
    email,
    phone_number,
    ad_name,
    post_type,
    post_date_from,
    post_date_to,
    custom_dates,
    post_time,
    reminder_minutes,
    ad_text,
    media,
    placement,
    product_id,
    notes,
    multi_week,
  } = submission;

  const normalizedPostType = normalizePostType(post_type);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPhoneNumber = normalizeUSPhoneNumber(phone_number || "");
  const normalizedCustomDates = readCustomDates(custom_dates);
  const normalizedProductId = String(product_id || "").trim();
  const normalizedSourceRequestKey = normalizeSourceRequestKey(sourceRequestKey);
  const resolvedAdName =
    String(ad_name || "").trim() ||
    (Array.isArray(multi_week?.overrides)
      ? multi_week.overrides
          .map((item) => String(item?.ad_name || "").trim())
          .find(Boolean) || ""
      : "") ||
    (multi_week && typeof multi_week === "object" ? "Multi-week booking" : "");
  let selectedProduct = null;

  const topLevelLimitError =
    validateTextLimit(advertiser_name, ADVERTISER_NAME_MAX_LENGTH, "Advertiser name") ||
    validateTextLimit(contact_name, PERSON_NAME_MAX_LENGTH, "Contact name") ||
    validateTextLimit(normalizedEmail, EMAIL_MAX_LENGTH, "Email") ||
    validateTextLimit(ad_name, AD_NAME_MAX_LENGTH, "Ad name") ||
    validateTextLimit(ad_text, AD_TEXT_MAX_LENGTH, "Ad text") ||
    validateTextLimit(notes, NOTES_MAX_LENGTH, "Notes") ||
    validateTextLimit(placement, PLACEMENT_MAX_LENGTH, "Placement");

  if (topLevelLimitError) {
    return {
      error: topLevelLimitError,
      status: 400,
    };
  }

  const inputMedia = Array.isArray(media) ? media : [];
  if (inputMedia.length > MEDIA_ITEM_MAX_COUNT) {
    return {
      error: `A submission can include up to ${MEDIA_ITEM_MAX_COUNT} attachments.`,
      status: 400,
    };
  }

  if (normalizedCustomDates.length > CUSTOM_DATE_MAX_COUNT) {
    return {
      error: `Custom schedules can include up to ${CUSTOM_DATE_MAX_COUNT} dates.`,
      status: 400,
    };
  }

  if (!advertiser_name || !contact_name || !normalizedEmail || !resolvedAdName || !post_type) {
    return {
      error: "Missing required fields",
      status: 400,
    };
  }

  const isMultiWeek = Boolean(multi_week && typeof multi_week === "object");
  if (!isMultiWeek && !["one_time", "daily_run", "custom_schedule"].includes(normalizedPostType)) {
    return { error: "Unsupported post type", status: 400 };
  }

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  if (!isEmailValid) {
    return {
      error: "Invalid email address",
      status: 400,
    };
  }

  if (requirePhoneNumber && !isCompleteUSPhoneNumber(normalizedPhoneNumber)) {
    return {
      error: "Phone number must be a complete US number",
      status: 400,
    };
  }

  if (!requirePhoneNumber && normalizedPhoneNumber && !isCompleteUSPhoneNumber(normalizedPhoneNumber)) {
    return {
      error: "Phone number must be a complete US number",
      status: 400,
    };
  }

  const shouldResolveTopLevelProduct = normalizedProductId && (!isMultiWeek || requireProductForMultiWeek);

  if (shouldResolveTopLevelProduct) {
    const { data: productRow, error: productError } = await supabase
      .from(table("products"))
      .select("id, product_name, placement, price")
      .eq("id", normalizedProductId)
      .maybeSingle();

    if (productError) {
      throw productError;
    }

    if (!productRow) {
      return {
        error: "Selected product was not found",
        status: 400,
      };
    }

    selectedProduct = productRow;
  }

  const sanitizeMediaArray = (input) => {
    const items = (Array.isArray(input) ? input : []).slice(0, MEDIA_ITEM_MAX_COUNT);

    return items
      .map((item) => {
        if (item && typeof item === "object") {
          const safeUrl = toSafeHttpUrl(item.url || item.cdnUrl || "");
          if (!safeUrl) return null;
          const mediaType = resolveMediaType(item);
          if (!["image", "video", "audio", "document"].includes(mediaType)) {
            return null;
          }
          return {
            ...item,
            type: mediaType,
            url: safeUrl,
            cdnUrl: toSafeHttpUrl(item.cdnUrl || safeUrl) || safeUrl,
          };
        }

        const safeUrl = toSafeHttpUrl(item);
        if (!safeUrl) return null;
        return { type: "document", url: safeUrl, cdnUrl: safeUrl };
      })
      .filter(Boolean);
  };

  if (isMultiWeek) {
    if (requireProductForMultiWeek && !normalizedProductId) {
      return {
        error: "Select a base product for this multi-week booking",
        status: 400,
      };
    }

    const weeks = clampWeeks(multi_week.weeks, { min: 2, max: MULTI_WEEK_MAX_COUNT, fallback: 4 });
    const seriesWeekStart = normalizeDateKeyStrict(multi_week.series_week_start);
    if (!seriesWeekStart) {
      return { error: "Week 1 start date is required", status: 400 };
    }

    const overrides = Array.isArray(multi_week.overrides) ? multi_week.overrides : [];
    if (overrides.length > MULTI_WEEK_MAX_COUNT) {
      return {
        error: `Multi-week bookings can include up to ${MULTI_WEEK_MAX_COUNT} weeks.`,
        status: 400,
      };
    }

    let overrideLimitError = "";
    for (const item of overrides) {
      if (!item || typeof item !== "object") {
        continue;
      }

      overrideLimitError =
        validateTextLimit(item.ad_name, AD_NAME_MAX_LENGTH, "Week ad name") ||
        validateTextLimit(item.ad_text, AD_TEXT_MAX_LENGTH, "Week ad text") ||
        validateTextLimit(item.placement, PLACEMENT_MAX_LENGTH, "Week placement") ||
        (Array.isArray(item.media) && item.media.length > MEDIA_ITEM_MAX_COUNT
          ? `Each week can include up to ${MEDIA_ITEM_MAX_COUNT} attachments.`
          : "");

      if (overrideLimitError) {
        break;
      }
    }
    if (overrideLimitError) {
      return {
        error: overrideLimitError,
        status: 400,
      };
    }

    const seriesId = String(multi_week.series_id || "").trim() || createSeriesId();
    const weekStarts = buildSeriesWeekStarts({ seriesWeekStart, weeks });

    const overrideProductIds = requireProductForMultiWeek
      ? overrides
          .map((item) => (item && typeof item === "object" ? String(item.product_id || "").trim() : ""))
          .filter(Boolean)
      : [];

    const productsById = new Map();
    if (selectedProduct?.id) {
      productsById.set(String(selectedProduct.id), selectedProduct);
    }

    const neededProductIds = Array.from(
      new Set(requireProductForMultiWeek ? [normalizedProductId, ...overrideProductIds] : []),
    )
      .filter(Boolean)
      .filter((id) => !productsById.has(String(id)));

    if (neededProductIds.length > 0) {
      const { data: extraProducts, error: extraProductsError } = await supabase
        .from(table("products"))
        .select("id, product_name, placement, price")
        .in("id", neededProductIds);

      if (extraProductsError) {
        throw extraProductsError;
      }

      (Array.isArray(extraProducts) ? extraProducts : []).forEach((row) => {
        if (row?.id) {
          productsById.set(String(row.id), row);
        }
      });
    }

    const baseProductRow =
      requireProductForMultiWeek && normalizedProductId
        ? productsById.get(String(normalizedProductId))
        : null;
    if (requireProductForMultiWeek && normalizedProductId && !baseProductRow) {
      return {
        error: "Selected base product was not found",
        status: 400,
      };
    }
    const basePlacement = String(baseProductRow?.placement || placement || "").trim();
    const basePrice = Number(baseProductRow?.price || 0) || 0;
    const savedPriceText = baseProductRow ? formatCurrency(basePrice) : "";
    const nowIso = new Date().toISOString();
    const reminderMinutesValue = parseReminderMinutes(reminder_minutes, 15);

    const baseCreative = {
      ad_name: resolvedAdName,
      ad_text,
      media: sanitizeMediaArray(media),
    };

    const invalidScheduleIndex = overrides.findIndex((item) => {
      if (!item || typeof item !== "object" || item.schedule_tbd) {
        return false;
      }
      return !normalizeDateKeyStrict(item.post_date_from) || !String(item.post_time || "").trim();
    });
    if (invalidScheduleIndex >= 0) {
      return {
        error: `Week ${invalidScheduleIndex + 1} needs a date/time or must be marked TBD`,
        status: 400,
      };
    }

    const pendingPayloads = weekStarts.map((weekInfo, idx) => {
      const override = overrides[idx] && typeof overrides[idx] === "object" ? overrides[idx] : {};
      const overrideProductId = requireProductForMultiWeek
        ? String(override.product_id || "").trim()
        : "";
      const chosenProductId = requireProductForMultiWeek
        ? overrideProductId || normalizedProductId
        : "";
      const productRow = chosenProductId ? productsById.get(String(chosenProductId)) : null;
      if (chosenProductId && !productRow) {
        throw new Error(`Product not found for week ${weekInfo.series_index}`);
      }

      const overridePlacement = String(override.placement || "").trim();
      const resolvedPlacement = String(overridePlacement || productRow?.placement || basePlacement || "").trim();
      const savedPrice = Number(productRow?.price || 0) || 0;
      const scheduleTbd = Boolean(override.schedule_tbd);
      const postDate = normalizeDateKeyStrict(override.post_date_from);
      const postTime = scheduleTbd ? null : String(override.post_time || "").trim() || null;
      const reminderMinutes = parseReminderMinutes(override.reminder_minutes, reminderMinutesValue);

      const creative = resolveWeeklyCreative({
        base: baseCreative,
        override: {
          ad_name: override.ad_name,
          ad_text: override.ad_text,
          use_base_media: override.use_base_media,
          media: sanitizeMediaArray(override.media),
        },
        index: weekInfo.series_index,
      });

      const weekNote = `[Multi-week booking] Week ${weekInfo.series_index} of ${weekInfo.series_total} (week of ${weekInfo.series_week_start})`;
      const combinedNotes = String(notes || "").trim();
      const finalNotes = combinedNotes ? `${combinedNotes}\n\n${weekNote}` : weekNote;

      return {
        advertiser_id: advertiser_id || null,
        advertiser_name,
        contact_name,
        email: normalizedEmail,
        phone_number: normalizedPhoneNumber || null,
        phone: normalizedPhoneNumber || null,
        ad_name: creative.ad_name,
        post_type: "one_time",
        post_date: scheduleTbd ? null : postDate,
        post_date_from: scheduleTbd ? null : postDate,
        post_date_to: null,
        custom_dates: [],
        post_time: scheduleTbd ? null : postTime,
        reminder_minutes: reminderMinutes,
        ad_text: creative.ad_text,
        media: creative.media,
        placement: resolvedPlacement || null,
        product_id: productRow ? String(productRow.id || "") || null : null,
        product_name: productRow?.product_name || null,
        price: savedPrice,
        notes: finalNotes || null,
        status: "pending",
        viewed_by_admin: false,
        created_at: nowIso,
        updated_at: nowIso,
        source_request_key: buildSourceRequestKey(
          normalizedSourceRequestKey,
          `week:${weekInfo.series_index}`,
        ),
        series_id: seriesId,
        series_index: weekInfo.series_index,
        series_total: weekInfo.series_total,
        series_week_start: weekInfo.series_week_start,
      };
    });

    const pendingSourceRequestKeys = pendingPayloads
      .map((payload) => normalizeSourceRequestKey(payload?.source_request_key))
      .filter(Boolean);

    if (
      pendingSourceRequestKeys.length > 0 &&
      pendingSourceRequestKeys.length === pendingPayloads.length
    ) {
      const existingPendingAds = await fetchPendingAdsBySourceRequestKeys(
        supabase,
        pendingSourceRequestKeys,
      );
      if (existingPendingAds.length === pendingSourceRequestKeys.length) {
        const firstPendingAd = existingPendingAds[0] || null;
        return {
          pendingAd: firstPendingAd,
          pendingAds: existingPendingAds,
          series_id: String(firstPendingAd?.series_id || "").trim() || seriesId,
        };
      }
    }

    for (let idx = 0; idx < pendingPayloads.length; idx += 1) {
      const payload = pendingPayloads[idx];
      if (!payload.post_date_from || !payload.post_time) {
        continue;
      }

      const availability = await checkSingleDateAvailability({
        supabase,
        date: payload.post_date_from,
        postType: "one_time",
        postTime: payload.post_time,
      });

      if (!availability.available) {
        return {
          error: availability.is_day_full
            ? `Week ${idx + 1}: ad limit reached for this date. Please choose another date or mark it TBD.`
            : `Week ${idx + 1}: this time slot is already booked. Please choose a different time or mark it TBD.`,
          status: 400,
        };
      }
    }

    const insertPendingResult = await insertPendingAds(supabase, pendingPayloads);
    const insertedPendingAds = insertPendingResult.rows;
    const firstPendingAd = insertedPendingAds[0] || null;

    if (!insertPendingResult.created) {
      return {
        pendingAd: firstPendingAd,
        pendingAds: insertedPendingAds,
        series_id: String(firstPendingAd?.series_id || "").trim() || seriesId,
      };
    }

    const escaped = {
      advertiser_name: escapeHtml(advertiser_name),
      contact_name: escapeHtml(contact_name),
      email: escapeHtml(normalizedEmail),
      phone_number: escapeHtml(normalizedPhoneNumber),
      ad_name: escapeHtml(resolvedAdName),
      post_type: escapeHtml("Multi-week booking (TBD)"),
      placement: escapeHtml(basePlacement),
      product_name: escapeHtml(baseProductRow?.product_name || ""),
      price: escapeHtml(savedPriceText),
      series_week_start: escapeHtml(seriesWeekStart),
      weeks: escapeHtml(String(weeks)),
      notes: escapeHtml(notes),
    };

    const safeSubjectAdName = String(resolvedAdName || "").replace(/[\r\n]+/g, " ").trim();
    const safeSubjectAdvertiserName = String(advertiser_name || "").replace(/[\r\n]+/g, " ").trim();
    const reviewSubmissionUrl = buildReviewSubmissionUrl(request);

    const advertiserEmailHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #0066cc; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .info-block { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .footer { text-align: center; padding: 20px 0; border-top: 1px solid #ddd; color: #777; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cbnads.com/icons/icon-512.png" alt="Logo" class="logo">
    </div>

    <div class="content">
      <h2>Thank You for Your Multi-week Booking Request</h2>
      <p>Dear ${escaped.contact_name},</p>
      <p>We have received your request. Each week can be scheduled now or left <strong>TBD</strong> for later scheduling after review.</p>

      <div class="info-block">
        <div class="info-row"><span class="label">Advertiser Name:</span> ${escaped.advertiser_name}</div>
        <div class="info-row"><span class="label">Email:</span> ${escaped.email}</div>
        ${normalizedPhoneNumber ? `<div class="info-row"><span class="label">Phone:</span> ${escaped.phone_number}</div>` : ""}
        <div class="info-row"><span class="label">Campaign Name:</span> ${escaped.ad_name}</div>
        <div class="info-row"><span class="label">Weeks:</span> ${escaped.weeks}</div>
        <div class="info-row"><span class="label">Week 1 starts:</span> ${escaped.series_week_start}</div>
        ${selectedProduct ? `<div class="info-row"><span class="label">Product:</span> ${escaped.product_name}</div>` : ""}
        ${basePlacement ? `<div class="info-row"><span class="label">Placement:</span> ${escaped.placement}</div>` : ""}
        ${selectedProduct ? `<div class="info-row"><span class="label">Quoted Price:</span> ${escaped.price} per scheduled post</div>` : ""}
      </div>

      <p><strong>Next Steps:</strong></p>
      <p>Your request is now in <strong>Pending</strong> status while our team reviews it. Once approved and invoiced, you will receive a <strong>Ready for Payment</strong> email.</p>
      <p>Best regards,<br>CBN Team</p>
    </div>

    <div class="footer">
      <p>This is an automated confirmation email. Please do not reply to this message.</p>
    </div>
  </div>
</body>
</html>
`;

    const adminEmailHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #0066cc; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    .info-section { margin: 25px 0; }
    .section-title { font-size: 18px; font-weight: bold; color: #0066cc; margin-bottom: 15px; border-bottom: 2px solid #0066cc; padding-bottom: 5px; }
    .info-block { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .button { display: inline-block; background: #0066cc; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; }
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
        <strong>New Multi-week Booking Request (Pending)</strong><br>
        ${escapeHtml(advertiser_name)} requested ${escapeHtml(String(weeks))} weeks.
      </div>

      <div class="info-section">
        <div class="section-title">Customer Details</div>
        <div class="info-block">
          <div class="info-row"><span class="label">Advertiser:</span> ${escaped.advertiser_name}</div>
          <div class="info-row"><span class="label">Contact:</span> ${escaped.contact_name}</div>
          <div class="info-row"><span class="label">Email:</span> ${escaped.email}</div>
          ${normalizedPhoneNumber ? `<div class="info-row"><span class="label">Phone:</span> ${escaped.phone_number}</div>` : ""}
        </div>
      </div>

      <div class="info-section">
        <div class="section-title">Booking</div>
        <div class="info-block">
          <div class="info-row"><span class="label">Campaign Name:</span> ${escaped.ad_name}</div>
          <div class="info-row"><span class="label">Weeks:</span> ${escaped.weeks}</div>
          <div class="info-row"><span class="label">Week 1 starts:</span> ${escaped.series_week_start}</div>
          ${selectedProduct ? `<div class="info-row"><span class="label">Product:</span> ${escaped.product_name}</div>` : ""}
          ${basePlacement ? `<div class="info-row"><span class="label">Placement:</span> ${escaped.placement}</div>` : ""}
          ${selectedProduct ? `<div class="info-row"><span class="label">Quoted Price:</span> ${escaped.price} per scheduled post</div>` : ""}
        </div>
      </div>

      ${notes
        ? `
        <div class="info-section">
          <div class="section-title">Additional Notes</div>
          <div class="info-block">
            <p style="margin: 0; white-space: pre-wrap;">${escaped.notes}</p>
          </div>
        </div>
      `
        : ""
      }

      ${reviewSubmissionUrl
        ? `
        <div style="text-align: center; margin-top: 30px;">
          <a href="${escapeHtml(reviewSubmissionUrl)}" class="button">Review Submissions</a>
        </div>
      `
        : ""
      }
    </div>

    <div class="footer">
      <p>Submission received at ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
`;

    if (sendAdvertiserReceipt) {
      try {
        await sendEmail({
          to: normalizedEmail,
          subject: `Multi-week Booking Request Received (Pending) - ${safeSubjectAdName}`,
          html: advertiserEmailHTML,
        });
      } catch (error) {
        console.error("[pending-ad-submission] Failed to send advertiser email:", error);
      }
    }

    const internalTelegramText = [
      "<b>New Multi-week Booking Request (Pending)</b>",
      "",
      `<b>Advertiser:</b> ${escapeHtml(advertiser_name)}`,
      `<b>Contact:</b> ${escapeHtml(contact_name)} (${escapeHtml(normalizedEmail)})`,
      `<b>Campaign:</b> ${escapeHtml(resolvedAdName)}`,
      `<b>Weeks:</b> ${escapeHtml(String(weeks))}`,
      `<b>Week 1 starts:</b> ${escapeHtml(seriesWeekStart)}`,
      basePlacement ? `<b>Placement:</b> ${escapeHtml(basePlacement)}` : "",
      selectedProduct ? `<b>Product:</b> ${escapeHtml(selectedProduct.product_name)}` : "",
      `<b>Series ID:</b> ${escapeHtml(seriesId)}`,
      reviewSubmissionUrl ? `<b>Review:</b> ${escapeHtml(reviewSubmissionUrl)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await notifyInternalChannels({
        supabase,
        emailSubject: sendInternalEmailNotification
          ? `New Multi-week Booking - ${safeSubjectAdName} from ${safeSubjectAdvertiserName}`
          : "",
        emailHtml: sendInternalEmailNotification ? adminEmailHTML : "",
        telegramText: sendInternalTelegramNotification ? internalTelegramText : "",
      });

      try {
        const adminWhatsApp = process.env.WHATSAPP_BROADCAST_NUMBER;
        if (sendAdminWhatsAppNotification && adminWhatsApp && firstPendingAd?.id) {
          await sendWhatsAppInteractive({
            to: adminWhatsApp,
            adId: firstPendingAd.id,
            advertiserName: advertiser_name,
            adName: resolvedAdName,
          });
        }
      } catch (waError) {
        console.error("[pending-ad-submission] Failed to send Admin WhatsApp notification:", waError);
      }
    } catch (error) {
      console.error("[pending-ad-submission] Failed to send internal notifications:", error);
    }

    return {
      pendingAd: firstPendingAd,
      pendingAds: insertedPendingAds,
      series_id: seriesId,
    };
  }

  if (normalizedSourceRequestKey) {
    const existingPendingAd = await fetchPendingAdBySourceRequestKey(
      supabase,
      normalizedSourceRequestKey,
    );
    if (existingPendingAd) {
      return {
        pendingAd: existingPendingAd,
      };
    }
  }

  if (normalizedPostType === "one_time" && post_date_from && post_time) {
    const availability = await checkSingleDateAvailability({
      supabase,
      date: post_date_from,
      postType: normalizedPostType,
      postTime: post_time,
    });

    if (!availability.available) {
      return {
        error: availability.is_day_full
          ? "Ad limit reached for this date. Please choose the next available day."
          : "This time slot is already booked. Please choose a different time.",
        status: 400,
      };
    }
  }

  if (normalizedPostType === "daily_run" && post_date_from && post_date_to) {
    const availability = await checkBatchAvailability({
      supabase,
      dates: expandDateRange(post_date_from, post_date_to),
    });

    const blockedDates = Object.entries(availability.results || {})
      .filter(([, info]) => info?.is_full)
      .map(([dateValue]) => dateValue);

    if (blockedDates.length > 0) {
      return {
        error:
          "Ad limit reached on one or more dates in this range. Please choose different dates.",
        status: 400,
        fully_booked_dates: blockedDates,
      };
    }
  }

  if (normalizedPostType === "custom_schedule" && normalizedCustomDates.length > 0) {
    const availability = await checkBatchAvailability({
      supabase,
      dates: normalizedCustomDates.map((entry) => entry.date),
    });

    const blockedDates = Object.entries(availability.results || {})
      .filter(([, info]) => info?.is_full)
      .map(([dateValue]) => dateValue);

    if (blockedDates.length > 0) {
      return {
        error:
          "Ad limit reached on one or more selected dates. Please choose different dates.",
        status: 400,
        fully_booked_dates: blockedDates,
      };
    }
  }

  const resolvedPlacement = String(selectedProduct?.placement || placement || "").trim();
  const savedPrice = Number(selectedProduct?.price || 0) || 0;
  const savedPriceText = selectedProduct ? formatCurrency(savedPrice) : "";

  const escaped = {
    advertiser_name: escapeHtml(advertiser_name),
    contact_name: escapeHtml(contact_name),
    email: escapeHtml(normalizedEmail),
    phone_number: escapeHtml(normalizedPhoneNumber),
    ad_name: escapeHtml(resolvedAdName),
    post_type: escapeHtml(post_type),
    placement: escapeHtml(resolvedPlacement),
    product_name: escapeHtml(selectedProduct?.product_name || ""),
    price: escapeHtml(savedPriceText),
    post_date_from: escapeHtml(post_date_from),
    post_date_to: escapeHtml(post_date_to),
    post_time: escapeHtml(post_time),
    reminder_minutes: escapeHtml(reminder_minutes),
    ad_text: escapeHtml(ad_text),
    notes: escapeHtml(notes),
  };

  const safeSubjectAdName = String(resolvedAdName || "").replace(/[\r\n]+/g, " ").trim();
  const safeSubjectAdvertiserName = String(advertiser_name || "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  const safeCustomDates = normalizedCustomDates
    .map((entry) => {
      const dateText = String(entry?.date || "").trim();
      if (!dateText) {
        return "";
      }
      const timeText = String(entry?.time || "").trim().slice(0, 5);
      return escapeHtml(timeText ? `${dateText} ${timeText}` : dateText);
    })
    .filter(Boolean);

  const sanitizedMedia = sanitizeMediaArray(media);

  const safeMediaUrls = sanitizedMedia
    .map((item) => toSafeHttpUrl(item.url || item.cdnUrl || ""))
    .filter(Boolean);

  const reviewSubmissionUrl = buildReviewSubmissionUrl(request);
  const nowIso = new Date().toISOString();
  const reminderMinutesValue = parseReminderMinutes(reminder_minutes, 15);

  const insertPendingResult = await insertPendingAd(supabase, {
    advertiser_id: advertiser_id || null,
    advertiser_name,
    contact_name,
    email: normalizedEmail,
    phone_number: normalizedPhoneNumber || null,
    phone: normalizedPhoneNumber || null,
    ad_name: resolvedAdName,
    post_type: normalizedPostType,
    post_date: post_date_from || null,
    post_date_from: post_date_from || null,
    post_date_to: post_date_to || null,
    custom_dates: normalizedCustomDates,
    post_time: post_time || null,
    reminder_minutes: reminderMinutesValue,
    ad_text: ad_text || null,
    media: sanitizedMedia,
    placement: resolvedPlacement || null,
    product_id: normalizedProductId || null,
    product_name: selectedProduct?.product_name || null,
    price: savedPrice,
    notes: notes || null,
    status: "pending",
    viewed_by_admin: false,
    created_at: nowIso,
    updated_at: nowIso,
    source_request_key: normalizedSourceRequestKey,
  });
  const insertedPendingAd = insertPendingResult.row;

  if (!insertPendingResult.created) {
    return {
      pendingAd: insertedPendingAd,
    };
  }

  const advertiserEmailHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #0066cc; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .info-block { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .footer { text-align: center; padding: 20px 0; border-top: 1px solid #ddd; color: #777; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cbnads.com/icons/icon-512.png" alt="Logo" class="logo">
    </div>

    <div class="content">
      <h2>Thank You for Your Ad Submission</h2>
      <p>Dear ${escaped.contact_name},</p>
      <p>We have successfully received your advertising submission. Here's a summary of what you submitted:</p>

      <div class="info-block">
        <div class="info-row"><span class="label">Advertiser Name:</span> ${escaped.advertiser_name}</div>
        <div class="info-row"><span class="label">Contact Name:</span> ${escaped.contact_name}</div>
        <div class="info-row"><span class="label">Email:</span> ${escaped.email}</div>
        ${normalizedPhoneNumber ? `<div class="info-row"><span class="label">Phone:</span> ${escaped.phone_number}</div>` : ""}
        <div class="info-row"><span class="label">Ad Name:</span> ${escaped.ad_name}</div>
        <div class="info-row"><span class="label">Post Type:</span> ${escaped.post_type}</div>
        ${selectedProduct ? `<div class="info-row"><span class="label">Product:</span> ${escaped.product_name}</div>` : ""}
        ${resolvedPlacement ? `<div class="info-row"><span class="label">Placement:</span> ${escaped.placement}</div>` : ""}
        ${selectedProduct ? `<div class="info-row"><span class="label">Quoted Price:</span> ${escaped.price} per scheduled post</div>` : ""}
        ${post_date_from ? `<div class="info-row"><span class="label">Start Date:</span> ${escaped.post_date_from}</div>` : ""}
        ${post_date_to ? `<div class="info-row"><span class="label">End Date:</span> ${escaped.post_date_to}</div>` : ""}
        ${post_time ? `<div class="info-row"><span class="label">Post Time:</span> ${escaped.post_time}</div>` : ""}
      </div>

      <p><strong>Next Steps:</strong></p>
      <p>Your submission is now in <strong>Pending</strong> status while our team reviews it. Once approved and invoiced, you will receive a <strong>Ready for Payment</strong> email.</p>

      <p>If you have any questions, please don't hesitate to contact us.</p>

      <p>Best regards,<br>CBN Team</p>
    </div>

    <div class="footer">
      <p>This is an automated confirmation email. Please do not reply to this message.</p>
    </div>
  </div>
</body>
</html>
`;

  const adminEmailHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #0066cc; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    .info-section { margin: 25px 0; }
    .section-title { font-size: 18px; font-weight: bold; color: #0066cc; margin-bottom: 15px; border-bottom: 2px solid #0066cc; padding-bottom: 5px; }
    .info-block { background: #f8f9fa; padding: 20px; margin: 10px 0; border-radius: 5px; }
    .info-row { margin: 8px 0; }
    .label { font-weight: bold; color: #555; min-width: 150px; display: inline-block; }
    .media-item { margin: 10px 0; padding: 10px; background: white; border: 1px solid #ddd; border-radius: 3px; }
    .button { display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
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
        <h2 style="margin-top: 0;">New Ad Submission Received (Pending)</h2>
      </div>

      <div class="info-section">
        <div class="section-title">Advertiser Information</div>
        <div class="info-block">
          <div class="info-row"><span class="label">Advertiser Name:</span> ${escaped.advertiser_name}</div>
          <div class="info-row"><span class="label">Contact Name:</span> ${escaped.contact_name}</div>
          <div class="info-row"><span class="label">Email:</span> <a href="mailto:${escaped.email}">${escaped.email}</a></div>
          ${normalizedPhoneNumber ? `<div class="info-row"><span class="label">Phone Number:</span> ${escaped.phone_number}</div>` : ""}
        </div>
      </div>

      <div class="info-section">
        <div class="section-title">Ad Details</div>
        <div class="info-block">
          <div class="info-row"><span class="label">Ad Name:</span> ${escaped.ad_name}</div>
          <div class="info-row"><span class="label">Post Type:</span> ${escaped.post_type}</div>
          ${selectedProduct ? `<div class="info-row"><span class="label">Product:</span> ${escaped.product_name}</div>` : ""}
          ${resolvedPlacement ? `<div class="info-row"><span class="label">Placement:</span> ${escaped.placement}</div>` : ""}
          ${selectedProduct ? `<div class="info-row"><span class="label">Quoted Price:</span> ${escaped.price} per scheduled post</div>` : ""}
        </div>
      </div>

      <div class="info-section">
        <div class="section-title">Scheduling</div>
        <div class="info-block">
          ${post_date_from ? `<div class="info-row"><span class="label">Start Date:</span> ${escaped.post_date_from}</div>` : ""}
          ${post_date_to ? `<div class="info-row"><span class="label">End Date:</span> ${escaped.post_date_to}</div>` : ""}
          ${post_time ? `<div class="info-row"><span class="label">Post Time:</span> ${escaped.post_time}</div>` : ""}
          ${reminder_minutes ? `<div class="info-row"><span class="label">Reminder:</span> ${escaped.reminder_minutes} before</div>` : ""}
          ${safeCustomDates.length > 0
        ? `
            <div class="info-row">
              <span class="label">Custom Dates:</span>
              <ul style="margin: 5px 0;">
                ${safeCustomDates.map((date) => `<li>${date}</li>`).join("")}
              </ul>
            </div>
          `
        : ""
      }
        </div>
      </div>

      ${ad_text
        ? `
        <div class="info-section">
          <div class="section-title">Ad Content</div>
          <div class="info-block">
            <p style="margin: 0; white-space: pre-wrap;">${escaped.ad_text}</p>
          </div>
        </div>
      `
        : ""
      }

      ${safeMediaUrls.length > 0
        ? `
        <div class="info-section">
          <div class="section-title">Media Files (${safeMediaUrls.length})</div>
          ${safeMediaUrls
          .map(
            (url, index) => `
            <div class="media-item">
              <div><strong>File ${index + 1}:</strong></div>
              <div><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></div>
            </div>
          `,
          )
          .join("")}
        </div>
      `
        : ""
      }

      ${notes
        ? `
        <div class="info-section">
          <div class="section-title">Additional Notes</div>
          <div class="info-block">
            <p style="margin: 0; white-space: pre-wrap;">${escaped.notes}</p>
          </div>
        </div>
      `
        : ""
      }

      ${reviewSubmissionUrl
        ? `
        <div style="text-align: center; margin-top: 30px;">
          <a href="${escapeHtml(reviewSubmissionUrl)}" class="button">Review Submission</a>
        </div>
      `
        : ""
      }
    </div>

    <div class="footer">
      <p>Submission received at ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
`;

  if (sendAdvertiserReceipt) {
    try {
      await sendEmail({
        to: normalizedEmail,
        subject: `Ad Submission Received (Pending) - ${safeSubjectAdName}`,
        html: advertiserEmailHTML,
      });
    } catch (error) {
      console.error("[pending-ad-submission] Failed to send advertiser email:", error);
    }
  }

  const internalTelegramText = [
    "<b>New Ad Submission Received (Pending)</b>",
    "",
    `<b>Advertiser:</b> ${escapeHtml(advertiser_name)}`,
    `<b>Contact:</b> ${escapeHtml(contact_name)} (${escapeHtml(normalizedEmail)})`,
    `<b>Ad:</b> ${escapeHtml(ad_name)}`,
    `<b>Post Type:</b> ${escapeHtml(post_type)}`,
    selectedProduct ? `<b>Product:</b> ${escapeHtml(selectedProduct.product_name)}` : "",
    resolvedPlacement ? `<b>Placement:</b> ${escapeHtml(resolvedPlacement)}` : "",
    selectedProduct ? `<b>Quoted Price:</b> ${escapeHtml(savedPriceText)} per scheduled post` : "",
    post_date_from ? `<b>Start Date:</b> ${escapeHtml(post_date_from)}` : "",
    post_date_to ? `<b>End Date:</b> ${escapeHtml(post_date_to)}` : "",
    post_time ? `<b>Post Time:</b> ${escapeHtml(post_time)}` : "",
    reviewSubmissionUrl ? `<b>Review:</b> ${escapeHtml(reviewSubmissionUrl)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await notifyInternalChannels({
      supabase,
      emailSubject: sendInternalEmailNotification
        ? `New Ad Submission - ${safeSubjectAdName} from ${safeSubjectAdvertiserName}`
        : "",
      emailHtml: sendInternalEmailNotification ? adminEmailHTML : "",
      telegramText: sendInternalTelegramNotification ? internalTelegramText : "",
    });
    
    // Attempt to notify the admin via interactive WhatsApp buttons (Approve/Decline)
    try {
      const adminWhatsApp = process.env.WHATSAPP_BROADCAST_NUMBER;
      if (sendAdminWhatsAppNotification && adminWhatsApp) {
         await sendWhatsAppInteractive({
           to: adminWhatsApp,
           adId: insertedPendingAd.id,
           advertiserName: advertiser_name,
           adName: resolvedAdName
         });
      }
    } catch (waError) {
      console.error("[pending-ad-submission] Failed to send Admin WhatsApp notification:", waError);
    }
  } catch (error) {
    console.error("[pending-ad-submission] Failed to send internal notifications:", error);
  }

  return {
    pendingAd: insertedPendingAd,
  };
}
