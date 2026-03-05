import { requireAdmin } from "../../../utils/auth-check.js";
import { db, table } from "../../../utils/supabase-db.js";
import { sendEmail } from "../../../utils/send-email.js";
import { resolveInternalNotificationEmails } from "../../../utils/internal-notification-emails.js";
import {
  fallbackInvoiceNumber,
  nextSequentialInvoiceNumber,
} from "../../../utils/invoice-helpers.js";
import { getTodayInAppTimeZone } from "../../../../../lib/timezone.js";

const APPROVAL_ZELLE_NUMBER = String(
  process.env.APPROVAL_ZELLE_NUMBER || "(555) 010-2026",
).trim();

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

const readInvoiceAmount = (invoice, ad) =>
  Number(invoice?.total ?? invoice?.amount ?? ad?.price ?? 0) || 0;

const isMissingColumnError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42703" || /column .* does not exist/i.test(message);
};

const fetchInvoiceById = async (supabase, invoiceId) => {
  const normalizedInvoiceId = String(invoiceId || "").trim();
  if (!normalizedInvoiceId) {
    return null;
  }

  const { data, error } = await supabase
    .from(table("invoices"))
    .select("*")
    .eq("id", normalizedInvoiceId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const fetchInvoiceByInvoiceItem = async (supabase, adId) => {
  const { data: invoiceItem, error: invoiceItemError } = await supabase
    .from(table("invoice_items"))
    .select("invoice_id")
    .eq("ad_id", adId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (invoiceItemError) throw invoiceItemError;

  if (!invoiceItem?.invoice_id) {
    return null;
  }

  return fetchInvoiceById(supabase, invoiceItem.invoice_id);
};

const fetchInvoiceByAdArrayLink = async (supabase, adId) => {
  let response = await supabase
    .from(table("invoices"))
    .select("*")
    .contains("ad_ids", [adId])
    .order("created_at", { ascending: false })
    .limit(1);

  if (response.error) {
    // Some environments may not support the contains operator on ad_ids.
    response = await supabase
      .from(table("invoices"))
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
  }

  if (response.error) throw response.error;

  const invoices = Array.isArray(response.data) ? response.data : [];
  const matched = invoices.find((item) =>
    Array.isArray(item?.ad_ids) &&
    item.ad_ids.some((linkedAdId) => String(linkedAdId || "").trim() === String(adId || "").trim()),
  );

  return matched || null;
};

const resolveInvoiceNumber = async (supabase) => {
  try {
    return await nextSequentialInvoiceNumber(supabase, table("invoices"));
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }
    return fallbackInvoiceNumber();
  }
};

const createAndLinkInvoice = async ({ supabase, ad, advertiser }) => {
  const nowIso = new Date().toISOString();
  const invoiceAmount = Math.max(0, Number(ad?.price || 0) || 0);
  const invoiceNumber = await resolveInvoiceNumber(supabase);

  const invoicePayload = {
    invoice_number: invoiceNumber,
    advertiser_id: ad?.advertiser_id || advertiser?.id || null,
    advertiser_name: advertiser?.advertiser_name || ad?.advertiser || null,
    ad_ids: [ad.id],
    contact_name: advertiser?.contact_name || null,
    contact_email: advertiser?.email || null,
    bill_to: advertiser?.advertiser_name || ad?.advertiser || null,
    issue_date: getTodayInAppTimeZone(),
    status: "Pending",
    discount: 0,
    tax: 0,
    total: invoiceAmount,
    amount: invoiceAmount,
    amount_paid: 0,
    notes: "Auto-generated on ad approval email.",
    created_at: nowIso,
    updated_at: nowIso,
  };

  let createInvoiceResult = await supabase
    .from(table("invoices"))
    .insert(invoicePayload)
    .select("*")
    .single();

  if (createInvoiceResult.error && isMissingColumnError(createInvoiceResult.error)) {
    createInvoiceResult = await supabase
      .from(table("invoices"))
      .insert({
        invoice_number: invoiceNumber,
        advertiser_id: ad?.advertiser_id || advertiser?.id || null,
        advertiser_name: advertiser?.advertiser_name || ad?.advertiser || null,
        ad_ids: [ad.id],
        amount: invoiceAmount,
        status: "Pending",
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .single();
  }

  if (createInvoiceResult.error) {
    throw createInvoiceResult.error;
  }

  const invoice = createInvoiceResult.data || null;
  if (!invoice?.id) {
    throw new Error("Invoice record was not created.");
  }

  try {
    await supabase.from(table("invoice_items")).insert({
      invoice_id: invoice.id,
      ad_id: ad.id,
      product_id: ad?.product_id || null,
      description: ad?.ad_name || "Ad placement",
      quantity: 1,
      unit_price: invoiceAmount,
      amount: invoiceAmount,
      created_at: nowIso,
    });
  } catch (invoiceItemError) {
    console.error("[admin/ads/send-approval-email] Unable to create invoice item:", invoiceItemError);
  }

  let adUpdateResult = await supabase
    .from(table("ads"))
    .update({
      payment: "Pending",
      invoice_id: invoice.id,
      paid_via_invoice_id: invoice.id,
      updated_at: nowIso,
    })
    .eq("id", ad.id)
    .select("*")
    .maybeSingle();

  if (adUpdateResult.error && isMissingColumnError(adUpdateResult.error)) {
    adUpdateResult = await supabase
      .from(table("ads"))
      .update({
        payment: "Pending",
        updated_at: nowIso,
      })
      .eq("id", ad.id)
      .select("*")
      .maybeSingle();
  }

  if (adUpdateResult.error) {
    throw adUpdateResult.error;
  }

  return {
    invoice,
    ad: adUpdateResult.data || ad,
    invoiceCreated: true,
  };
};

const resolveOrCreateInvoice = async ({ supabase, ad, advertiser, bodyInvoiceId }) => {
  const candidateIds = [
    ad?.paid_via_invoice_id,
    ad?.invoice_id,
    bodyInvoiceId,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  for (const candidateId of candidateIds) {
    const invoice = await fetchInvoiceById(supabase, candidateId);
    if (invoice?.id) {
      return { invoice, ad, invoiceCreated: false };
    }
  }

  const invoiceByItem = await fetchInvoiceByInvoiceItem(supabase, ad.id);
  if (invoiceByItem?.id) {
    return { invoice: invoiceByItem, ad, invoiceCreated: false };
  }

  const invoiceByArrayLink = await fetchInvoiceByAdArrayLink(supabase, ad.id);
  if (invoiceByArrayLink?.id) {
    return { invoice: invoiceByArrayLink, ad, invoiceCreated: false };
  }

  return createAndLinkInvoice({ supabase, ad, advertiser });
};

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const body = await request.json();
    const adId = String(body?.ad_id || "").trim();
    const advertiserIdFromBody = String(body?.advertiser_id || "").trim();

    if (!adId) {
      return Response.json({ error: "ad_id is required." }, { status: 400 });
    }

    const supabase = db();
    const { data: ad, error: adError } = await supabase
      .from(table("ads"))
      .select("*")
      .eq("id", adId)
      .maybeSingle();
    if (adError) {
      throw adError;
    }
    if (!ad) {
      return Response.json({ error: "Ad not found." }, { status: 404 });
    }

    const advertiserId =
      String(ad?.advertiser_id || "").trim() || advertiserIdFromBody;

    let advertiser = null;
    if (advertiserId) {
      const { data, error } = await supabase
        .from(table("advertisers"))
        .select("*")
        .eq("id", advertiserId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      advertiser = data || null;
    }

    const advertiserEmail = String(
      advertiser?.email || body?.email || "",
    )
      .trim()
      .toLowerCase();

    if (!advertiserEmail) {
      return Response.json(
        { error: "Advertiser email is missing." },
        { status: 400 },
      );
    }

    const invoiceResolution = await resolveOrCreateInvoice({
      supabase,
      ad,
      advertiser,
      bodyInvoiceId: body?.invoice_id,
    });
    const invoice = invoiceResolution?.invoice || null;
    const resolvedAd = invoiceResolution?.ad || ad;
    const invoiceCreated = Boolean(invoiceResolution?.invoiceCreated);

    if (!invoice?.id) {
      return Response.json(
        { error: "No linked invoice found for this ad. Please create an invoice first." },
        { status: 409 },
      );
    }

    const invoiceNumberText =
      String(invoice?.invoice_number || "").trim() ||
      fallbackInvoiceNumber();
    const amountDueText = formatCurrency(readInvoiceAmount(invoice, resolvedAd));
    const zelleNumberText = escapeHtml(APPROVAL_ZELLE_NUMBER || "(555) 010-2026");
    const internalEmails = (
      await resolveInternalNotificationEmails(supabase)
    ).filter((email) => email !== advertiserEmail);

    const contactName = String(
      advertiser?.contact_name || body?.contact_name || "there",
    ).trim();
    const advertiserNameText = String(
      advertiser?.advertiser_name || ad?.advertiser || body?.advertiser_name || "",
    ).trim();
    const adName = escapeHtml(ad?.ad_name || "your ad");
    const statusText = escapeHtml(resolvedAd?.status || "Scheduled");

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
    .payment-block { background: #ecfdf5; border: 1px solid #a7f3d0; padding: 18px; margin: 20px 0; border-radius: 6px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .footer { text-align: center; padding: 20px 0; border-top: 1px solid #ddd; color: #777; font-size: 12px; }
    ol { margin: 10px 0 0 18px; padding: 0; }
    li { margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cbnads.com/icons/icon-512.png" alt="Logo" class="logo">
    </div>
    <div class="content">
      <h2>Your Ad Has Been Approved</h2>
      <p>Dear ${escapeHtml(contactName)},</p>
      <p>Great news. Your advertising request for <strong>${adName}</strong> has been approved by our team.</p>
      <p>To activate scheduling, please settle the invoice below:</p>
      <div class="info-block">
        <div class="info-row"><span class="label">Ad Name:</span> ${adName}</div>
        <div class="info-row"><span class="label">Invoice Number:</span> ${escapeHtml(invoiceNumberText)}</div>
        <div class="info-row"><span class="label">Amount Due:</span> ${escapeHtml(amountDueText)}</div>
        <div class="info-row"><span class="label">Status:</span> ${statusText}</div>
      </div>
      <div class="payment-block">
        <p class="label" style="margin-top: 0;">Payment Instructions (Demo)</p>
        <ol>
          <li>Send <strong>${escapeHtml(amountDueText)}</strong> via Zelle to <strong>${zelleNumberText}</strong>.</li>
          <li>Use <strong>${escapeHtml(invoiceNumberText)}</strong> in the payment memo/reference.</li>
          <li>Reply with payment confirmation so our team can verify quickly.</li>
        </ol>
      </div>
      <p>If you have any questions, contact us and include your invoice number for faster support.</p>
      <p>Best regards,<br>The Team</p>
    </div>
    <div class="footer">
      <p>This is an automated message. Please do not reply directly to this email.</p>
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
        <h2 style="margin-top: 0; color: #065f46;">Ad Created and Approved</h2>
        <p style="margin-bottom: 0;">A newly created ad has been approved and the payment notice was sent to the advertiser.</p>
      </div>
      <div class="info-block">
        <div class="info-row"><span class="label">Advertiser:</span> ${escapeHtml(advertiserNameText || "N/A")}</div>
        <div class="info-row"><span class="label">Contact:</span> ${escapeHtml(contactName || "N/A")} (${escapeHtml(advertiserEmail)})</div>
        <div class="info-row"><span class="label">Ad Name:</span> ${adName}</div>
        <div class="info-row"><span class="label">Invoice Number:</span> ${escapeHtml(invoiceNumberText)}</div>
        <div class="info-row"><span class="label">Amount Due:</span> ${escapeHtml(amountDueText)}</div>
        <div class="info-row"><span class="label">Status:</span> ${statusText}</div>
        <div class="info-row"><span class="label">Payment Method:</span> Zelle (${zelleNumberText})</div>
      </div>
    </div>
    <div class="footer">
      <p>System Notification | ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
`;

    await sendEmail({
      to: advertiserEmail,
      subject: `Ad Approved - Invoice ${invoiceNumberText} (${String(
        ad?.ad_name || "Ad",
      ).trim()})`,
      html: advertiserEmailHTML,
    });

    if (internalEmails.length > 0) {
      await sendEmail({
        to: internalEmails,
        subject: `Ad Created - ${String(ad?.ad_name || "Ad").trim()} | Invoice ${invoiceNumberText}`,
        html: internalEmailHTML,
      });
    }

    return Response.json({
      success: true,
      email: advertiserEmail,
      internal_emails: internalEmails,
      ad_id: resolvedAd.id,
      invoice_id: invoice?.id || null,
      invoice_number: invoiceNumberText,
      amount_due: amountDueText,
      invoice_created: invoiceCreated,
      invoice,
    });
  } catch (error) {
    console.error("[admin/ads/send-approval-email] Failed:", error);
    return Response.json(
      { error: error?.message || "Failed to send approval email." },
      { status: 500 },
    );
  }
}
