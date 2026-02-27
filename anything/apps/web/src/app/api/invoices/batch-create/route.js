import { db, table, toNumber } from "@/app/api/utils/supabase-db";
import { requireAdmin } from "@/app/api/utils/auth-check";
import { adAmount, nextSequentialInvoiceNumber } from "@/app/api/utils/invoice-helpers";
import { recalculateAdvertiserSpend } from "@/app/api/utils/recalculate-advertiser-spend";

const inRange = (value, from, to) => {
  if (!value) return false;
  return value >= from && value <= to;
};

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const { advertiserId, dateFrom, dateTo, status } = await request.json();

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
      .select("id, ad_name, advertiser, advertiser_id, product_id, payment, paid_via_invoice_id, archived, schedule, post_date, post_date_from")
      .eq("archived", false);
    if (adsError) throw adsError;

    const ads = (allAds || []).filter((ad) => {
      const sameAdvertiser =
        String(ad.advertiser_id || "") === String(advertiser.id) ||
        String(ad.advertiser || "").trim().toLowerCase() ===
          String(advertiser.advertiser_name || "").trim().toLowerCase();
      const unpaid = String(ad.payment || "").toLowerCase() !== "paid";
      const uninvoiced = !ad.paid_via_invoice_id;
      const onDate =
        inRange(ad.schedule, dateFrom, dateTo) ||
        inRange(ad.post_date, dateFrom, dateTo) ||
        inRange(ad.post_date_from, dateFrom, dateTo);
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

    const total = toNumber(subtotal, 0);
    const invoiceStatus = status || "Pending";
    const nowIso = new Date().toISOString();

    const { data: invoice, error: invoiceError } = await supabase
      .from(table("invoices"))
      .insert({
        invoice_number: invoiceNumber,
        advertiser_id: advertiser.id,
        advertiser_name: advertiser.advertiser_name,
        contact_name: advertiser.contact_name || null,
        contact_email: advertiser.email || null,
        issue_date: nowIso.slice(0, 10),
        status: invoiceStatus,
        total,
        amount: total,
        amount_paid: String(invoiceStatus).toLowerCase() === "paid" ? total : 0,
        notes: `Batch invoice for ${dateFrom} to ${dateTo}`,
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

    if (String(invoiceStatus).toLowerCase() === "paid") {
      const adIds = ads.map((ad) => ad.id);
      const { error: updateAdsError } = await supabase
        .from(table("ads"))
        .update({
          payment: "Paid",
          paid_via_invoice_id: invoice.id,
          updated_at: nowIso,
        })
        .in("id", adIds);
      if (updateAdsError) throw updateAdsError;

      await recalculateAdvertiserSpend(advertiser.id);
    }

    return Response.json({
      success: true,
      invoice,
      adsIncluded: ads.length,
    });
  } catch (error) {
    console.error("Error creating batch invoice:", error);
    return Response.json(
      { error: "Failed to create batch invoice" },
      { status: 500 },
    );
  }
}
