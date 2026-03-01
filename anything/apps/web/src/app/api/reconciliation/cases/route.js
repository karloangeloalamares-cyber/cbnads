import { db, table, toNumber } from "../../utils/supabase-db.js";
import { requirePermission } from "../../utils/auth-check.js";
import { parsePaymentAmount } from "../../utils/invoice-helpers.js";

const isMissingRelationError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42P01" || code === "PGRST205" || /does not exist/i.test(message);
};

const buildCases = ({ discrepancies, orphanedPaidAds, deletedInvoiceAds, reviewsByKey }) => {
  const cases = [];

  for (const item of discrepancies) {
    const caseKey = `invoice_mismatch:${item.invoice_id}`;
    cases.push({
      case_key: caseKey,
      case_type: "invoice_mismatch",
      invoice_id: item.invoice_id,
      ad_id: null,
      title: `${item.invoice_number} amount mismatch`,
      status: reviewsByKey.get(caseKey)?.status || "open",
      note: reviewsByKey.get(caseKey)?.note || "",
      payload: item,
    });
  }

  for (const item of orphanedPaidAds) {
    const caseKey = `orphaned_paid_ad:${item.id}`;
    cases.push({
      case_key: caseKey,
      case_type: "orphaned_paid_ad",
      invoice_id: null,
      ad_id: item.id,
      title: `${item.ad_name} is paid with no invoice`,
      status: reviewsByKey.get(caseKey)?.status || "open",
      note: reviewsByKey.get(caseKey)?.note || "",
      payload: item,
    });
  }

  for (const item of deletedInvoiceAds) {
    const caseKey = `deleted_invoice_link:${item.id}:${item.paid_via_invoice_id}`;
    cases.push({
      case_key: caseKey,
      case_type: "deleted_invoice_link",
      invoice_id: item.paid_via_invoice_id || null,
      ad_id: item.id,
      title: `${item.ad_name} links to deleted invoice ${item.invoice_number || ""}`.trim(),
      status: reviewsByKey.get(caseKey)?.status || "open",
      note: reviewsByKey.get(caseKey)?.note || "",
      payload: item,
    });
  }

  return cases;
};

export async function GET(request) {
  try {
    const auth = await requirePermission("reconciliation:view", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const supabase = db();

    const { data: invoices, error: invoicesError } = await supabase
      .from(table("invoices"))
      .select("id, invoice_number, advertiser_name, total, amount, amount_paid, status, deleted_at")
      .is("deleted_at", null);
    if (invoicesError) throw invoicesError;

    const invoiceIds = (invoices || []).map((invoice) => invoice.id);
    let invoiceItems = [];
    if (invoiceIds.length > 0) {
      const { data, error } = await supabase
        .from(table("invoice_items"))
        .select("invoice_id, ad_id, amount")
        .in("invoice_id", invoiceIds);
      if (error) throw error;
      invoiceItems = data || [];
    }

    const adIds = [...new Set(invoiceItems.map((item) => item.ad_id).filter(Boolean))];
    let ads = [];
    if (adIds.length > 0) {
      const { data, error } = await supabase
        .from(table("ads"))
        .select("id, ad_name, advertiser, payment, price, paid_via_invoice_id")
        .in("id", adIds);
      if (error) throw error;
      ads = data || [];
    }
    const adsById = new Map((ads || []).map((ad) => [ad.id, ad]));

    const adTotalsByInvoice = new Map();
    for (const item of invoiceItems) {
      const ad = adsById.get(item.ad_id);
      const amount = Math.max(
        toNumber(item.amount, 0),
        toNumber(ad?.price, 0),
        parsePaymentAmount(ad?.payment),
      );
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
      .sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference));

    const { data: orphanedPaidAds, error: orphanedPaidAdsError } = await supabase
      .from(table("ads"))
      .select("id, ad_name, advertiser, payment, status, paid_via_invoice_id")
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

    let reviewRows = [];
    const reviewResult = await supabase
      .from(table("reconciliation_case_reviews"))
      .select("*")
      .order("updated_at", { ascending: false });
    if (reviewResult.error) {
      if (!isMissingRelationError(reviewResult.error)) {
        throw reviewResult.error;
      }
    } else {
      reviewRows = reviewResult.data || [];
    }

    const reviewsByKey = new Map(reviewRows.map((row) => [row.case_key, row]));
    const cases = buildCases({
      discrepancies,
      orphanedPaidAds: orphanedPaidAds || [],
      deletedInvoiceAds,
      reviewsByKey,
    });

    return Response.json({
      cases,
      summary: {
        totalDiscrepancies: discrepancies.length,
        totalOrphanedAds: (orphanedPaidAds || []).length,
        totalDeletedInvoiceAds: deletedInvoiceAds.length,
      },
    });
  } catch (error) {
    console.error("Error fetching reconciliation cases:", error);
    return Response.json({ error: "Failed to fetch reconciliation cases" }, { status: 500 });
  }
}
