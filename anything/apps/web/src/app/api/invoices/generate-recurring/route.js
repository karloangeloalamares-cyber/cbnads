import { db, table, toNumber } from "@/app/api/utils/supabase-db";
import { adAmount, nextSequentialInvoiceNumber } from "@/app/api/utils/invoice-helpers";

const inRange = (value, from, to) => {
  if (!value) return false;
  return value >= from && value <= to;
};

export async function POST(request) {
  try {
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
      .select("id, ad_name, advertiser, advertiser_id, product_id, payment, price, archived, schedule, post_date, post_date_from")
      .eq("archived", false);
    if (adsError) throw adsError;

    const ads = (allAds || []).filter((ad) => {
      const sameAdvertiser =
        String(ad.advertiser_id || "") === String(advertiser.id) ||
        String(ad.advertiser || "").trim().toLowerCase() ===
          String(advertiser.advertiser_name || "").trim().toLowerCase();
      const onDate =
        inRange(ad.schedule, startDate, endDate) ||
        inRange(ad.post_date, startDate, endDate) ||
        inRange(ad.post_date_from, startDate, endDate);
      return sameAdvertiser && onDate;
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

    return Response.json({
      success: true,
      invoice,
      adsIncluded: ads.length,
    });
  } catch (error) {
    console.error("Error generating recurring invoice:", error);
    return Response.json(
      { error: "Failed to generate recurring invoice" },
      { status: 500 },
    );
  }
}

