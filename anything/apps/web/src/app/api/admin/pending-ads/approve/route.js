import { db, normalizePostType, table } from "../../../utils/supabase-db.js";
import { requireAdmin } from "../../../utils/auth-check.js";
import { updateAdvertiserNextAdDate } from "../../../utils/update-advertiser-next-ad.js";
import { APP_TIME_ZONE, getTodayInAppTimeZone } from "../../../../../lib/timezone.js";
import {
  checkBatchAvailability,
  checkSingleDateAvailability,
  expandDateRange,
} from "../../../utils/ad-availability.js";
import { sendEmail } from "../../../utils/send-email.js";
import {
  adAmount,
  buildInvoiceLineItemsForAd,
  extractAdScheduleDateKeys,
  sumInvoiceItemAmounts,
} from "../../../utils/invoice-helpers.js";
import { sendInvoiceCoveredByCreditsNotice } from "../../../utils/prepaid-credits.js";
import { buildAdvertiserDashboardSignInUrl } from "../../../utils/advertiser-dashboard-url.js";
import { notifyInternalChannels } from "../../../utils/internal-notification-channels.js";
import { ensureAdvertiserRecord } from "../../../utils/advertiser-auth.js";
import { getSlotCapacityErrorPayload } from "../../../utils/slot-capacity-error.js";
import { createInvoiceAtomic } from "../../../utils/invoice-atomic.js";
import {
  convertPendingToAdAtomic,
  isPendingNotFoundError,
  isPendingSubmissionAlreadyProcessedError,
} from "../../../utils/pending-conversion-atomic.js";

const APPROVAL_ZELLE_NUMBER = String(
  process.env.APPROVAL_ZELLE_NUMBER || "(555) 010-2026",
).trim();

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value) || 0);

const normalizeDateOnly = (value) => String(value || "").trim().slice(0, 10);

const normalizeCustomDateTime = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) return text;
  if (/^\d{2}:\d{2}$/.test(text)) return `${text}:00`;
  const parsed = new Date(`1970-01-01T${text}`);
  if (Number.isNaN(parsed.valueOf())) return "";
  return parsed.toISOString().slice(11, 19);
};

const normalizeCustomDateEntries = (entries, { fallbackTime = "" } = {}) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const date = normalizeDateOnly(entry.date);
        if (!date) return null;
        const time = normalizeCustomDateTime(entry.time || entry.post_time || fallbackTime);
        return {
          ...entry,
          date,
          ...(time ? { time } : {}),
          reminder: String(entry.reminder || "").trim() || "15-min",
        };
      }

      const date = normalizeDateOnly(entry);
      if (!date) return null;
      const time = normalizeCustomDateTime(fallbackTime);
      return {
        date,
        ...(time ? { time } : {}),
        reminder: "15-min",
      };
    })
    .filter(Boolean);

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

  const invoiceMultiplier = Math.max(1, extractAdScheduleDateKeys(pendingAd).length);

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
      return Response.json({ error: admin.error }, { status: admin.status || 401 });
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
      const { data: existingAd, error: existingAdError } = await supabase
        .from(table("ads"))
        .select("id, invoice_id, paid_via_invoice_id, created_at")
        .eq("source_pending_ad_id", pending_ad_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingAdError) throw existingAdError;

      if (existingAd?.id) {
        return Response.json(
          {
            error: "This pending submission has already been approved by another request.",
            ad_id: existingAd.id,
            invoice_id: existingAd.invoice_id || existingAd.paid_via_invoice_id || null,
          },
          { status: 409 },
        );
      }

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
      const ensuredAdvertiser = await ensureAdvertiserRecord({
        advertiserName: ad.advertiser_name,
        contactName: ad.contact_name,
        email: ad.email,
        phoneNumber: ad.phone_number || ad.phone || null,
      });
      advertiserId = ensuredAdvertiser.id;
      advertiserName = ensuredAdvertiser.advertiser_name;
    }

    const advertiserInactive =
      use_existing_advertiser &&
      existing_advertiser_id &&
      existingAdvertiserInactive;

    const adStatus = advertiserInactive ? "Draft" : "Scheduled";
    const nowIso = new Date().toISOString();
    const normalizedPostType = normalizePostType(ad.post_type);
    if (!["one_time", "daily_run", "custom_schedule"].includes(normalizedPostType)) {
      return Response.json({ error: "Unsupported post type on pending submission." }, { status: 400 });
    }
    const normalizedCustomDates =
      normalizedPostType === "custom_schedule"
        ? normalizeCustomDateEntries(ad.custom_dates, { fallbackTime: ad.post_time })
        : [];
    const scheduleDateKeys = extractAdScheduleDateKeys(ad);
    const primaryScheduleDate =
      scheduleDateKeys[0] ||
      String(ad.post_date_from || ad.post_date || "").slice(0, 10) ||
      null;

    if (normalizedPostType === "one_time" && primaryScheduleDate) {
      const availability = await checkSingleDateAvailability({
        supabase,
        date: primaryScheduleDate,
        postType: normalizedPostType,
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

    if (normalizedPostType === "daily_run" && ad.post_date_from && ad.post_date_to) {
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
      normalizedPostType === "custom_schedule" &&
      normalizedCustomDates.length > 0
    ) {
      const availability = await checkBatchAvailability({
        supabase,
        dates: normalizedCustomDates.map((entry) => entry.date),
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

    const adInsertPayload = {
      ad_name: ad.ad_name,
      advertiser: advertiserName,
      advertiser_id: advertiserId,
      source_pending_ad_id: pending_ad_id,
      product_id: resolvedProduct?.id || ad.product_id || null,
      product_name: resolvedProduct?.product_name || ad.product_name || null,
      status: adStatus,
      post_type: normalizedPostType,
      placement: ad.placement || "Standard",
      payment: "Pending",
      schedule: normalizedPostType === "one_time" ? primaryScheduleDate : null,
      post_date: normalizedPostType === "one_time" ? primaryScheduleDate : null,
      post_date_from:
        normalizedPostType === "custom_schedule"
          ? null
          : normalizedPostType === "daily_run"
            ? ad.post_date_from || primaryScheduleDate
            : primaryScheduleDate,
      post_date_to: normalizedPostType === "daily_run" ? ad.post_date_to || null : null,
      custom_dates: normalizedCustomDates,
      post_time: ad.post_time || null,
      scheduled_timezone: APP_TIME_ZONE,
      reminder_minutes: ad.reminder_minutes || 15,
      ad_text: ad.ad_text || null,
      media: Array.isArray(ad.media) ? ad.media : [],
      notes: ad.notes || null,
      price: unitAmount,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const conversion = await convertPendingToAdAtomic({
      supabase,
      pendingAdId: pending_ad_id,
      adPayload: adInsertPayload,
      deletePending: false,
    });
    let newAd = conversion.ad;
    const adCreated = conversion.created === true;

    let approvedInvoice = null;
    let approvedInvoiceAmount = invoiceAmount;
    let creditApplication = null;
    let invoiceCreated = false;
    try {
      const approvedInvoiceItems = buildInvoiceLineItemsForAd({
        ad: newAd,
        unitAmount,
        invoiceId: null,
        productId: resolvedProduct?.id || newAd?.product_id || null,
        productName: resolvedProduct?.product_name || newAd?.product_name || null,
        createdAt: nowIso,
      });
      const derivedInvoiceAmount = sumInvoiceItemAmounts(approvedInvoiceItems);
      const invoiceTotalAmount = Math.max(0, derivedInvoiceAmount || invoiceAmount);
      approvedInvoiceAmount = invoiceTotalAmount;
      const invoiceResult = await createInvoiceAtomic({
        supabase,
        invoice: {
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
          total: invoiceTotalAmount,
          amount: invoiceTotalAmount,
          amount_paid: 0,
          notes: "Auto-generated on ad approval.",
          source_request_key: `pending-approve:${pending_ad_id}`,
          created_at: nowIso,
          updated_at: nowIso,
        },
        items: approvedInvoiceItems.map((item) => ({
          ad_id: item.ad_id,
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: item.amount,
          created_at: item.created_at || nowIso,
        })),
        adIds: [newAd.id],
        updateAdsPayment: "Pending",
        applyCredits: true,
        actorUserId: admin.user.id,
        creditNote: "Prepaid credits applied automatically during pending ad approval.",
      });
      approvedInvoice = invoiceResult.invoice;
      invoiceCreated = invoiceResult.created === true;
      if (!approvedInvoice?.id) {
        throw new Error("Invoice record was not created.");
      }

      const { data: updatedAd, error: updatedAdError } = await supabase
        .from(table("ads"))
        .select("*")
        .eq("id", newAd.id)
        .maybeSingle();
      if (updatedAdError) {
        throw updatedAdError;
      }
      if (updatedAd) {
        newAd = updatedAd;
      }

      creditApplication = {
        applied: invoiceResult.appliedCredits === true,
        notice_type: invoiceResult.appliedCredits ? "covered_by_credits" : "none",
        reason: invoiceResult.creditReason || null,
      };
    } catch (invoiceError) {
      console.error("[approve] Invoice creation failed. Rolling back ad:", invoiceError);
      if (approvedInvoice?.id && invoiceCreated) {
        try {
          await supabase.from(table("invoices")).delete().eq("id", approvedInvoice.id);
        } catch (invoiceRollbackError) {
          console.error("[approve] Invoice rollback failed:", invoiceRollbackError);
        }
      }
      try {
        if (adCreated) {
          await supabase.from(table("ads")).delete().eq("id", newAd.id);
        }
      } catch (rollbackError) {
        console.error("[approve] Rollback failed:", rollbackError);
      }
      throw invoiceError;
    }

    await updateAdvertiserNextAdDate(advertiserName);
    const { data: cleanedPending, error: cleanupError } = await supabase
      .from(table("pending_ads"))
      .delete()
      .eq("id", pending_ad_id)
      .select("id")
      .maybeSingle();
    if (cleanupError) throw cleanupError;
    const shouldSendNotifications = Boolean(cleanedPending?.id);

    const invoiceNumberText =
      String(approvedInvoice?.invoice_number || "").trim() || "Pending assignment";
    const recordedInvoiceAmount =
      Number(approvedInvoice?.total ?? approvedInvoice?.amount ?? 0) || 0;
    const derivedInvoiceAmount = Number(approvedInvoiceAmount) || 0;
    const amountDueValue = Math.max(recordedInvoiceAmount, derivedInvoiceAmount);
    const amountDueText = formatCurrency(amountDueValue);
    const zelleNumberText = escapeHtml(APPROVAL_ZELLE_NUMBER || "(555) 010-2026");
    const dashboardSignInUrl = buildAdvertiserDashboardSignInUrl({
      request,
      email: ad.email,
      section: "Ads",
    });

    try {
      if (creditApplication?.applied) {
        if (shouldSendNotifications) {
          try {
            await sendInvoiceCoveredByCreditsNotice({
              request,
              supabase,
              invoice: approvedInvoice,
            });
          } catch (noticeError) {
            console.error("[approve] Failed to send covered-by-credits notice:", noticeError);
          }
        }

        return Response.json({
          success: true,
          ad: newAd,
          advertiser_id: advertiserId,
          invoice: approvedInvoice,
          credits_applied: true,
          credit_notice_type: creditApplication.notice_type,
          notifications_sent: shouldSendNotifications,
        });
      }

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
    .dashboard-block { background: #eff6ff; border: 1px solid #bfdbfe; padding: 18px; margin: 20px 0; border-radius: 6px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .button { display: inline-block; background: #111827; color: #ffffff !important; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600; }
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
      <h2>Your Ad Is Ready for Payment</h2>
      <p>Dear ${escapeHtml(ad.contact_name)},</p>
      <p>Great news. Your advertising submission for <strong>${escapeHtml(ad.ad_name)}</strong> has been approved and invoiced by our team.</p>
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
      <div class="dashboard-block">
        <p style="margin-top: 0;">You can sign in to your advertiser dashboard anytime to monitor this ad, its schedule, and billing.</p>
        <p style="margin: 16px 0 0;">
          <a href="${dashboardSignInUrl}" class="button">Open advertiser dashboard</a>
        </p>
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
        <h2 style="margin-top: 0; color: #065f46;">Approved + Invoice Attached (Ready for Payment)</h2>
        <p style="margin-bottom: 0;">An ad submission has been approved, invoiced, and is now ready for advertiser payment.</p>
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

      if (shouldSendNotifications) {
        if (ad.email) {
          await sendEmail({
            to: ad.email,
            subject: `Ready for Payment - Invoice ${invoiceNumberText} (${ad.ad_name})`,
            html: advertiserEmailHTML,
          }).catch((err) => console.error("[approve] Advertiser email failed:", err));
        }

        const internalTelegramText = [
          "<b>Approved + Invoice Attached (Ready for Payment)</b>",
          "",
          `<b>Advertiser:</b> ${escapeHtml(ad.advertiser_name || advertiserName || "N/A")}`,
          `<b>Ad:</b> ${escapeHtml(ad.ad_name || "N/A")}`,
          `<b>Invoice:</b> ${escapeHtml(invoiceNumberText)}`,
          `<b>Amount Due:</b> ${escapeHtml(amountDueText)}`,
          `<b>Status:</b> ${escapeHtml(adStatus)}`,
        ].join("\n");

        const internalNotification = await notifyInternalChannels({
          supabase,
          emailSubject: `Ready for Payment - ${ad.ad_name} | ${invoiceNumberText}`,
          emailHtml: adminEmailHTML,
          telegramText: internalTelegramText,
        });
        if (!internalNotification.email_sent && !internalNotification.telegram_sent) {
          console.warn("[approve] Internal notifications were not sent:", internalNotification);
        }
      }
    } catch (emailErr) {
      console.error("Error sending approval emails:", emailErr);
    }

    return Response.json({
      success: true,
      ad: newAd,
      advertiser_id: advertiserId,
      invoice: approvedInvoice,
      credits_applied: creditApplication?.applied === true,
      credit_notice_type: creditApplication?.notice_type || "none",
      notifications_sent: shouldSendNotifications,
    });
  } catch (error) {
    if (isPendingNotFoundError(error)) {
      return Response.json({ error: "Pending ad not found" }, { status: 404 });
    }

    if (isPendingSubmissionAlreadyProcessedError(error)) {
      return Response.json(
        { error: "This pending submission has already been approved by another request." },
        { status: 409 },
      );
    }

    const slotError = getSlotCapacityErrorPayload(error);
    if (slotError) {
      return Response.json(slotError.body, { status: slotError.status });
    }

    console.error("Error approving ad:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
