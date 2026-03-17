import { can } from "../../../../lib/permissions.js";
import {
  getRequestStatusForError,
  isAdvertiserUser,
  matchesAdvertiserScope,
  requireAuth,
  resolveAdvertiserScope,
} from "../../utils/auth-check.js";
import { db, table } from "../../utils/supabase-db.js";
import {
  buildSolaCheckoutUrl,
  getInvoiceOutstandingAmount,
  hasInvoicePartialPayment,
  isInvoicePaidViaCredits,
} from "../../utils/sola-checkout.js";

const normalizeText = (value) => String(value || "").trim().toLowerCase();

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return Response.json(
        { error: auth.error },
        { status: auth.status || getRequestStatusForError(auth.error) },
      );
    }

    if (!isAdvertiserUser(auth.user) && !can(auth.user.role, "billing:view")) {
      return Response.json(
        { error: "Unauthorized - Billing access required" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const invoiceId = String(body?.invoice_id || "").trim();
    if (!invoiceId) {
      return Response.json({ error: "invoice_id is required." }, { status: 400 });
    }

    const supabase = db();
    const { data: invoice, error: invoiceError } = await supabase
      .from(table("invoices"))
      .select("*")
      .eq("id", invoiceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (invoiceError) {
      throw invoiceError;
    }
    if (!invoice) {
      return Response.json({ error: "Invoice not found." }, { status: 404 });
    }

    const advertiserScope = isAdvertiserUser(auth.user)
      ? await resolveAdvertiserScope(auth.user)
      : null;
    if (advertiserScope && !matchesAdvertiserScope(invoice, advertiserScope)) {
      return Response.json({ error: "Invoice not found." }, { status: 404 });
    }

    if (isInvoicePaidViaCredits(invoice)) {
      return Response.json(
        {
          error: "Invoices paid via credits cannot be charged through Sola.",
          reason: "paid_via_credits",
        },
        { status: 409 },
      );
    }

    const outstandingAmount = getInvoiceOutstandingAmount(invoice);
    if (normalizeText(invoice.status) === "paid" || outstandingAmount <= 0) {
      return Response.json(
        {
          error: "Invoice is already paid.",
          reason: "invoice_already_paid",
        },
        { status: 409 },
      );
    }

    if (hasInvoicePartialPayment(invoice)) {
      return Response.json(
        {
          error:
            "Sola checkout currently supports invoices without a recorded partial payment.",
          reason: "partial_payment_not_supported",
        },
        { status: 409 },
      );
    }

    return Response.json({
      provider: "sola",
      invoice_id: invoice.id,
      invoice_number: String(invoice.invoice_number || invoice.id || "").trim() || invoice.id,
      outstanding_amount: outstandingAmount,
      checkout_url: buildSolaCheckoutUrl({
        request,
        invoice,
      }),
    });
  } catch (error) {
    console.error("[api/invoices/sola-checkout] Failed:", error);

    if (
      /SOLA_PAYMENTS_SITE_URL is not configured|SOLA_PAYMENTS_SITE_URL is not a valid absolute URL/i.test(
        String(error?.message || ""),
      )
    ) {
      return Response.json(
        {
          error: "Sola checkout is not configured yet.",
          reason: "checkout_not_configured",
        },
        { status: 503 },
      );
    }

    return Response.json({ error: "Failed to prepare Sola checkout." }, { status: 500 });
  }
}
