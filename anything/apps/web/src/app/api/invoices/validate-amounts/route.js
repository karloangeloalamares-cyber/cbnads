import { db, table, toNumber } from "@/app/api/utils/supabase-db";
import { parsePaymentAmount } from "@/app/api/utils/invoice-helpers";

export async function GET() {
  try {
    const supabase = db();

    const { data: invoices, error: invoicesError } = await supabase
      .from(table("invoices"))
      .select("id, invoice_number, advertiser_name, total, amount, status")
      .is("deleted_at", null);
    if (invoicesError) throw invoicesError;

    const invoiceIds = (invoices || []).map((invoice) => invoice.id);
    let invoiceItems = [];
    if (invoiceIds.length > 0) {
      const { data, error } = await supabase
        .from(table("invoice_items"))
        .select("invoice_id, ad_id")
        .in("invoice_id", invoiceIds);
      if (error) throw error;
      invoiceItems = data || [];
    }

    const adIds = [...new Set(invoiceItems.map((item) => item.ad_id).filter(Boolean))];
    let ads = [];
    if (adIds.length > 0) {
      const { data, error } = await supabase
        .from(table("ads"))
        .select("id, payment")
        .in("id", adIds);
      if (error) throw error;
      ads = data || [];
    }
    const adsById = new Map((ads || []).map((ad) => [ad.id, ad]));

    const adTotalsByInvoice = new Map();
    for (const item of invoiceItems) {
      const ad = adsById.get(item.ad_id);
      const amount = parsePaymentAmount(ad?.payment);
      adTotalsByInvoice.set(
        item.invoice_id,
        toNumber(adTotalsByInvoice.get(item.invoice_id), 0) + amount,
      );
    }

    const discrepancies = (invoices || [])
      .map((invoice) => {
        const invoiceTotal = toNumber(invoice.total ?? invoice.amount, 0);
        const adsTotal = toNumber(adTotalsByInvoice.get(invoice.id), 0);
        const difference = invoiceTotal - adsTotal;
        const adCount = invoiceItems.filter((item) => item.invoice_id === invoice.id).length;
        return {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          advertiser_name: invoice.advertiser_name,
          invoice_total: invoiceTotal,
          status: invoice.status,
          ads_total: adsTotal,
          ad_count: adCount,
          difference,
        };
      })
      .filter((row) => Math.abs(row.difference) > 0.01)
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

    const { data: orphanedPaidAds, error: orphanedPaidAdsError } = await supabase
      .from(table("ads"))
      .select("id, ad_name, advertiser, payment, status")
      .eq("payment", "Paid")
      .is("paid_via_invoice_id", null)
      .eq("archived", false);
    if (orphanedPaidAdsError) throw orphanedPaidAdsError;

    const { data: deletedInvoices, error: deletedInvoicesError } = await supabase
      .from(table("invoices"))
      .select("id, invoice_number, deleted_at")
      .not("deleted_at", "is", null);
    if (deletedInvoicesError) throw deletedInvoicesError;

    let deletedInvoiceAds = [];
    const deletedInvoiceIds = (deletedInvoices || []).map((invoice) => invoice.id);
    if (deletedInvoiceIds.length > 0) {
      const deletedInvoiceMap = new Map(
        (deletedInvoices || []).map((invoice) => [invoice.id, invoice]),
      );
      const { data: linkedAds, error: linkedAdsError } = await supabase
        .from(table("ads"))
        .select("id, ad_name, advertiser, payment, paid_via_invoice_id")
        .in("paid_via_invoice_id", deletedInvoiceIds);
      if (linkedAdsError) throw linkedAdsError;

      deletedInvoiceAds = (linkedAds || []).map((ad) => {
        const invoice = deletedInvoiceMap.get(ad.paid_via_invoice_id);
        return {
          ...ad,
          invoice_number: invoice?.invoice_number || null,
          deleted_at: invoice?.deleted_at || null,
        };
      });
    }

    return Response.json({
      discrepancies,
      orphanedPaidAds: orphanedPaidAds || [],
      deletedInvoiceAds,
      summary: {
        totalDiscrepancies: discrepancies.length,
        totalOrphanedAds: (orphanedPaidAds || []).length,
        totalDeletedInvoiceAds: deletedInvoiceAds.length,
      },
    });
  } catch (error) {
    console.error("Error validating amounts:", error);
    return Response.json(
      { error: "Failed to validate amounts" },
      { status: 500 },
    );
  }
}

