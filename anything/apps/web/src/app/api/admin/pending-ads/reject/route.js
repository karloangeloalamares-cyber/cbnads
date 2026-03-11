import { db, table } from "../../../utils/supabase-db.js";
import { requireAdmin } from "../../../utils/auth-check.js";
import { sendEmail } from "../../../utils/send-email.js";
import { notifyInternalChannels } from "../../../utils/internal-notification-channels.js";

const isMissingColumnError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42703" || /column .* does not exist/i.test(message);
};

const normalizeRejectionReasons = (value) => {
  const reasons = Array.isArray(value) ? value : [];
  const seen = new Set();
  const normalized = [];

  for (const reason of reasons) {
    const text = String(reason || "").trim();
    if (!text) {
      continue;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(text.slice(0, 120));
  }

  return normalized.slice(0, 20);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toHtmlWithLineBreaks = (value) => escapeHtml(value).replace(/\n/g, "<br>");

const buildReviewNotes = (reasons, reviewerNote) => {
  const chunks = [];
  if (reasons.length > 0) {
    chunks.push(`Rejection reasons:\n${reasons.map((reason) => `- ${reason}`).join("\n")}`);
  }
  if (reviewerNote) {
    chunks.push(`Reviewer notes:\n${reviewerNote}`);
  }
  return chunks.join("\n\n") || null;
};

const buildReasonSectionHtml = (reasons) => {
  if (reasons.length === 0) {
    return "";
  }

  return `
      <div class="info-block">
        <p class="label" style="margin-top: 0;">Reasons from the review team</p>
        <ul class="reason-list">
          ${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
        </ul>
      </div>
  `;
};

const buildReviewerNoteSectionHtml = (reviewerNote) => {
  if (!reviewerNote) {
    return "";
  }

  return `
      <div class="info-block">
        <p class="label" style="margin-top: 0;">Additional reviewer notes</p>
        <p style="margin: 0;">${toHtmlWithLineBreaks(reviewerNote)}</p>
      </div>
  `;
};

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: admin.status || 401 });
    }

    const supabase = db();
    const body = await request.json();
    const pendingAdId = String(body?.pending_ad_id || "").trim();
    const rejectionReasons = normalizeRejectionReasons(
      body?.reasons ?? body?.rejection_reasons,
    );
    const reviewerNote = String(body?.rejection_note ?? body?.reviewer_note ?? "")
      .trim()
      .slice(0, 2000);

    if (!pendingAdId) {
      return Response.json({ error: "Missing pending_ad_id" }, { status: 400 });
    }

    const { data: ad, error: adError } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .eq("id", pendingAdId)
      .maybeSingle();

    if (adError || !ad) {
      return Response.json({ error: "Pending ad not found prior to rejection" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const reviewNotes = buildReviewNotes(rejectionReasons, reviewerNote);
    const primaryPatch = {
      status: "not_approved",
      rejected_at: nowIso,
      updated_at: nowIso,
      ...(reviewNotes ? { review_notes: reviewNotes } : {}),
    };

    let updateResult = await supabase
      .from(table("pending_ads"))
      .update(primaryPatch)
      .eq("id", pendingAdId)
      .select("*")
      .maybeSingle();

    if (updateResult.error && isMissingColumnError(updateResult.error)) {
      updateResult = await supabase
        .from(table("pending_ads"))
        .update({
          status: "not_approved",
          updated_at: nowIso,
        })
        .eq("id", pendingAdId)
        .select("*")
        .maybeSingle();
    }

    if (updateResult.error) {
      throw updateResult.error;
    }

    // Send denial emails
    try {
      const reasonSectionHtml = buildReasonSectionHtml(rejectionReasons);
      const reviewerNoteSectionHtml = buildReviewerNoteSectionHtml(reviewerNote);

      const advertiserEmailHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #ef4444; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .info-block { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .reason-list { margin: 10px 0 0; padding-left: 20px; }
    .footer { text-align: center; padding: 20px 0; border-top: 1px solid #ddd; color: #777; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cbnads.com/icons/icon-512.png" alt="Logo" class="logo">
    </div>
    <div class="content">
      <h2>Notice Regarding Your Ad Submission</h2>
      <p>Dear ${escapeHtml(ad.contact_name)},</p>
      <p>Thank you for submitting your advertisement request. We reviewed <strong>${escapeHtml(ad.ad_name)}</strong> and cannot approve it yet.</p>
      <div class="info-block">
        <div class="info-row"><span class="label">Ad Name:</span> ${escapeHtml(ad.ad_name)}</div>
        <div class="info-row"><span class="label">Status:</span> Not Approved</div>
      </div>
      ${reasonSectionHtml}
      ${reviewerNoteSectionHtml}
      <p>Please update the submission and send it again. If you need clarification, reply to this email and our team will help.</p>
      <p>Best regards,<br>The Team</p>
    </div>
    <div class="footer">
      <p>This is an automated message. Please do not reply directly to this email.</p>
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
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #ef4444; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .alert { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
    .info-block { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .reason-list { margin: 10px 0 0; padding-left: 20px; }
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
        <h2 style="margin-top: 0; color: #991b1b;">Ad Not Approved</h2>
        <p style="margin-bottom: 0;">A submission has been marked as not approved.</p>
      </div>
      <div class="info-block">
        <div class="info-row"><span class="label">Advertiser:</span> ${escapeHtml(ad.advertiser_name)}</div>
        <div class="info-row"><span class="label">Ad Name:</span> ${escapeHtml(ad.ad_name)}</div>
        <div class="info-row"><span class="label">Contact Info:</span> ${escapeHtml(ad.email)}</div>
      </div>
      ${reasonSectionHtml}
      ${reviewerNoteSectionHtml}
    </div>
    <div class="footer">
      <p>System Notification | ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
`;

      if (ad.email) {
        await sendEmail({
          to: ad.email,
          subject: `Notice Regarding Your Ad Submission - ${ad.ad_name}`,
          html: advertiserEmailHTML,
        }).catch((error) => console.error("[reject] Advertiser email failed:", error));
      }

      const internalTelegramText = [
        "<b>Ad Not Approved</b>",
        "",
        `<b>Advertiser:</b> ${escapeHtml(ad.advertiser_name || "N/A")}`,
        `<b>Ad:</b> ${escapeHtml(ad.ad_name || "N/A")}`,
        `<b>Contact:</b> ${escapeHtml(ad.email || "N/A")}`,
        rejectionReasons.length > 0
          ? `<b>Reasons:</b> ${escapeHtml(rejectionReasons.join("; "))}`
          : "",
        reviewerNote
          ? `<b>Reviewer Note:</b> ${escapeHtml(reviewerNote.slice(0, 250))}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const internalNotification = await notifyInternalChannels({
        supabase,
        emailSubject: `Ad Not Approved - ${ad.ad_name} (${ad.advertiser_name})`,
        emailHtml: adminEmailHTML,
        telegramText: internalTelegramText,
        excludeEmails: [ad.email],
      });
      if (!internalNotification.email_sent && !internalNotification.telegram_sent) {
        console.warn("[reject] Internal notifications were not sent:", internalNotification);
      }
    } catch (emailError) {
      console.error("Error sending rejection emails:", emailError);
    }

    return Response.json({
      success: true,
      pending_ad: updateResult.data || ad,
      reasons: rejectionReasons,
      reviewer_note: reviewerNote || null,
    });
  } catch (error) {
    console.error("Error rejecting pending ad:", error);
    return Response.json({ error: "Failed to reject ad" }, { status: 500 });
  }
}

