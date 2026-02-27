import { db, table, toNumber } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";
import { adAmount, nextSequentialInvoiceNumber } from "../../utils/invoice-helpers.js";
import { recalculateAdvertiserSpend } from "../../utils/recalculate-advertiser-spend.js";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const { adIds, invoiceData = {} } = await request.json();

    if (!Array.isArray(adIds) || adIds.length === 0) {
      return Response.json({ error: "No ads selected" }, { status: 400 });
    }

    const supabase = db();
    const uniqueAdIds = [...new Set(adIds.map(String))];

    const { data: ads, error: adsError } = await supabase
      .from(table("ads"))
      .select("id, ad_name, advertiser, advertiser_id, product_id, payment, price")
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

    let subtotal = 0;
    const lineItems = ads.map((ad) => {
      const product = productsById.get(ad.product_id);
      const amount = adAmount({
        payment: ad.payment,
        price: ad.price,
        product_price: product?.price,
      });
      subtotal += amount;
      return {
        ad_id: ad.id,
        product_id: ad.product_id || null,
        description: ad.ad_name || product?.product_name || "Ad placement",
        quantity: 1,
        unit_price: amount,
        amount,
      };
    });

    const discount = toNumber(invoiceData.discount, 0);
    const tax = toNumber(invoiceData.tax, 0);
    const total = subtotal - discount + tax;
    const status = invoiceData.status || "Pending";
    const nowIso = new Date().toISOString();

    const { data: invoice, error: invoiceError } = await supabase
      .from(table("invoices"))
      .insert({
        invoice_number: invoiceNumber,
        advertiser_id: advertiser?.id || null,
        advertiser_name: targetAdvertiserName,
        contact_name: invoiceData.contactName || advertiser?.contact_name || null,
        contact_email: invoiceData.contactEmail || advertiser?.email || null,
        bill_to: invoiceData.billTo || targetAdvertiserName || null,
        issue_date: invoiceData.issueDate || nowIso.slice(0, 10),
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
    if (invoiceError) throw invoiceError;

    for (const item of lineItems) {
      const { error: itemError } = await supabase.from(table("invoice_items")).insert({
        invoice_id: invoice.id,
        ad_id: item.ad_id,
        product_id: item.product_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        created_at: nowIso,
      });
      if (itemError) throw itemError;
    }

    if (String(status).toLowerCase() === "paid") {
      const { error: adUpdateError } = await supabase
        .from(table("ads"))
        .update({
          payment: "Paid",
          paid_via_invoice_id: invoice.id,
          updated_at: nowIso,
        })
        .in("id", uniqueAdIds);
      if (adUpdateError) throw adUpdateError;

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
