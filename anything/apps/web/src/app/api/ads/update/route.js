import { dateOnly, db, normalizePostType, table } from "../../utils/supabase-db.js";
import { requirePermission } from "../../utils/auth-check.js";
import { updateAdvertiserNextAdDate } from "../../utils/update-advertiser-next-ad.js";
import { APP_TIME_ZONE } from "../../../../lib/timezone.js";
import {
  checkBatchAvailability,
  checkSingleDateAvailability,
  expandDateRange,
} from "../../utils/ad-availability.js";

const recalcInvoiceStatus = async (supabase, invoiceId) => {
  if (!invoiceId) return;

  const { data: invoice, error: invoiceError } = await supabase
    .from(table("invoices"))
    .select("id, total, deleted_at")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceError) throw invoiceError;
  if (!invoice || invoice.deleted_at) return;

  const { data: items, error: itemsError } = await supabase
    .from(table("invoice_items"))
    .select("ad_id, unit_price, amount")
    .eq("invoice_id", invoiceId)
    .not("ad_id", "is", null);
  if (itemsError) throw itemsError;

  if (!items || items.length === 0) {
    const { error: resetInvoiceError } = await supabase
      .from(table("invoices"))
      .update({ amount_paid: 0, status: "Pending", updated_at: new Date().toISOString() })
      .eq("id", invoiceId);
    if (resetInvoiceError) throw resetInvoiceError;
    return;
  }

  const adIds = items.map((item) => item.ad_id).filter(Boolean);
  const { data: ads, error: adsError } = await supabase
    .from(table("ads"))
    .select("id, payment")
    .in("id", adIds);
  if (adsError) throw adsError;

  const paidSet = new Set(
    (ads || [])
      .filter((ad) => String(ad.payment || "").toLowerCase() === "paid")
      .map((ad) => ad.id),
  );

  let paidAmount = 0;
  let paidCount = 0;
  for (const item of items) {
    if (paidSet.has(item.ad_id)) {
      paidCount += 1;
      paidAmount += Number(item.amount ?? item.unit_price ?? 0) || 0;
    }
  }

  let nextStatus = "Pending";
  if (paidCount === items.length) {
    nextStatus = "Paid";
  } else if (paidCount > 0) {
    nextStatus = "Partial";
  }

  const { error: statusUpdateError } = await supabase
    .from(table("invoices"))
    .update({
      amount_paid: paidAmount,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);
  if (statusUpdateError) throw statusUpdateError;
};

export async function PUT(request) {
  try {
    const auth = await requirePermission("ads:edit", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const supabase = db();
    const body = await request.json();

    const {
      id,
      ad_name,
      advertiser,
      advertiser_id,
      status,
      post_type,
      placement,
      schedule,
      payment,
      product_id,
      post_date_from,
      post_date_to,
      custom_dates,
      media,
      ad_text,
      post_time,
      reminder_minutes,
    } = body;

    if (!id) {
      return Response.json({ error: "Ad ID is required" }, { status: 400 });
    }

    const { data: oldAd, error: oldAdError } = await supabase
      .from(table("ads"))
      .select("advertiser, advertiser_id, status, payment, paid_via_invoice_id, product_id, post_type, schedule, post_date, post_date_from, post_date_to, custom_dates, post_time")
      .eq("id", id)
      .maybeSingle();
    if (oldAdError) throw oldAdError;
    if (!oldAd) {
      return Response.json({ error: "Ad not found" }, { status: 404 });
    }

    const timeFieldsUpdated =
      post_time !== undefined ||
      schedule !== undefined ||
      post_date_from !== undefined ||
      post_date_to !== undefined ||
      custom_dates !== undefined ||
      post_type !== undefined;

    if (timeFieldsUpdated) {
      const nextPostType = post_type !== undefined ? post_type : oldAd.post_type;
      const nextDate =
        dateOnly(schedule !== undefined ? schedule : oldAd.schedule) ||
        dateOnly(post_date_from !== undefined ? post_date_from : oldAd.post_date_from) ||
        dateOnly(oldAd.post_date);
      const nextDateFrom = dateOnly(
        post_date_from !== undefined ? post_date_from : oldAd.post_date_from,
      );
      const nextDateTo = dateOnly(post_date_to !== undefined ? post_date_to : oldAd.post_date_to);
      const nextCustomDates = Array.isArray(custom_dates)
        ? custom_dates
        : Array.isArray(oldAd.custom_dates)
          ? oldAd.custom_dates
          : [];
      const nextPostTime = post_time !== undefined ? post_time : oldAd.post_time;

      const normalizedNextPostType = normalizePostType(nextPostType);

      if (normalizedNextPostType === "one_time" && nextDate) {
        const availability = await checkSingleDateAvailability({
          supabase,
          date: nextDate,
          postType: nextPostType,
          postTime: nextPostTime,
          excludeId: id,
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

      if (normalizedNextPostType === "daily_run" && nextDateFrom && nextDateTo) {
        const availability = await checkBatchAvailability({
          supabase,
          dates: expandDateRange(nextDateFrom, nextDateTo),
          excludeId: id,
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

      if (normalizedNextPostType === "custom_schedule" && nextCustomDates.length > 0) {
        const availability = await checkBatchAvailability({
          supabase,
          dates: nextCustomDates.map((entry) =>
            entry && typeof entry === "object" ? entry.date : entry,
          ),
          excludeId: id,
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
    }

    if (timeFieldsUpdated) {
      const { error: reminderDeleteError } = await supabase
        .from(table("sent_reminders"))
        .delete()
        .eq("ad_id", id);
      if (reminderDeleteError) throw reminderDeleteError;
    }

    const patch = {
      updated_at: new Date().toISOString(),
    };

    if (ad_name !== undefined) patch.ad_name = ad_name;
    if (advertiser !== undefined) patch.advertiser = advertiser;
    if (advertiser_id !== undefined) patch.advertiser_id = advertiser_id || null;
    if (status !== undefined) {
      patch.status = status;
      if (String(status) === "Published" && oldAd.status !== "Published") {
        patch.published_at = new Date().toISOString();
      }
    }
    if (post_type !== undefined) patch.post_type = post_type;
    if (placement !== undefined) patch.placement = placement;
    if (schedule !== undefined) patch.schedule = schedule || null;
    if (payment !== undefined) patch.payment = payment;
    if (product_id !== undefined) {
      const productChanged = String(product_id || "") !== String(oldAd.product_id || "");
      if (productChanged && oldAd.paid_via_invoice_id) {
        return Response.json(
          {
            error:
              "This ad is already linked to an invoice. Remove or reissue the invoice before changing the product.",
          },
          { status: 400 },
        );
      }

      patch.product_id = product_id || null;
      if (product_id) {
        const { data: productRow, error: productError } = await supabase
          .from(table("products"))
          .select("id, product_name, price")
          .eq("id", product_id)
          .maybeSingle();
        if (productError) throw productError;
        if (!productRow) {
          return Response.json({ error: "Selected product was not found" }, { status: 400 });
        }
        patch.product_name = productRow.product_name || null;
        patch.price = productRow.price || 0;
      } else {
        patch.product_name = null;
        patch.price = 0;
      }
    }
    if (post_date_from !== undefined) patch.post_date_from = post_date_from || null;
    if (post_date_to !== undefined) patch.post_date_to = post_date_to || null;
    if (custom_dates !== undefined) {
      patch.custom_dates = Array.isArray(custom_dates) ? custom_dates : [];
    }
    if (media !== undefined) patch.media = Array.isArray(media) ? media : [];
    if (ad_text !== undefined) patch.ad_text = ad_text || null;
    if (post_time !== undefined) patch.post_time = post_time || null;
    if (reminder_minutes !== undefined) patch.reminder_minutes = reminder_minutes;
    if (timeFieldsUpdated) patch.scheduled_timezone = APP_TIME_ZONE;

    if (Object.keys(patch).length <= 1) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: updatedAd, error: updateError } = await supabase
      .from(table("ads"))
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    let linkedInvoiceId = oldAd.paid_via_invoice_id;
    const { data: linkedItem, error: linkedItemError } = await supabase
      .from(table("invoice_items"))
      .select("invoice_id")
      .eq("ad_id", id)
      .limit(1)
      .maybeSingle();
    if (linkedItemError) throw linkedItemError;
    if (linkedItem?.invoice_id) {
      linkedInvoiceId = linkedItem.invoice_id;
    }

    if (payment !== undefined) {
      if (String(payment).toLowerCase() === "paid") {
        const { error: markPaidError } = await supabase
          .from(table("ads"))
          .update({ paid_via_invoice_id: linkedInvoiceId || null })
          .eq("id", id);
        if (markPaidError) throw markPaidError;
      } else if (oldAd.payment && String(oldAd.payment).toLowerCase() === "paid") {
        const { error: clearPaidError } = await supabase
          .from(table("ads"))
          .update({ paid_via_invoice_id: null })
          .eq("id", id);
        if (clearPaidError) throw clearPaidError;
      }

      if (linkedInvoiceId) {
        await recalcInvoiceStatus(supabase, linkedInvoiceId);
      }
    }

    const oldAdvertiser = oldAd.advertiser;
    const newAdvertiser = advertiser !== undefined ? advertiser : oldAdvertiser;
    if (oldAdvertiser) await updateAdvertiserNextAdDate(oldAdvertiser);
    if (newAdvertiser && newAdvertiser !== oldAdvertiser) {
      await updateAdvertiserNextAdDate(newAdvertiser);
    }

    return Response.json({ ad: updatedAd });
  } catch (error) {
    console.error("[Update Ad] Error:", error);
    return Response.json(
      {
        error: "Failed to update ad",
      },
      { status: 500 },
    );
  }
}
