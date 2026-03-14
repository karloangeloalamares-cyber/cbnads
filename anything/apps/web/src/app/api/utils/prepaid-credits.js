import { recalculateAdvertiserSpend } from "./recalculate-advertiser-spend.js";
import { sendEmail } from "./send-email.js";
import { notifyInternalChannels } from "./internal-notification-channels.js";
import { buildAdvertiserDashboardSignInUrl } from "./advertiser-dashboard-url.js";
import { table } from "./supabase-db.js";

const normalizeText = (value) => String(value || "").trim().toLowerCase();
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

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(readNumber(value));

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getFirstRow = (value) =>
  Array.isArray(value) ? value[0] || null : value || null;

export const isCreditPaidInvoice = (invoice) => invoice?.paid_via_credits === true;

export const fetchInvoiceWithItems = async (supabase, invoiceId) => {
  const normalizedInvoiceId = String(invoiceId || "").trim();
  if (!normalizedInvoiceId) {
    return null;
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from(table("invoices"))
    .select("*")
    .eq("id", normalizedInvoiceId)
    .maybeSingle();
  if (invoiceError) {
    throw invoiceError;
  }
  if (!invoice) {
    return null;
  }

  const { data: items, error: itemsError } = await supabase
    .from(table("invoice_items"))
    .select("id, invoice_id, ad_id, product_id, description, quantity, unit_price, amount, created_at")
    .eq("invoice_id", normalizedInvoiceId)
    .order("created_at", { ascending: true });
  if (itemsError) {
    throw itemsError;
  }

  return {
    ...invoice,
    items: items || [],
  };
};

const fetchAdvertiserById = async (supabase, advertiserId) => {
  const normalizedAdvertiserId = String(advertiserId || "").trim();
  if (!normalizedAdvertiserId) {
    return null;
  }

  const { data, error } = await supabase
    .from(table("advertisers"))
    .select("*")
    .eq("id", normalizedAdvertiserId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data || null;
};

const fetchLinkedAdsForInvoice = async (supabase, invoice) => {
  const adIds = uniqueIds([
    ...toArray(invoice?.ad_ids),
    ...toArray(invoice?.items).map((item) => item?.ad_id),
  ]);

  if (adIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from(table("ads"))
    .select("id, ad_name, advertiser, advertiser_id, status, payment")
    .in("id", adIds);
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data : [];
};

const buildLinkedAdsSummary = (ads) => {
  const adNames = toArray(ads)
    .map((ad) => String(ad?.ad_name || "").trim())
    .filter(Boolean);
  const adCount = adNames.length || toArray(ads).length;
  const preview = adNames.slice(0, 5);
  const additionalCount = Math.max(adCount - preview.length, 0);

  if (preview.length === 0) {
    return `Ad count: ${adCount}`;
  }

  return `${preview.join(", ")}${additionalCount > 0 ? ` (+${additionalCount} more)` : ""}`;
};

export const sendInvoiceCoveredByCreditsNotice = async ({
  request,
  supabase,
  invoice,
}) => {
  if (!request || !invoice?.id) {
    return { skipped: true, reason: "missing_context" };
  }

  const enrichedInvoice = invoice.items ? invoice : await fetchInvoiceWithItems(supabase, invoice.id);
  if (!enrichedInvoice) {
    return { skipped: true, reason: "missing_invoice" };
  }

  const advertiser = await fetchAdvertiserById(supabase, enrichedInvoice.advertiser_id);
  const linkedAds = await fetchLinkedAdsForInvoice(supabase, enrichedInvoice);
  const advertiserEmail = String(
    enrichedInvoice.contact_email || advertiser?.email || "",
  )
    .trim()
    .toLowerCase();

  if (!advertiserEmail) {
    return { skipped: true, reason: "missing_email" };
  }

  const invoiceNumberText =
    String(enrichedInvoice.invoice_number || "").trim() || `INV-${enrichedInvoice.id}`;
  const totalValue = Math.max(
    0,
    readNumber(enrichedInvoice.total ?? enrichedInvoice.amount ?? enrichedInvoice.amount_paid),
  );
  const totalText = formatCurrency(totalValue);
  const advertiserNameText = String(
    enrichedInvoice.advertiser_name || advertiser?.advertiser_name || "Advertiser",
  ).trim();
  const contactNameText = String(
    enrichedInvoice.contact_name || advertiser?.contact_name || "there",
  ).trim();
  const adsSummaryText = buildLinkedAdsSummary(linkedAds);
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
    .credit-block { background: #eff6ff; border: 1px solid #93c5fd; padding: 18px; margin: 20px 0; border-radius: 6px; }
    .dashboard-block { background: #ecfdf5; border: 1px solid #86efac; padding: 18px; margin: 20px 0; border-radius: 6px; }
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
      <h2>Invoice Covered by Prepaid Credits</h2>
      <p>Dear ${escapeHtml(contactNameText)},</p>
      <p>Your invoice has been fully covered using your prepaid credits. No manual payment is required.</p>
      <div class="info-block">
        <div class="info-row"><span class="label">Invoice Number:</span> ${escapeHtml(invoiceNumberText)}</div>
        <div class="info-row"><span class="label">Amount Covered:</span> ${escapeHtml(totalText)}</div>
        <div class="info-row"><span class="label">Advertiser:</span> ${escapeHtml(advertiserNameText)}</div>
        <div class="info-row"><span class="label">Ads:</span> ${escapeHtml(adsSummaryText)}</div>
      </div>
      <div class="credit-block">
        <p style="margin-top: 0;">This invoice is marked paid via prepaid credits. Our team can proceed without waiting for an external payment.</p>
      </div>
      <div class="dashboard-block">
        <p style="margin-top: 0;">You can review your billing history anytime in the advertiser dashboard.</p>
        <p style="margin: 16px 0 0;">
          <a href="${dashboardSignInUrl}" class="button">Open advertiser dashboard</a>
        </p>
      </div>
      <p>Thank you.</p>
      <p>Best regards,<br>The Team</p>
    </div>
    <div class="footer">
      <p>This is an automated billing confirmation email.</p>
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
    .alert { background: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; }
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
        <h2 style="margin-top: 0; color: #1d4ed8;">Invoice Covered by Prepaid Credits</h2>
        <p style="margin-bottom: 0;">The advertiser did not need to make an external payment.</p>
      </div>
      <div class="info-block">
        <div class="info-row"><span class="label">Advertiser:</span> ${escapeHtml(advertiserNameText)}</div>
        <div class="info-row"><span class="label">Invoice Number:</span> ${escapeHtml(invoiceNumberText)}</div>
        <div class="info-row"><span class="label">Amount Covered:</span> ${escapeHtml(totalText)}</div>
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
      subject: `Paid via Prepaid Credits - Invoice ${invoiceNumberText}`,
      html: advertiserEmailHTML,
    });
    advertiserEmailSent = true;
  } catch (error) {
    advertiserEmailError =
      error instanceof Error ? error.message : "Failed to send advertiser credit notice.";
  }

  const internalTelegramText = [
    "<b>Invoice Covered by Prepaid Credits</b>",
    "",
    `<b>Advertiser:</b> ${escapeHtml(advertiserNameText)}`,
    `<b>Invoice:</b> ${escapeHtml(invoiceNumberText)}`,
    `<b>Amount:</b> ${escapeHtml(totalText)}`,
    `<b>Ads:</b> ${escapeHtml(adsSummaryText)}`,
  ].join("\n");

  let internalNotification = {
    emails: [],
    telegram_chat_ids: [],
    email_sent: false,
    telegram_sent: false,
  };
  try {
    internalNotification = await notifyInternalChannels({
      supabase,
      emailSubject: `Paid via Credits - ${advertiserNameText} | ${invoiceNumberText}`,
      emailHtml: internalEmailHTML,
      telegramText: internalTelegramText,
      excludeEmails: [advertiserEmail],
    });
  } catch (error) {
    return {
      skipped: false,
      email: advertiserEmail,
      advertiser_email_sent: advertiserEmailSent,
      advertiser_email_error:
        advertiserEmailError ||
        (error instanceof Error ? error.message : "Failed to send internal credit notice."),
      internal_emails: [],
      internal_telegram_chat_ids: [],
      internal_email_sent: false,
      internal_telegram_sent: false,
    };
  }

  return {
    skipped: false,
    email: advertiserEmail,
    advertiser_email_sent: advertiserEmailSent,
    advertiser_email_error: advertiserEmailError,
    internal_emails: internalNotification.emails,
    internal_telegram_chat_ids: internalNotification.telegram_chat_ids,
    internal_email_sent: internalNotification.email_sent,
    internal_telegram_sent: internalNotification.telegram_sent,
  };
};

export const attemptInvoiceCreditPayment = async ({
  supabase,
  invoiceId,
  actorUserId = null,
  note = null,
}) => {
  const normalizedInvoiceId = String(invoiceId || "").trim();
  if (!normalizedInvoiceId) {
    return {
      applied: false,
      reason: "missing_invoice",
      invoice: null,
      remainingCredits: 0,
      advertiserId: null,
      amount: 0,
      ledgerId: null,
    };
  }

  const { data, error } = await supabase.rpc("cbnads_web_try_pay_invoice_with_credits", {
    p_invoice_id: normalizedInvoiceId,
    p_created_by: actorUserId || null,
    p_note: note || null,
  });
  if (error) {
    throw error;
  }

  const result = getFirstRow(data);
  const reason = String(result?.reason || "").trim() || "unknown";
  const applied = result?.applied === true;
  const advertiserId = String(result?.advertiser_id || "").trim() || null;

  if (applied && advertiserId) {
    await recalculateAdvertiserSpend(advertiserId);
  }

  const invoice =
    reason === "invoice_not_found" ? null : await fetchInvoiceWithItems(supabase, normalizedInvoiceId);

  return {
    applied,
    reason,
    invoice,
    remainingCredits: readNumber(result?.balance_after),
    advertiserId,
    amount: readNumber(result?.amount),
    ledgerId: result?.ledger_id || null,
  };
};

export const applyInvoiceCredits = async ({
  request = null,
  supabase,
  invoiceId,
  actorUserId = null,
  note = null,
  sendNotice = false,
}) => {
  const result = await attemptInvoiceCreditPayment({
    supabase,
    invoiceId,
    actorUserId,
    note,
  });

  let notice = { skipped: true };
  let noticeType = "none";
  if (result.applied) {
    noticeType = "covered_by_credits";
    if (sendNotice && result.invoice) {
      try {
        notice = await sendInvoiceCoveredByCreditsNotice({
          request,
          supabase,
          invoice: result.invoice,
        });
      } catch (error) {
        notice = {
          skipped: false,
          advertiser_email_sent: false,
          advertiser_email_error:
            error instanceof Error ? error.message : "Failed to send credit notice.",
        };
      }
    }
  }

  return {
    ...result,
    notice,
    notice_type: noticeType,
  };
};

export const isCreditRuleViolation = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("insufficient credits") ||
    message.includes("amount must not be zero") ||
    message.includes("note is required") ||
    message.includes("entry_type is required") ||
    message.includes("advertiser not found") ||
    message.includes("invoice_id is required") ||
    message.includes("advertiser_id is required")
  );
};

export const shouldSendCoveredCreditsNotice = (invoice) =>
  normalizeText(invoice?.status) === "paid" && isCreditPaidInvoice(invoice);
