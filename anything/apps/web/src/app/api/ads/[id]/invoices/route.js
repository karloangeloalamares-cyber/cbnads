import { db, table } from "@/app/api/utils/supabase-db";
import { requireAdmin } from "@/app/api/utils/auth-check";

export async function GET(request, { params }) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return Response.json({ error: "Ad ID is required" }, { status: 400 });
    }

    const supabase = db();
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

    return Response.json({ invoices: invoices || [] });
  } catch (error) {
    console.error("Error fetching ad invoices:", error);
    return Response.json(
      { error: "Failed to fetch invoices" },
      { status: 500 },
    );
  }
}
