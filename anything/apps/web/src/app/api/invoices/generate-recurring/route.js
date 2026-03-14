import { db, table, toNumber } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";
import {
  adAmount,
  extractAdScheduleDateKeys,
  formatInvoiceDateLabel,
  nextSequentialInvoiceNumber,
  sumInvoiceItemAmounts,
} from "../../utils/invoice-helpers.js";
import { applyInvoiceCredits } from "../../utils/prepaid-credits.js";
import { getTodayInAppTimeZone } from "../../../../lib/timezone.js";

const inRange = (value, from, to) => {
  if (!value) return false;
  return value >= from && value <= to;
};

const resolveOccurrenceDateKeys = (ad, from, to) => {
  const allDateKeys = extractAdScheduleDateKeys(ad);
  const matchingDateKeys = allDateKeys.filter((value) => inRange(value, from, to));

  if (matchingDateKeys.length > 0) {
    return { allDateKeys, matchingDateKeys };
  }

  const fallbackDateKey = String(
    ad?.schedule || ad?.post_date || ad?.post_date_from || "",
  ).slice(0, 10);
  if (fallbackDateKey && inRange(fallbackDateKey, from, to)) {
    return {
      allDateKeys: allDateKeys.length > 0 ? allDateKeys : [fallbackDateKey],
      matchingDateKeys: [fallbackDateKey],
    };
  }

  return { allDateKeys, matchingDateKeys: [] };
};

const buildRangeInvoiceItemsForAd = ({
  ad,
  unitAmount,
  productName,
  createdAt,
  dateFrom,
  dateTo,
} = {}) => {
  const { allDateKeys, matchingDateKeys } = resolveOccurrenceDateKeys(ad, dateFrom, dateTo);
  if (matchingDateKeys.length === 0) {
    return [];
  }

  const resolvedProductName = String(productName || ad?.product_name || "").trim();
  const baseDescription = resolvedProductName
    ? `${resolvedProductName}${ad?.ad_name ? ` | Ad: ${ad.ad_name}` : ""}`
    : ad?.ad_name || "Ad placement";
  const includeDateLabel = allDateKeys.length > 1 || matchingDateKeys.length > 1;

  return matchingDateKeys.map((dateKey) => ({
    invoice_id: null,
    ad_id: ad?.id || null,
    product_id: ad?.product_id || null,
    description:
      includeDateLabel && dateKey
        ? `${baseDescription} - ${formatInvoiceDateLabel(dateKey)}`
        : baseDescription,
    quantity: 1,
    unit_price: unitAmount,
    amount: unitAmount,
    created_at: createdAt,
  }));
};

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: admin.status || 401 });
    }

    const { advertiserId, period, startDate, endDate } = await request.json();

    if (!["weekly", "monthly", "quarterly"].includes(period)) {
      return Response.json(
        { error: "Invalid period. Must be weekly, monthly, or quarterly" },
        { status: 400 },
      );
    }

    if (!advertiserId || !startDate || !endDate) {
      return Response.json(
        { error: "advertiserId, startDate, and endDate are required" },
        { status: 400 },
      );
    }

    const supabase = db();

    const { data: advertiser, error: advertiserError } = await supabase
      .from(table("advertisers"))
      .select("*")
      .eq("id", advertiserId)
      .maybeSingle();
    if (advertiserError) throw advertiserError;
    if (!advertiser) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    const { data: allAds, error: adsError } = await supabase
      .from(table("ads"))
      .select(
        "id, ad_name, advertiser, advertiser_id, product_id, product_name, payment, price, paid_via_invoice_id, archived, schedule, post_date, post_date_from, post_date_to, post_type, custom_dates",
      )
      .eq("archived", false);
    if (adsError) throw adsError;

    const ads = (allAds || []).filter((ad) => {
      const sameAdvertiser =
        String(ad.advertiser_id || "") === String(advertiser.id) ||
        String(ad.advertiser || "").trim().toLowerCase() ===
          String(advertiser.advertiser_name || "").trim().toLowerCase();
      const unpaid = String(ad.payment || "").toLowerCase() !== "paid";
      const uninvoiced = !ad.paid_via_invoice_id;
      const onDate = resolveOccurrenceDateKeys(ad, startDate, endDate).matchingDateKeys.length > 0;
      return sameAdvertiser && unpaid && uninvoiced && onDate;
    });

    if (ads.length === 0) {
      return Response.json(
        { error: "No ads found for this date range" },
        { status: 404 },
      );
    }

    const productIds = [...new Set(ads.map((ad) => ad.product_id).filter(Boolean))];
    const productsById = new Map();
    if (productIds.length > 0) {
      const { data: products, error: productsError } = await supabase
        .from(table("products"))
        .select("id, product_name, price")
        .in("id", productIds);
      if (productsError) throw productsError;
      for (const product of products || []) {
        productsById.set(product.id, product);
      }
    }

    const invoiceNumber = await nextSequentialInvoiceNumber(
      supabase,
      table("invoices"),
    );

    const nowIso = new Date().toISOString();
    let subtotal = 0;
    const lineItems = ads.flatMap((ad) => {
      const product = productsById.get(ad.product_id);
      const unitAmount = adAmount({
        payment: ad.payment,
        price: ad.price,
        product_price: product?.price,
      });
      const adLineItems = buildRangeInvoiceItemsForAd({
        ad,
        unitAmount,
        productName: ad.product_name || product?.product_name || "",
        createdAt: nowIso,
        dateFrom: startDate,
        dateTo: endDate,
      });
      subtotal += sumInvoiceItemAmounts(adLineItems);
      return adLineItems;
    });

    const total = toNumber(subtotal, 0);

    let invoice = null;
    let creditApplication = null;
    try {
      const createInvoiceResult = await supabase
        .from(table("invoices"))
        .insert({
          invoice_number: invoiceNumber,
          advertiser_id: advertiser.id,
          advertiser_name: advertiser.advertiser_name,
          ad_ids: ads.map((ad) => ad.id),
          contact_name: advertiser.contact_name || null,
          contact_email: advertiser.email || null,
          issue_date: getTodayInAppTimeZone(),
          status: "Pending",
          total,
          amount: total,
          amount_paid: 0,
          is_recurring: true,
          recurring_period: period,
          last_generated_at: nowIso,
          notes: `Recurring ${period} invoice for ${startDate} to ${endDate}`,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("*")
        .single();
      if (createInvoiceResult.error) throw createInvoiceResult.error;
      invoice = createInvoiceResult.data || null;
      if (!invoice?.id) {
        throw new Error("Invoice record was not created.");
      }

      if (lineItems.length > 0) {
        const { error: itemError } = await supabase
          .from(table("invoice_items"))
          .insert(
            lineItems.map((item) => ({
              invoice_id: invoice.id,
              ad_id: item.ad_id,
              product_id: item.product_id,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              amount: item.amount,
              created_at: nowIso,
            })),
          );
        if (itemError) throw itemError;
      }

      const { error: updateAdsError } = await supabase
        .from(table("ads"))
        .update({
          payment: "Pending",
          invoice_id: invoice.id,
          paid_via_invoice_id: invoice.id,
          updated_at: nowIso,
        })
        .in("id", ads.map((ad) => ad.id));
      if (updateAdsError) throw updateAdsError;

      creditApplication = await applyInvoiceCredits({
        supabase,
        invoiceId: invoice.id,
        actorUserId: admin.user.id,
        note: "Prepaid credits applied automatically during recurring invoice generation.",
      });
      if (creditApplication?.invoice) {
        invoice = creditApplication.invoice;
      }
    } catch (creationError) {
      if (invoice?.id) {
        await supabase.from(table("invoices")).delete().eq("id", invoice.id);
      }
      throw creationError;
    }

    return Response.json({
      success: true,
      invoice,
      adsIncluded: ads.length,
      credits_applied: creditApplication?.applied === true,
      credit_notice_type: creditApplication?.notice_type || "none",
    });
  } catch (error) {
    console.error("Error generating recurring invoice:", error);
    return Response.json(
      { error: "Failed to generate recurring invoice" },
      { status: 500 },
    );
  }
}
