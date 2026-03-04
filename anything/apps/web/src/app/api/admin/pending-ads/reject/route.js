import { db, table } from "../../../utils/supabase-db.js";
import { requireAdmin } from "../../../utils/auth-check.js";
import { sendEmail } from "../../../utils/send-email.js";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const body = await request.json();
    const { pending_ad_id } = body;

    if (!pending_ad_id) {
      return Response.json({ error: "Missing pending_ad_id" }, { status: 400 });
    }

    const { data: ad, error: adError } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .eq("id", pending_ad_id)
      .maybeSingle();

    if (adError || !ad) {
      return Response.json({ error: "Pending ad not found prior to rejection" }, { status: 404 });
    }

    const { error } = await supabase
      .from(table("pending_ads"))
      .update({
        status: "not_approved",
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pending_ad_id);
    if (error) throw error;

    // Send denial emails
    try {
      const { data: adminPrefs } = await supabase
        .from(table("admin_notification_preferences"))
        .select("email_address, email_enabled")
        .eq("email_enabled", true);

      const { data: globalPrefs } = await supabase
        .from(table("notification_preferences"))
        .select("reminder_email, email_enabled")
        .order("id", { ascending: true })
        .limit(1);

      const adminEmails = Array.from(
        new Set(
          [
            ...(adminPrefs || []).map((admin) => admin.email_address),
            ...(globalPrefs?.[0]?.email_enabled ? [globalPrefs?.[0]?.reminder_email] : []),
          ].filter(Boolean),
        ),
      );

      const escapeHtml = (value) =>
        String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

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
    .footer { text-align: center; padding: 20px 0; border-top: 1px solid #ddd; color: #777; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/" alt="Logo" class="logo">
    </div>
    <div class="content">
      <h2>Notice Regarding Your Ad Submission</h2>
      <p>Dear ${escapeHtml(ad.contact_name)},</p>
      <p>Thank you for submitting your advertisement request. We have reviewed your submission for <strong>${escapeHtml(ad.ad_name)}</strong>, and unfortunately, it has been denied at this time.</p>
      <div class="info-block">
        <div class="info-row"><span class="label">Ad Name:</span> ${escapeHtml(ad.ad_name)}</div>
        <div class="info-row"><span class="label">Status:</span> Denied</div>
      </div>
      <p>Should you have any questions or if you'd like to submit a revised advertisement, please reply to this email or contact support.</p>
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
        <h2 style="margin-top: 0; color: #991b1b;">❌ Ad Denied</h2>
        <p style="margin-bottom: 0;">An ad submission has been denied and marked as not approved.</p>
      </div>
      <div class="info-block">
        <div class="info-row"><span class="label">Advertiser:</span> ${escapeHtml(ad.advertiser_name)}</div>
        <div class="info-row"><span class="label">Ad Name:</span> ${escapeHtml(ad.ad_name)}</div>
        <div class="info-row"><span class="label">Contact Info:</span> ${escapeHtml(ad.email)}</div>
      </div>
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
        }).catch((err) => console.error("[reject] Advertiser email failed:", err));
      }

      if (adminEmails.length > 0) {
        await sendEmail({
          to: adminEmails,
          subject: `Ad Denied - ${ad.ad_name} (${ad.advertiser_name})`,
          html: adminEmailHTML,
        }).catch((err) => console.error("[reject] Admin email failed:", err));
      }
    } catch (emailErr) {
      console.error("Error sending rejection emails:", emailErr);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error rejecting pending ad:", error);
    return Response.json({ error: "Failed to reject ad" }, { status: 500 });
  }
}
