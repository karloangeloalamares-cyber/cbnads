import { db, table, toNumber } from "../../utils/supabase-db.js";
import { requirePermission } from "../../utils/auth-check.js";
import {
  adAmount,
  buildInvoiceLineItemsForAd,
  nextSequentialInvoiceNumber,
  sumInvoiceItemAmounts,
} from "../../utils/invoice-helpers.js";
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

    const invoiceNumber = await nextSequentialInvoiceNumber(
      supabase,
      table("invoices"),
    );

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

    let invoice = null;
    try {
      const createInvoiceResult = await supabase
        .from(table("invoices"))
        .insert({
          invoice_number: invoiceNumber,
          advertiser_id: advertiser?.id || null,
          advertiser_name: targetAdvertiserName,
          ad_ids: uniqueAdIds,
          contact_name: invoiceData.contactName || advertiser?.contact_name || null,
          contact_email: invoiceData.contactEmail || advertiser?.email || null,
          bill_to: invoiceData.billTo || targetAdvertiserName || null,
          issue_date: getTodayInAppTimeZone(),
          status,
          discount,
          tax,
          total,
          amount: total,
          amount_paid: String(status).toLowerCase() === "paid" ? total : 0,
          notes: invoiceData.notes || null,
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

      const invoiceItemsPayload = lineItems.map((item) => ({
        invoice_id: invoice.id,
        ad_id: item.ad_id,
        product_id: item.product_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        created_at: nowIso,
      }));
      if (invoiceItemsPayload.length > 0) {
        const { error: itemError } = await supabase
          .from(table("invoice_items"))
          .insert(invoiceItemsPayload);
        if (itemError) throw itemError;
      }

      const nextPaymentStatus = String(status).toLowerCase() === "paid" ? "Paid" : "Pending";
      const { error: adUpdateError } = await supabase
        .from(table("ads"))
        .update({
          payment: nextPaymentStatus,
          invoice_id: invoice.id,
          paid_via_invoice_id: invoice.id,
          updated_at: nowIso,
        })
        .in("id", uniqueAdIds);
      if (adUpdateError) throw adUpdateError;
    } catch (creationError) {
      if (invoice?.id) {
        await supabase.from(table("invoices")).delete().eq("id", invoice.id);
      }
      throw creationError;
    }

    if (String(status).toLowerCase() === "paid") {
      if (advertiser?.id) {
        await recalculateAdvertiserSpend(advertiser.id);
      }
    }

    return Response.json({
      success: true,
      invoice,
      invoiceNumber,
    });
  } catch (error) {
    console.error("Error creating invoice from ads:", error);
    return Response.json(
      { error: "Failed to create invoice" },
      { status: 500 },
    );
  }
}
