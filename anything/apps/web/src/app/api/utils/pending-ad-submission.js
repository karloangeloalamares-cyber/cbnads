import { db, normalizePostType, table } from "./supabase-db.js";
import { sendEmail } from "./send-email.js";
import { notifyInternalChannels } from "./internal-notification-channels.js";
import {
  checkBatchAvailability,
  checkSingleDateAvailability,
  expandDateRange,
} from "./ad-availability.js";
import {
  isCompleteUSPhoneNumber,
  normalizeUSPhoneNumber,
} from "../../../lib/phone.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

const insertPendingAd = async (supabase, payload) => {
  const insertPayload = { ...payload };
  let query = supabase.from(table("pending_ads")).insert(insertPayload).select("*").single();
  let result = await query;

  if (
    result.error &&
    insertPayload.advertiser_id &&
    /advertiser_id/i.test(String(result.error.message || ""))
  ) {
    delete insertPayload.advertiser_id;
    query = supabase.from(table("pending_ads")).insert(insertPayload).select("*").single();
    result = await query;
  }

  if (result.error) {
    throw result.error;
  }

  return result.data;
};

export async function createPendingAdSubmission({
  request,
  submission = {},
  supabase = db(),
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
    notes,
  } = submission;

  const normalizedPostType = normalizePostType(post_type);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPhoneNumber = normalizeUSPhoneNumber(phone_number || "");
  const normalizedCustomDates = readCustomDates(custom_dates);

  if (!advertiser_name || !contact_name || !normalizedEmail || !ad_name || !post_type) {
    return {
      error: "Missing required fields",
      status: 400,
    };
  }

  if (!["one_time", "daily_run", "custom_schedule"].includes(normalizedPostType)) {
    return {
      error: "Unsupported post type",
      status: 400,
    };
  }

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  if (!isEmailValid) {
    return {
      error: "Invalid email address",
      status: 400,
    };
  }

  if (!isCompleteUSPhoneNumber(normalizedPhoneNumber)) {
    return {
      error: "Phone number must be a complete US number",
      status: 400,
    };
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

  const escaped = {
    advertiser_name: escapeHtml(advertiser_name),
    contact_name: escapeHtml(contact_name),
    email: escapeHtml(normalizedEmail),
    phone_number: escapeHtml(normalizedPhoneNumber),
    ad_name: escapeHtml(ad_name),
    post_type: escapeHtml(post_type),
    placement: escapeHtml(placement),
    post_date_from: escapeHtml(post_date_from),
    post_date_to: escapeHtml(post_date_to),
    post_time: escapeHtml(post_time),
    reminder_minutes: escapeHtml(reminder_minutes),
    ad_text: escapeHtml(ad_text),
    notes: escapeHtml(notes),
  };

  const safeSubjectAdName = String(ad_name || "").replace(/[\r\n]+/g, " ").trim();
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

  const sanitizedMedia = Array.isArray(media)
    ? media
      .map((item) => {
        if (item && typeof item === "object") {
          const safeUrl = toSafeHttpUrl(item.url || item.cdnUrl || "");
          if (!safeUrl) return null;
          return {
            ...item,
            url: safeUrl,
            cdnUrl: toSafeHttpUrl(item.cdnUrl || safeUrl) || safeUrl,
          };
        }

        const safeUrl = toSafeHttpUrl(item);
        if (!safeUrl) return null;
        return { type: "link", url: safeUrl, cdnUrl: safeUrl };
      })
      .filter(Boolean)
    : [];

  const safeMediaUrls = sanitizedMedia
    .map((item) => toSafeHttpUrl(item.url || item.cdnUrl || ""))
    .filter(Boolean);

  const reviewSubmissionUrl = buildReviewSubmissionUrl(request);
  const nowIso = new Date().toISOString();

  const insertedPendingAd = await insertPendingAd(supabase, {
    advertiser_id: advertiser_id || null,
    advertiser_name,
    contact_name,
    email: normalizedEmail,
    phone_number: normalizedPhoneNumber || null,
    phone: normalizedPhoneNumber || null,
    ad_name,
    post_type: normalizedPostType,
    post_date: post_date_from || null,
    post_date_from: post_date_from || null,
    post_date_to: post_date_to || null,
    custom_dates: normalizedCustomDates,
    post_time: post_time || null,
    reminder_minutes: reminder_minutes || 15,
    ad_text: ad_text || null,
    media: sanitizedMedia,
    placement: placement || null,
    notes: notes || null,
    status: "pending",
    viewed_by_admin: false,
    created_at: nowIso,
    updated_at: nowIso,
  });

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
        ${placement ? `<div class="info-row"><span class="label">Placement:</span> ${escaped.placement}</div>` : ""}
        ${post_date_from ? `<div class="info-row"><span class="label">Start Date:</span> ${escaped.post_date_from}</div>` : ""}
        ${post_date_to ? `<div class="info-row"><span class="label">End Date:</span> ${escaped.post_date_to}</div>` : ""}
        ${post_time ? `<div class="info-row"><span class="label">Post Time:</span> ${escaped.post_time}</div>` : ""}
      </div>

      <p><strong>Next Steps:</strong></p>
      <p>Our team will review your submission shortly. You will receive a confirmation email once your ad has been approved and scheduled.</p>

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
        <h2 style="margin-top: 0;">New Ad Submission Received</h2>
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
          ${placement ? `<div class="info-row"><span class="label">Placement:</span> ${escaped.placement}</div>` : ""}
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

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: `Ad Submission Received - ${safeSubjectAdName}`,
      html: advertiserEmailHTML,
    });
  } catch (error) {
    console.error("[pending-ad-submission] Failed to send advertiser email:", error);
  }

  const internalTelegramText = [
    "<b>New Ad Submission Received</b>",
    "",
    `<b>Advertiser:</b> ${escapeHtml(advertiser_name)}`,
    `<b>Contact:</b> ${escapeHtml(contact_name)} (${escapeHtml(normalizedEmail)})`,
    `<b>Ad:</b> ${escapeHtml(ad_name)}`,
    `<b>Post Type:</b> ${escapeHtml(post_type)}`,
    placement ? `<b>Placement:</b> ${escapeHtml(placement)}` : "",
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
      emailSubject: `New Ad Submission - ${safeSubjectAdName} from ${safeSubjectAdvertiserName}`,
      emailHtml: adminEmailHTML,
      telegramText: internalTelegramText,
    });
  } catch (error) {
    console.error("[pending-ad-submission] Failed to send internal notifications:", error);
  }

  return {
    pendingAd: insertedPendingAd,
  };
}
