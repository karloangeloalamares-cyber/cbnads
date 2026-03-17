import { requirePermission } from "../../../utils/auth-check.js";
import { db, table } from "../../../utils/supabase-db.js";
import { sendPaymentReceivedNotifications } from "../../../utils/payment-received-notifications.js";

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

export async function POST(request) {
  try {
    const auth = await requirePermission("billing:edit", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const body = await request.json();
    const invoiceId = String(body?.invoice_id || "").trim();
    if (!invoiceId) {
      return Response.json({ error: "invoice_id is required." }, { status: 400 });
    }

    const supabase = db();
    const { data: invoice, error: invoiceError } = await supabase
      .from(table("invoices"))
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) {
      return Response.json({ error: "Invoice not found." }, { status: 404 });
    }

    if (invoice?.paid_via_credits === true) {
      return Response.json(
        {
          skipped: true,
          reason: "paid_via_credits",
          error: "Payment-received notifications are not sent for credit-paid invoices.",
        },
        { status: 409 },
      );
    }

    if (normalizeStatus(invoice.status) !== "paid") {
      return Response.json(
        { error: "Invoice is not marked as paid yet." },
        { status: 409 },
      );
    }

    const notificationResult = await sendPaymentReceivedNotifications({
      request,
      supabase,
      invoice,
    });

    if (notificationResult?.reason === "paid_via_credits") {
      return Response.json(
        {
          skipped: true,
          reason: "paid_via_credits",
          error: "Payment-received notifications are not sent for credit-paid invoices.",
        },
        { status: 409 },
      );
    }

    if (notificationResult?.reason === "missing_advertiser_email") {
      return Response.json(
        { error: "Advertiser email is missing on this invoice." },
        { status: 400 },
      );
    }

    return Response.json({
      success: true,
      invoice_id: invoice.id,
      invoice_number: String(invoice?.invoice_number || "").trim() || `INV-${invoice.id}`,
      advertiser_email: notificationResult.advertiser_email,
      advertiser_email_sent: notificationResult.advertiser_email_sent,
      advertiser_email_error: notificationResult.advertiser_email_error,
      ad_count: notificationResult.ad_count,
      ad_names: notificationResult.ad_names,
      internal_notifications: notificationResult.internal_notifications,
    });
  } catch (error) {
    console.error("[admin/invoices/send-payment-received] Failed:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
