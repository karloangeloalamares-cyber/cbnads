import { db, table } from "../../../utils/supabase-db.js";
import {
  getRequestStatusForError,
  isAdvertiserUser,
  matchesAdvertiserScope,
  requireAdminOrAdvertiser,
  resolveAdvertiserScope,
} from "../../../utils/auth-check.js";

export async function GET(request, { params }) {
  try {
    const auth = await requireAdminOrAdvertiser(request);
    if (!auth.authorized) {
      return Response.json(
        { error: auth.error },
        { status: auth.status || getRequestStatusForError(auth.error) },
      );
    }

    const { id } = params;
    if (!id) {
      return Response.json({ error: "Ad ID is required" }, { status: 400 });
    }

    const supabase = db();
    const advertiserScope = isAdvertiserUser(auth.user)
      ? await resolveAdvertiserScope(auth.user)
      : null;

    if (advertiserScope) {
      const { data: ad, error: adError } = await supabase
        .from(table("ads"))
        .select("id, advertiser_id, advertiser")
        .eq("id", id)
        .maybeSingle();
      if (adError) throw adError;
      if (
        !ad ||
        !matchesAdvertiserScope(ad, advertiserScope, {
          advertiserNameFields: ["advertiser", "advertiser_name"],
        })
      ) {
        return Response.json({ invoices: [] });
      }
    }

    const { data: invoiceItems, error: invoiceItemsError } = await supabase
      .from(table("invoice_items"))
      .select("invoice_id")
      .eq("ad_id", id);
    if (invoiceItemsError) throw invoiceItemsError;

    const invoiceIds = [...new Set((invoiceItems || []).map((row) => row.invoice_id).filter(Boolean))];
    if (invoiceIds.length === 0) {
      return Response.json({ invoices: [] });
    }

    const { data: invoices, error: invoicesError } = await supabase
      .from(table("invoices"))
      .select("id, invoice_number, advertiser_name, issue_date, status, total, amount_paid, created_at")
      .in("id", invoiceIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (invoicesError) throw invoicesError;

    const filteredInvoices = advertiserScope
      ? (invoices || []).filter((item) => matchesAdvertiserScope(item, advertiserScope))
      : invoices || [];

    return Response.json({ invoices: filteredInvoices });
  } catch (error) {
    console.error("Error fetching ad invoices:", error);
    return Response.json(
      { error: "Failed to fetch invoices" },
      { status: 500 },
    );
  }
}
