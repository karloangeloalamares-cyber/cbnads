import { db, table } from "../../../utils/supabase-db.js";
import { requireAdmin } from "../../../utils/auth-check.js";
import { updateAdvertiserNextAdDate } from "../../../utils/update-advertiser-next-ad.js";
import { APP_TIME_ZONE, getTodayInAppTimeZone } from "../../../../../lib/timezone.js";
import {
  checkBatchAvailability,
  checkSingleDateAvailability,
  expandDateRange,
} from "../../../utils/ad-availability.js";
import { sendEmail } from "../../../utils/send-email.js";
import { adAmount, nextSequentialInvoiceNumber } from "../../../utils/invoice-helpers.js";

const APPROVAL_ZELLE_NUMBER = String(
  process.env.APPROVAL_ZELLE_NUMBER || "(555) 010-2026",
).trim();

const isMissingColumnError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42703" || /column .* does not exist/i.test(message);
};

const normalizePostType = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

const countCustomScheduleDates = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean).length;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).length;
      }
    } catch {
      return 1;
    }
  }
  return 0;
};

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

const resolveApprovalPricing = async ({ supabase, pendingAd }) => {
  let resolvedProduct = null;
  const pendingProductId = String(pendingAd?.product_id || "").trim();
  if (pendingProductId) {
    const { data, error } = await supabase
      .from(table("products"))
      .select("id, product_name, price, placement")
      .eq("id", pendingProductId)
      .maybeSingle();
    if (error) throw error;
    resolvedProduct = data || null;
  }

  if (!resolvedProduct) {
    const normalizedPlacement = String(pendingAd?.placement || "").trim();
    if (normalizedPlacement) {
      const { data, error } = await supabase
        .from(table("products"))
        .select("id, product_name, price, placement")
        .ilike("placement", normalizedPlacement)
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      resolvedProduct = Array.isArray(data) && data.length > 0 ? data[0] : null;
    }
  }

  const unitAmount = Math.max(
    0,
    adAmount({
      payment: pendingAd?.payment,
      price: pendingAd?.price,
      product_price: resolvedProduct?.price,
    }),
  );

  const invoiceMultiplier =
    normalizePostType(pendingAd?.post_type) === "custom_schedule"
      ? Math.max(1, countCustomScheduleDates(pendingAd?.custom_dates))
      : 1;

  return {
    resolvedProduct,
    unitAmount,
    invoiceAmount: unitAmount * invoiceMultiplier,
  };
};

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const body = await request.json();
    const {
      pending_ad_id,
      use_existing_advertiser,
      existing_advertiser_id,
      force_inactive,
    } = body;

    if (!pending_ad_id) {
      return Response.json({ error: "Missing pending_ad_id" }, { status: 400 });
    }

    const { data: ad, error: pendingError } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .eq("id", pending_ad_id)
      .maybeSingle();
    if (pendingError) throw pendingError;
    if (!ad) {
      return Response.json({ error: "Pending ad not found" }, { status: 404 });
    }

    let advertiserId = null;
    let advertiserName = ad.advertiser_name;
    let existingAdvertiserInactive = false;

    if (use_existing_advertiser && existing_advertiser_id) {
      const { data: existingAdvertiser, error: existingError } = await supabase
        .from(table("advertisers"))
        .select("*")
        .eq("id", existing_advertiser_id)
        .maybeSingle();
      if (existingError) throw existingError;

      if (!existingAdvertiser) {
        return Response.json({ error: "Advertiser not found" }, { status: 404 });
      }

      advertiserId = existingAdvertiser.id;
      advertiserName = existingAdvertiser.advertiser_name;
      existingAdvertiserInactive =
        String(existingAdvertiser.status || "").toLowerCase() === "inactive";

      if (existingAdvertiserInactive && !force_inactive) {
        return Response.json(
          {
            warning: true,
            message: `Advertiser "${advertiserName}" is currently Inactive. The approved ad will be created as Draft status. Approve anyway?`,
            advertiserStatus: "Inactive",
          },
          { status: 200 },
        );
      }
    } else {
      const nowIso = new Date().toISOString();
      let createAdvertiserResult = await supabase
        .from(table("advertisers"))
        .insert({
          advertiser_name: ad.advertiser_name,
          contact_name: ad.contact_name,
          email: ad.email,
          phone: ad.phone_number || ad.phone || null,
          phone_number: ad.phone_number || ad.phone || null,
          status: "active",
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("id, advertiser_name")
        .single();

      if (createAdvertiserResult.error) {
        const message = String(createAdvertiserResult.error.message || "");
        const missingCompatColumn =
          message.includes("phone_number") || message.includes("status");
        if (!missingCompatColumn) throw createAdvertiserResult.error;

        createAdvertiserResult = await supabase
          .from(table("advertisers"))
          .insert({
            advertiser_name: ad.advertiser_name,
            contact_name: ad.contact_name,
            email: ad.email,
            phone: ad.phone_number || ad.phone || null,
            created_at: nowIso,
            updated_at: nowIso,
          })
          .select("id, advertiser_name")
          .single();
        if (createAdvertiserResult.error) throw createAdvertiserResult.error;
      }

      const newAdvertiser = createAdvertiserResult.data;
      advertiserId = newAdvertiser.id;
      advertiserName = newAdvertiser.advertiser_name;
    }

    const advertiserInactive =
      use_existing_advertiser &&
      existing_advertiser_id &&
      existingAdvertiserInactive;

    const adStatus = advertiserInactive ? "Draft" : "Scheduled";
    const nowIso = new Date().toISOString();

    if (ad.post_type === "One-Time Post" && ad.post_date_from) {
      const availability = await checkSingleDateAvailability({
        supabase,
        date: ad.post_date_from,
        postType: ad.post_type,
        postTime: ad.post_time,
        excludeId: pending_ad_id,
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

    if (ad.post_type === "Daily Run" && ad.post_date_from && ad.post_date_to) {
      const availability = await checkBatchAvailability({
        supabase,
        dates: expandDateRange(ad.post_date_from, ad.post_date_to),
        excludeId: pending_ad_id,
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

    if (
      ad.post_type === "Custom Schedule" &&
      Array.isArray(ad.custom_dates) &&
      ad.custom_dates.length > 0
    ) {
      const availability = await checkBatchAvailability({
        supabase,
        dates: ad.custom_dates.map((entry) =>
          entry && typeof entry === "object" ? entry.date : entry,
        ),
        excludeId: pending_ad_id,
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

    const { resolvedProduct, unitAmount, invoiceAmount } = await resolveApprovalPricing({
      supabase,
      pendingAd: ad,
    });

    let { data: newAd, error: createAdError } = await supabase
      .from(table("ads"))
      .insert({
        ad_name: ad.ad_name,
        advertiser: advertiserName,
        advertiser_id: advertiserId,
        product_id: resolvedProduct?.id || ad.product_id || null,
        product_name: resolvedProduct?.product_name || ad.product_name || null,
        status: adStatus,
        post_type: ad.post_type,
        placement: ad.placement || "Standard",
        payment: "Pending",
        schedule: ad.post_type === "One-Time Post" ? ad.post_date_from : null,
        post_date: ad.post_type === "One-Time Post" ? ad.post_date_from : null,
        post_date_from: ad.post_date_from || null,
        post_date_to: ad.post_date_to || null,
        custom_dates: Array.isArray(ad.custom_dates) ? ad.custom_dates : [],
        post_time: ad.post_time || null,
        scheduled_timezone: APP_TIME_ZONE,
        reminder_minutes: ad.reminder_minutes || 15,
        ad_text: ad.ad_text || null,
        media: Array.isArray(ad.media) ? ad.media : [],
        notes: ad.notes || null,
        price: unitAmount,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .single();
    if (createAdError) throw createAdError;

    let approvedInvoice = null;
    try {
      const invoiceNumber = await nextSequentialInvoiceNumber(
        supabase,
        table("invoices"),
      );
      const invoiceInsertPayload = {
        invoice_number: invoiceNumber,
        advertiser_id: advertiserId || null,
        advertiser_name: advertiserName || ad.advertiser_name || null,
        ad_ids: [newAd.id],
        contact_name: ad.contact_name || null,
        contact_email: ad.email || null,
        bill_to: advertiserName || ad.advertiser_name || null,
        issue_date: getTodayInAppTimeZone(),
        status: "Pending",
        discount: 0,
        tax: 0,
        total: invoiceAmount,
        amount: invoiceAmount,
        amount_paid: 0,
        notes: "Auto-generated on ad approval.",
        created_at: nowIso,
        updated_at: nowIso,
      };

      let createInvoiceResult = await supabase
        .from(table("invoices"))
        .insert(invoiceInsertPayload)
        .select("*")
        .single();

      if (createInvoiceResult.error && isMissingColumnError(createInvoiceResult.error)) {
        createInvoiceResult = await supabase
          .from(table("invoices"))
          .insert({
            invoice_number: invoiceNumber,
            advertiser_id: advertiserId || null,
            advertiser_name: advertiserName || ad.advertiser_name || null,
            ad_ids: [newAd.id],
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
      approvedInvoice = createInvoiceResult.data || null;
      if (!approvedInvoice?.id) {
        throw new Error("Invoice record was not created.");
      }

      let adUpdateResult = await supabase
        .from(table("ads"))
        .update({
          payment: "Pending",
          invoice_id: approvedInvoice.id,
          paid_via_invoice_id: approvedInvoice.id,
          updated_at: nowIso,
        })
        .eq("id", newAd.id)
        .select("*")
        .maybeSingle();

      if (adUpdateResult.error && isMissingColumnError(adUpdateResult.error)) {
        adUpdateResult = await supabase
          .from(table("ads"))
          .update({
            payment: "Pending",
            updated_at: nowIso,
          })
          .eq("id", newAd.id)
          .select("*")
          .maybeSingle();
      }

      if (adUpdateResult.error) {
        throw adUpdateResult.error;
      }
      if (adUpdateResult.data) {
        newAd = adUpdateResult.data;
      }

      try {
        await supabase.from(table("invoice_items")).insert({
          invoice_id: approvedInvoice.id,
          ad_id: newAd.id,
          product_id: resolvedProduct?.id || null,
          description: resolvedProduct?.product_name
            ? `${resolvedProduct.product_name}${ad.ad_name ? ` | Ad: ${ad.ad_name}` : ""}`
            : ad.ad_name || "Ad placement",
          quantity: 1,
          unit_price: invoiceAmount,
          amount: invoiceAmount,
          created_at: nowIso,
        });
      } catch (invoiceItemError) {
        console.error("[approve] Unable to create invoice item:", invoiceItemError);
      }
    } catch (invoiceError) {
      console.error("[approve] Invoice creation failed. Rolling back ad:", invoiceError);
      try {
        await supabase.from(table("ads")).delete().eq("id", newAd.id);
      } catch (rollbackError) {
        console.error("[approve] Rollback failed:", rollbackError);
      }
      throw invoiceError;
    }

    await updateAdvertiserNextAdDate(advertiserName);
    const { error: cleanupError } = await supabase
      .from(table("pending_ads"))
      .delete()
      .eq("id", pending_ad_id);
    if (cleanupError) throw cleanupError;

    const invoiceNumberText =
      String(approvedInvoice?.invoice_number || "").trim() || "Pending assignment";
    const amountDueValue =
      Number(approvedInvoice?.total ?? approvedInvoice?.amount ?? invoiceAmount) || 0;
    const amountDueText = formatCurrency(amountDueValue);
    const zelleNumberText = escapeHtml(APPROVAL_ZELLE_NUMBER || "(555) 010-2026");

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
            ...(adminPrefs || []).map((adminItem) => adminItem.email_address),
            ...(globalPrefs?.[0]?.email_enabled ? [globalPrefs?.[0]?.reminder_email] : []),
          ].filter(Boolean),
        ),
      );

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
      <p>Dear ${escapeHtml(ad.contact_name)},</p>
      <p>Great news. Your advertising submission for <strong>${escapeHtml(ad.ad_name)}</strong> has been approved by our team.</p>
      <p>To activate scheduling, please settle the invoice below:</p>
      <div class="info-block">
        <div class="info-row"><span class="label">Ad Name:</span> ${escapeHtml(ad.ad_name)}</div>
        <div class="info-row"><span class="label">Invoice Number:</span> ${escapeHtml(invoiceNumberText)}</div>
        <div class="info-row"><span class="label">Amount Due:</span> ${escapeHtml(amountDueText)}</div>
        <div class="info-row"><span class="label">Status:</span> ${escapeHtml(adStatus)}</div>
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

      const adminEmailHTML = `
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
        <h2 style="margin-top: 0; color: #065f46;">Ad Approved</h2>
        <p style="margin-bottom: 0;">An ad submission has been approved and invoiced.</p>
      </div>
      <div class="info-block">
        <div class="info-row"><span class="label">Advertiser:</span> ${escapeHtml(ad.advertiser_name)}</div>
        <div class="info-row"><span class="label">Ad Name:</span> ${escapeHtml(ad.ad_name)}</div>
        <div class="info-row"><span class="label">Invoice Number:</span> ${escapeHtml(invoiceNumberText)}</div>
        <div class="info-row"><span class="label">Amount Due:</span> ${escapeHtml(amountDueText)}</div>
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

      if (ad.email) {
        await sendEmail({
          to: ad.email,
          subject: `Ad Approved - Invoice ${invoiceNumberText} (${ad.ad_name})`,
          html: advertiserEmailHTML,
        }).catch((err) => console.error("[approve] Advertiser email failed:", err));
      }

      if (adminEmails.length > 0) {
        await sendEmail({
          to: adminEmails,
          subject: `Ad Approved - ${ad.ad_name} | ${invoiceNumberText}`,
          html: adminEmailHTML,
        }).catch((err) => console.error("[approve] Admin email failed:", err));
      }
    } catch (emailErr) {
      console.error("Error sending approval emails:", emailErr);
    }

    return Response.json({
      success: true,
      ad: newAd,
      advertiser_id: advertiserId,
      invoice: approvedInvoice,
    });
  } catch (error) {
    console.error("Error approving ad:", error);
    return Response.json(
      { error: error?.message || "Failed to approve ad" },
      { status: 500 },
    );
  }
}
