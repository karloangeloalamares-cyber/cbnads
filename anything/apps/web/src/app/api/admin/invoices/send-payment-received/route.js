import { requirePermission } from "../../../utils/auth-check.js";
import { db, table } from "../../../utils/supabase-db.js";
import { sendEmail } from "../../../utils/send-email.js";
import { notifyInternalChannels } from "../../../utils/internal-notification-channels.js";
import { buildAdvertiserDashboardSignInUrl } from "../../../utils/advertiser-dashboard-url.js";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value) || 0);

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

const readNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const uniqueIds = (values) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

const resolveAmountPaid = (invoice, itemsTotal = 0) => {
  const total = Math.max(
    0,
    readNumber(invoice?.total ?? invoice?.amount ?? itemsTotal),
  );
  const recordedAmountPaid = Math.max(0, readNumber(invoice?.amount_paid));

  if (recordedAmountPaid > 0) {
    return recordedAmountPaid;
  }
  if (normalizeStatus(invoice?.status) === "paid") {
    return total;
  }
  return 0;
};

export async function POST(request) {
  try {
    const auth = await requirePermission("billing:edit", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const body = await request.json();
    const invoiceId = String(body?.invoice_id || "").trim();
    if (!invoiceId) {
      return Response.json({ error: "invoice_id is required." }, { status: 400 });
    }

    const supabase = db();
    const { data: invoice, error: invoiceError } = await supabase
      .from(table("invoices"))
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) {
      return Response.json({ error: "Invoice not found." }, { status: 404 });
    }

    if (invoice?.paid_via_credits === true) {
      return Response.json(
        {
          skipped: true,
          reason: "paid_via_credits",
          error: "Payment-received notifications are not sent for credit-paid invoices.",
        },
        { status: 409 },
      );
    }

    if (normalizeStatus(invoice.status) !== "paid") {
      return Response.json(
        { error: "Invoice is not marked as paid yet." },
        { status: 409 },
      );
    }

    const advertiserId = String(invoice?.advertiser_id || "").trim();
    let advertiser = null;
    if (advertiserId) {
      const { data, error } = await supabase
        .from(table("advertisers"))
        .select("id, advertiser_name, contact_name, email")
        .eq("id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      advertiser = data || null;
    }

    const advertiserEmail = String(
      invoice?.contact_email || advertiser?.email || "",
    )
      .trim()
      .toLowerCase();
    if (!advertiserEmail) {
      return Response.json(
        { error: "Advertiser email is missing on this invoice." },
        { status: 400 },
      );
    }

    const { data: invoiceItems, error: invoiceItemsError } = await supabase
      .from(table("invoice_items"))
      .select("ad_id, amount, unit_price, quantity")
      .eq("invoice_id", invoice.id);
    if (invoiceItemsError) throw invoiceItemsError;

    const invoiceItemsTotal = toArray(invoiceItems).reduce((sum, item) => {
      const amount = readNumber(item?.amount);
      if (amount > 0) {
        return sum + amount;
      }

      const quantity = Math.max(1, readNumber(item?.quantity) || 1);
      const unitPrice = readNumber(item?.unit_price);
      return sum + quantity * unitPrice;
    }, 0);

    const adIds = uniqueIds([
      ...toArray(invoice?.ad_ids),
      ...toArray(invoiceItems).map((item) => item?.ad_id),
    ]);

    let adRows = [];
    if (adIds.length > 0) {
      const { data, error } = await supabase
        .from(table("ads"))
        .select("id, ad_name, status, payment")
        .in("id", adIds);
      if (error) throw error;
      adRows = Array.isArray(data) ? data : [];
    }

    const adNames = adRows
      .map((ad) => String(ad?.ad_name || "").trim())
      .filter(Boolean);
    const adCount = adNames.length || adIds.length;
    const adNamesPreview = adNames.slice(0, 5);
    const additionalAdCount = Math.max(adCount - adNamesPreview.length, 0);
    const adsSummaryText =
      adNamesPreview.length > 0
        ? `${adNamesPreview.join(", ")}${additionalAdCount > 0 ? ` (+${additionalAdCount} more)` : ""}`
        : `Ad count: ${adCount}`;

    const invoiceNumberText =
      String(invoice?.invoice_number || "").trim() || `INV-${invoice.id}`;
    const amountPaidValue = resolveAmountPaid(invoice, invoiceItemsTotal);
    const amountPaidText = formatCurrency(amountPaidValue);
    const advertiserNameText = String(
      invoice?.advertiser_name || advertiser?.advertiser_name || "Advertiser",
    ).trim();
    const contactNameText = String(
      invoice?.contact_name || advertiser?.contact_name || "there",
    ).trim();
    const dashboardSignInUrl = buildAdvertiserDashboardSignInUrl({
      request,
      email: advertiserEmail,
      section: "Billing",
    });

    const advertiserEmailHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #10b981; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .info-block { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px; }
    .ready-block { background: #eff6ff; border: 1px solid #bfdbfe; padding: 18px; margin: 20px 0; border-radius: 6px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .button { display: inline-block; background: #111827; color: #ffffff !important; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; padding: 20px 0; border-top: 1px solid #ddd; color: #777; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cbnads.com/icons/icon-512.png" alt="Logo" class="logo">
    </div>
    <div class="content">
      <h2>Payment Received</h2>
      <p>Dear ${escapeHtml(contactNameText)},</p>
      <p>We have confirmed your payment. Your ad request is now payment-cleared and ready for publishing.</p>
      <div class="info-block">
        <div class="info-row"><span class="label">Invoice Number:</span> ${escapeHtml(invoiceNumberText)}</div>
        <div class="info-row"><span class="label">Amount Received:</span> ${escapeHtml(amountPaidText)}</div>
        <div class="info-row"><span class="label">Advertiser:</span> ${escapeHtml(advertiserNameText)}</div>
        <div class="info-row"><span class="label">Ads:</span> ${escapeHtml(adsSummaryText)}</div>
      </div>
      <div class="ready-block">
        <p style="margin-top: 0;">Our team can now proceed with publishing based on the approved schedule.</p>
        <p style="margin: 16px 0 0;">
          <a href="${dashboardSignInUrl}" class="button">Open advertiser dashboard</a>
        </p>
      </div>
      <p>Thank you for your payment.</p>
      <p>Best regards,<br>The Team</p>
    </div>
    <div class="footer">
      <p>This is an automated payment confirmation email.</p>
    </div>
  </div>
</body>
</html>
`;

    const internalEmailHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #10b981; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .alert { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
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
      <div class="alert">
        <h2 style="margin-top: 0; color: #065f46;">Payment Received - Ready to Publish</h2>
        <p style="margin-bottom: 0;">Invoice payment has been confirmed and ads are now publish-ready.</p>
      </div>
      <div class="info-block">
        <div class="info-row"><span class="label">Advertiser:</span> ${escapeHtml(advertiserNameText)}</div>
        <div class="info-row"><span class="label">Invoice Number:</span> ${escapeHtml(invoiceNumberText)}</div>
        <div class="info-row"><span class="label">Amount Received:</span> ${escapeHtml(amountPaidText)}</div>
        <div class="info-row"><span class="label">Ads:</span> ${escapeHtml(adsSummaryText)}</div>
      </div>
    </div>
    <div class="footer">
      <p>System Notification | ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
`;

    let advertiserEmailSent = false;
    let advertiserEmailError = null;
    try {
      await sendEmail({
        to: advertiserEmail,
        subject: `Payment Received - Invoice ${invoiceNumberText}`,
        html: advertiserEmailHTML,
      });
      advertiserEmailSent = true;
    } catch (error) {
      advertiserEmailError = String(
        error?.message || error || "Failed to send advertiser payment email.",
      );
      console.error("[admin/invoices/send-payment-received] Advertiser email failed:", error);
    }

    const internalTelegramText = [
      "<b>Payment Received - Ready to Publish</b>",
      "",
      `<b>Advertiser:</b> ${escapeHtml(advertiserNameText)}`,
      `<b>Invoice:</b> ${escapeHtml(invoiceNumberText)}`,
      `<b>Amount:</b> ${escapeHtml(amountPaidText)}`,
      `<b>Ads:</b> ${escapeHtml(adsSummaryText)}`,
    ].join("\n");

    const internalNotification = await notifyInternalChannels({
      supabase,
      emailSubject: `Payment Received - ${advertiserNameText} | ${invoiceNumberText}`,
      emailHtml: internalEmailHTML,
      telegramText: internalTelegramText,
      excludeEmails: [advertiserEmail],
    });

    return Response.json({
      success: true,
      invoice_id: invoice.id,
      invoice_number: invoiceNumberText,
      advertiser_email: advertiserEmail,
      advertiser_email_sent: advertiserEmailSent,
      advertiser_email_error: advertiserEmailError,
      ad_count: adCount,
      ad_names: adNames,
      internal_notifications: {
        email_sent: internalNotification.email_sent,
        telegram_sent: internalNotification.telegram_sent,
        email_recipients: internalNotification.emails.length,
        telegram_recipients: internalNotification.telegram_chat_ids.length,
        email_error: internalNotification.email_error,
        telegram_error: internalNotification.telegram_error,
      },
    });
  } catch (error) {
    console.error("[admin/invoices/send-payment-received] Failed:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
