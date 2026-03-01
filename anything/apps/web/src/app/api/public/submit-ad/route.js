import { db, table } from "../../utils/supabase-db.js";
import { sendEmail } from "../../utils/send-email.js";
import { getTodayInAppTimeZone } from "../../../../lib/timezone.js";
import {
  checkBatchAvailability,
  checkSingleDateAvailability,
  expandDateRange,
} from "../../utils/ad-availability.js";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 20;

const getRateLimitStore = () => {
  const globalKey = "__cbnadsSubmitAdRateLimit";
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = new Map();
  }
  return globalThis[globalKey];
};

const clientIpFromHeaders = (headers) => {
  const forwarded = String(headers.get("x-forwarded-for") || "").trim();
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return String(headers.get("x-real-ip") || "").trim();
};

const isRateLimited = (key) => {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const store = getRateLimitStore();

  for (const [entryKey, timestamps] of store.entries()) {
    const filtered = timestamps.filter((value) => value >= cutoff);
    if (filtered.length === 0) {
      store.delete(entryKey);
      continue;
    }
    store.set(entryKey, filtered);
  }

  const attempts = store.get(key) || [];
  if (attempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    return true;
  }
  store.set(key, [...attempts, now]);
  return false;
};

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

export async function POST(request) {
  try {
    const requesterIp = clientIpFromHeaders(request.headers) || "unknown";
    const rateLimitKey = `${requesterIp}:${getTodayInAppTimeZone()}`;
    if (isRateLimited(rateLimitKey)) {
      return Response.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429 },
      );
    }

    const supabase = db();
    const body = await request.json();
    const {
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
      website,
    } = body;

    // Honeypot for basic bot filtering.
    if (String(website || "").trim()) {
      return Response.json({ success: true });
    }

    // Validation
    if (!advertiser_name || !contact_name || !email || !ad_name || !post_type) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const normalizedEmail = String(email || "").trim();
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!isEmailValid) {
      return Response.json({ error: "Invalid email address" }, { status: 400 });
    }

    const escaped = {
      advertiser_name: escapeHtml(advertiser_name),
      contact_name: escapeHtml(contact_name),
      email: escapeHtml(normalizedEmail),
      phone_number: escapeHtml(phone_number),
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
    const safeCustomDates = Array.isArray(custom_dates)
      ? custom_dates.map((date) => escapeHtml(date))
      : [];
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

    const safeAppUrl = toSafeHttpUrl(process.env.APP_URL);
    const reviewSubmissionUrl = safeAppUrl
      ? new URL("/pending-submissions", safeAppUrl).toString()
      : null;

    if (post_type === "One-Time Post" && post_date_from && post_time) {
      const availability = await checkSingleDateAvailability({
        supabase,
        date: post_date_from,
        postType: post_type,
        postTime: post_time,
      });

      if (!availability.available) {
        return Response.json(
          {
            error: availability.is_day_full
              ? "Ad limit reached for this date. Please choose the next available day."
              : "This time slot is already booked. Please choose a different time.",
          },
          { status: 400 },
        );
      }
    }

    if (post_type === "Daily Run" && post_date_from && post_date_to) {
      const availability = await checkBatchAvailability({
        supabase,
        dates: expandDateRange(post_date_from, post_date_to),
      });

      const blockedDates = Object.entries(availability.results || {})
        .filter(([, info]) => info?.is_full)
        .map(([dateValue]) => dateValue);

      if (blockedDates.length > 0) {
        return Response.json(
          {
            error:
              "Ad limit reached on one or more dates in this range. Please choose different dates.",
            fully_booked_dates: blockedDates,
          },
          { status: 400 },
        );
      }
    }

    if (post_type === "Custom Schedule" && Array.isArray(custom_dates) && custom_dates.length > 0) {
      const availability = await checkBatchAvailability({
        supabase,
        dates: custom_dates.map((entry) =>
          entry && typeof entry === "object" ? entry.date : entry,
        ),
      });

      const blockedDates = Object.entries(availability.results || {})
        .filter(([, info]) => info?.is_full)
        .map(([dateValue]) => dateValue);

      if (blockedDates.length > 0) {
        return Response.json(
          {
            error:
              "Ad limit reached on one or more selected dates. Please choose different dates.",
            fully_booked_dates: blockedDates,
          },
          { status: 400 },
        );
      }
    }

    console.log(
      "[submit-ad] Inserting pending ad with date:",
      post_date_from,
      "time:",
      post_time,
    );

    // Insert pending ad
    const nowIso = new Date().toISOString();
    const { data: insertedPendingAd, error: insertError } = await supabase
      .from(table("pending_ads"))
      .insert({
        advertiser_name,
        contact_name,
        email: normalizedEmail,
        phone_number: phone_number || null,
        phone: phone_number || null,
        ad_name,
        post_type,
        post_date: post_date_from || null,
        post_date_from: post_date_from || null,
        post_date_to: post_date_to || null,
        custom_dates: Array.isArray(custom_dates) ? custom_dates : [],
        post_time: post_time || null,
        reminder_minutes: reminder_minutes || 15,
        ad_text: ad_text || null,
        media: sanitizedMedia,
        placement: placement || null,
        notes: notes || null,
        status: "pending",
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    console.log(
      "[submit-ad] Inserted pending ad, returned date:",
      insertedPendingAd.post_date_from,
    );

    // Get all admin emails configured for notifications.
    const { data: adminPrefs, error: adminPrefError } = await supabase
      .from(table("admin_notification_preferences"))
      .select("email_address, email_enabled")
      .eq("email_enabled", true);
    if (adminPrefError) throw adminPrefError;

    const { data: globalPrefs, error: globalPrefError } = await supabase
      .from(table("notification_preferences"))
      .select("reminder_email, email_enabled")
      .order("id", { ascending: true })
      .limit(1);
    if (globalPrefError) throw globalPrefError;

    const adminEmails = Array.from(
      new Set(
        [
          ...(adminPrefs || []).map((admin) => admin.email_address),
          ...(globalPrefs?.[0]?.email_enabled ? [globalPrefs?.[0]?.reminder_email] : []),
        ].filter(Boolean),
      ),
    );

    // Create advertiser confirmation email
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
      <img src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/" alt="Logo" class="logo">
    </div>
    
    <div class="content">
      <h2>Thank You for Your Ad Submission</h2>
      <p>Dear ${escaped.contact_name},</p>
      <p>We have successfully received your advertising submission. Here's a summary of what you submitted:</p>
      
      <div class="info-block">
        <div class="info-row"><span class="label">Advertiser Name:</span> ${escaped.advertiser_name}</div>
        <div class="info-row"><span class="label">Contact Name:</span> ${escaped.contact_name}</div>
        <div class="info-row"><span class="label">Email:</span> ${escaped.email}</div>
        ${phone_number ? `<div class="info-row"><span class="label">Phone:</span> ${escaped.phone_number}</div>` : ""}
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
      
      <p>Best regards,<br>The Team</p>
    </div>
    
    <div class="footer">
      <p>This is an automated confirmation email. Please do not reply to this message.</p>
    </div>
  </div>
</body>
</html>
`;

    // Create admin notification email
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
      <img src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/" alt="Logo" class="logo">
    </div>
    
    <div class="content">
      <div class="alert">
        <h2 style="margin-top: 0;">🔔 New Ad Submission Received</h2>
      </div>
      
      <div class="info-section">
        <div class="section-title">Advertiser Information</div>
        <div class="info-block">
          <div class="info-row"><span class="label">Advertiser Name:</span> ${escaped.advertiser_name}</div>
          <div class="info-row"><span class="label">Contact Name:</span> ${escaped.contact_name}</div>
          <div class="info-row"><span class="label">Email:</span> <a href="mailto:${escaped.email}">${escaped.email}</a></div>
          ${phone_number ? `<div class="info-row"><span class="label">Phone Number:</span> ${escaped.phone_number}</div>` : ""}
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
          ${reminder_minutes ? `<div class="info-row"><span class="label">Reminder:</span> ${escaped.reminder_minutes} minutes before</div>` : ""}
          ${
            safeCustomDates.length > 0
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
      
      ${
        ad_text
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
      
      ${
        safeMediaUrls.length > 0
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
      
      ${
        notes
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
      
      ${
        reviewSubmissionUrl
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

    // Send confirmation to advertiser
    try {
      await sendEmail({
        to: normalizedEmail,
        subject: `Ad Submission Received - ${safeSubjectAdName}`,
        html: advertiserEmailHTML,
      });
      console.log("[submit-ad] Confirmation email sent to advertiser");
    } catch (emailError) {
      console.error("[submit-ad] Failed to send advertiser email:", emailError);
      // Don't fail the whole request if email fails
    }

    // Send notification to admins
    if (adminEmails.length > 0) {
      try {
        await sendEmail({
          to: adminEmails,
          subject: `New Ad Submission - ${safeSubjectAdName} from ${safeSubjectAdvertiserName}`,
          html: adminEmailHTML,
        });
        console.log("[submit-ad] Notification sent to admins:", adminEmails);
      } catch (emailError) {
        console.error("[submit-ad] Failed to send admin email:", emailError);
        // Don't fail the whole request if email fails
      }
    } else {
      console.warn("[submit-ad] No admin emails configured for notifications");
    }

    return Response.json({
      success: true,
      pending_ad: insertedPendingAd,
    });
  } catch (error) {
    console.error("Error creating pending ad:", error);
    return Response.json({ error: "Failed to submit ad" }, { status: 500 });
  }
}
