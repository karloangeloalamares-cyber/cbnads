import { db, table, toNumber } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";
import {
  adAmount,
  extractAdScheduleDateKeys,
  formatInvoiceDateLabel,
  sumInvoiceItemAmounts,
} from "../../utils/invoice-helpers.js";
import { createInvoiceAtomic, resolveInvoiceRequestKey } from "../../utils/invoice-atomic.js";
import { recalculateAdvertiserSpend } from "../../utils/recalculate-advertiser-spend.js";
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

    const body = await request.json();
    const { advertiserId, dateFrom, dateTo, status } = body;

    if (!advertiserId || !dateFrom || !dateTo) {
      return Response.json(
        { error: "advertiserId, dateFrom, and dateTo are required" },
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
      const onDate = resolveOccurrenceDateKeys(ad, dateFrom, dateTo).matchingDateKeys.length > 0;
      return sameAdvertiser && unpaid && uninvoiced && onDate;
    });

    if (ads.length === 0) {
      return Response.json(
        { error: "No unpaid ads found for this date range" },
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
        dateFrom,
        dateTo,
      });
      subtotal += sumInvoiceItemAmounts(adLineItems);
      return adLineItems;
    });

    const total = toNumber(subtotal, 0);
    const invoiceStatus = status || "Pending";
    const normalizedStatus = String(invoiceStatus).trim() || "Pending";
    const requestKey = resolveInvoiceRequestKey({
      request,
      bodyKey: body?.idempotency_key,
      scope: "invoice-batch-create",
    });

    const invoiceResult = await createInvoiceAtomic({
      supabase,
      invoice: {
        advertiser_id: advertiser.id,
        advertiser_name: advertiser.advertiser_name,
        ad_ids: ads.map((ad) => ad.id),
        contact_name: advertiser.contact_name || null,
        contact_email: advertiser.email || null,
        issue_date: getTodayInAppTimeZone(),
        status: normalizedStatus,
        total,
        amount: total,
        amount_paid: String(normalizedStatus).toLowerCase() === "paid" ? total : 0,
        notes: `Batch invoice for ${dateFrom} to ${dateTo}`,
        source_request_key: requestKey,
        created_at: nowIso,
        updated_at: nowIso,
      },
      items: lineItems.map((item) => ({
        ad_id: item.ad_id,
        product_id: item.product_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        created_at: nowIso,
      })),
      adIds: ads.map((ad) => ad.id),
      updateAdsPayment: String(normalizedStatus).toLowerCase() === "paid" ? "Paid" : "Pending",
      applyCredits: String(normalizedStatus).toLowerCase() === "pending",
      actorUserId: admin.user.id,
      creditNote: "Prepaid credits applied automatically during batch invoice creation.",
    });
    const invoice = invoiceResult.invoice;

    if (String(normalizedStatus).toLowerCase() === "paid" || invoiceResult.appliedCredits) {
      await recalculateAdvertiserSpend(advertiser.id);
    }

    return Response.json({
      success: true,
      invoice,
      adsIncluded: ads.length,
      credits_applied: invoiceResult.appliedCredits === true,
      credit_notice_type: invoiceResult.appliedCredits ? "covered_by_credits" : "none",
    });
  } catch (error) {
    console.error("Error creating batch invoice:", error);
    return Response.json(
      { error: "Failed to create batch invoice" },
      { status: 500 },
    );
  }
}
