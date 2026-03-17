import { db, table, toNumber } from "../../utils/supabase-db.js";
import { requirePermission } from "../../utils/auth-check.js";
import {
  adAmount,
  buildInvoiceLineItemsForAd,
  sumInvoiceItemAmounts,
} from "../../utils/invoice-helpers.js";
import { createInvoiceAtomic, resolveInvoiceRequestKey } from "../../utils/invoice-atomic.js";
import { recalculateAdvertiserSpend } from "../../utils/recalculate-advertiser-spend.js";
import { getTodayInAppTimeZone } from "../../../../lib/timezone.js";

export async function POST(request) {
  try {
    const auth = await requirePermission("billing:edit", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { adIds, invoiceData = {} } = await request.json();

    if (!Array.isArray(adIds) || adIds.length === 0) {
      return Response.json({ error: "No ads selected" }, { status: 400 });
    }

    const supabase = db();
    const uniqueAdIds = [...new Set(adIds.map(String))];

    const { data: ads, error: adsError } = await supabase
      .from(table("ads"))
      .select(
        "id, ad_name, advertiser, advertiser_id, product_id, product_name, payment, price, post_type, schedule, post_date, post_date_from, post_date_to, custom_dates",
      )
      .in("id", uniqueAdIds);
    if (adsError) throw adsError;

    if (!ads || ads.length === 0) {
      return Response.json({ error: "No valid ads found" }, { status: 404 });
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

    const firstAd = ads[0];
    const targetAdvertiserName =
      invoiceData.advertiserName || firstAd.advertiser || "";

    let advertiser = null;
    if (invoiceData.advertiserId) {
      const { data, error } = await supabase
        .from(table("advertisers"))
        .select("*")
        .eq("id", invoiceData.advertiserId)
        .maybeSingle();
      if (error) throw error;
      advertiser = data;
    } else if (targetAdvertiserName) {
      const { data, error } = await supabase
        .from(table("advertisers"))
        .select("*")
        .ilike("advertiser_name", targetAdvertiserName)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      advertiser = data;
    }

    const nowIso = new Date().toISOString();
    let subtotal = 0;
    const unresolvedAds = [];
    const lineItems = ads.flatMap((ad) => {
      const product = productsById.get(ad.product_id);
      const unitAmount = adAmount({
        payment: ad.payment,
        price: ad.price,
        product_price: product?.price,
      });
      const resolvedProductName =
        String(ad.product_name || product?.product_name || "").trim();
      if (!resolvedProductName || unitAmount <= 0) {
        unresolvedAds.push({
          id: ad.id,
          ad_name: ad.ad_name || "Untitled ad",
        });
        return [];
      }

      const adLineItems = buildInvoiceLineItemsForAd({
        ad,
        unitAmount,
        invoiceId: null,
        productId: ad.product_id || null,
        productName: resolvedProductName,
        createdAt: nowIso,
      });
      subtotal += sumInvoiceItemAmounts(adLineItems);

      return adLineItems.map((item) => ({
        ad_id: item.ad_id,
        product_id: item.product_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
      }));
    });

    if (unresolvedAds.length > 0) {
      return Response.json(
        {
          error:
            "One or more selected ads do not have a resolved product and billable price.",
          unresolved_ads: unresolvedAds,
        },
        { status: 400 },
      );
    }

    const discount = toNumber(invoiceData.discount, 0);
    const tax = toNumber(invoiceData.tax, 0);
    const total = subtotal - discount + tax;
    const status = invoiceData.status || "Pending";
    const normalizedStatus = String(status).trim() || "Pending";
    const requestKey = resolveInvoiceRequestKey({
      request,
      bodyKey: invoiceData.idempotency_key || invoiceData.idempotencyKey,
      scope: "invoice-create-from-ads",
    });

    const invoiceResult = await createInvoiceAtomic({
      supabase,
      invoice: {
        advertiser_id: advertiser?.id || null,
        advertiser_name: targetAdvertiserName,
        ad_ids: uniqueAdIds,
        contact_name: invoiceData.contactName || advertiser?.contact_name || null,
        contact_email: invoiceData.contactEmail || advertiser?.email || null,
        bill_to: invoiceData.billTo || targetAdvertiserName || null,
        issue_date: getTodayInAppTimeZone(),
        status: normalizedStatus,
        discount,
        tax,
        total,
        amount: total,
        amount_paid: String(normalizedStatus).toLowerCase() === "paid" ? total : 0,
        notes: invoiceData.notes || null,
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
      adIds: uniqueAdIds,
      updateAdsPayment: String(normalizedStatus).toLowerCase() === "paid" ? "Paid" : "Pending",
      applyCredits: String(normalizedStatus).toLowerCase() === "pending",
      actorUserId: auth.user.id,
      creditNote: "Prepaid credits applied automatically during invoice creation.",
    });
    const invoice = invoiceResult.invoice;

    if (String(normalizedStatus).toLowerCase() === "paid" || invoiceResult.appliedCredits) {
      if (advertiser?.id) {
        await recalculateAdvertiserSpend(advertiser.id);
      }
    }

    return Response.json({
      success: true,
      invoice,
      invoiceNumber: invoice?.invoice_number || null,
      credits_applied: invoiceResult.appliedCredits === true,
      credit_notice_type: invoiceResult.appliedCredits ? "covered_by_credits" : "none",
    });
  } catch (error) {
    console.error("Error creating invoice from ads:", error);
    return Response.json(
      { error: "Failed to create invoice" },
      { status: 500 },
    );
  }
}
