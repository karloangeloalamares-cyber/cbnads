import { requirePermission } from "../../../utils/auth-check.js";
import { db, table } from "../../../utils/supabase-db.js";
import { sendEmail } from "../../../utils/send-email.js";
import { buildAdvertiserDashboardSignInUrl } from "../../../utils/advertiser-dashboard-url.js";

const readNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(readNumber(value));

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeStatus = (value) => {
  const status = String(value || "").trim();
  if (!status || status === "Unpaid") {
    return "Pending";
  }
  return status;
};

export async function POST(request) {
  try {
    const auth = await requirePermission("billing:edit", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const body = await request.json().catch(() => ({}));
    const invoiceId = String(body?.invoice_id || "").trim();
    if (!invoiceId) {
      return Response.json({ error: "invoice_id is required" }, { status: 400 });
    }

    const supabase = db();

    const { data: invoice, error: invoiceError } = await supabase
      .from(table("invoices"))
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.paid_via_credits === true) {
      return Response.json(
        { error: "Invoice was already paid via credits." },
        { status: 400 },
      );
    }

    const normalizedStatus = normalizeStatus(invoice.status);
    const amountPaid = readNumber(invoice.amount_paid);
    if (normalizedStatus === "Paid" && amountPaid > 0) {
      return Response.json(
        { error: "Invoice is already marked as paid." },
        { status: 400 },
      );
    }

    const advertiserId = String(invoice.advertiser_id || "").trim();
    if (!advertiserId) {
      return Response.json(
        { error: "Invoice must be linked to an advertiser to send this reminder." },
        { status: 400 },
      );
    }

    const { data: advertiser, error: advertiserError } = await supabase
      .from(table("advertisers"))
      .select("id, advertiser_name, email, credits")
      .eq("id", advertiserId)
      .maybeSingle();
    if (advertiserError) throw advertiserError;

    const advertiserEmail = String(invoice.contact_email || advertiser?.email || "")
      .trim()
      .toLowerCase();
    if (!advertiserEmail) {
      return Response.json(
        { error: "Advertiser email is missing for this invoice." },
        { status: 400 },
      );
    }

    const invoiceNumber =
      String(invoice.invoice_number || "").trim() || `INV-${String(invoice.id || "").trim()}`;
    const invoiceTotal = Math.max(0, readNumber(invoice.total ?? invoice.amount));
    const creditBalance = Math.max(0, readNumber(advertiser?.credits));
    const shortfall = Math.max(0, invoiceTotal - creditBalance);

    const advertiserName = String(
      invoice.advertiser_name || advertiser?.advertiser_name || "your account",
    ).trim();

    const signInUrl = buildAdvertiserDashboardSignInUrl({
      request,
      email: advertiserEmail,
      section: "Billing",
    });

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.45; color: #111827;">
        <p style="margin: 0 0 12px;">Hi ${escapeHtml(advertiserName)},</p>
        <p style="margin: 0 0 12px;">
          Your prepaid credit balance is <strong>${escapeHtml(formatCurrency(creditBalance))}</strong>, which is not enough to cover invoice
          <strong>${escapeHtml(invoiceNumber)}</strong> totaling <strong>${escapeHtml(
            formatCurrency(invoiceTotal),
          )}</strong>.
        </p>
        <p style="margin: 0 0 12px;">
          Additional credits needed to auto-pay this invoice: <strong>${escapeHtml(
            formatCurrency(shortfall),
          )}</strong>.
        </p>
        <p style="margin: 0 0 16px;">
          You can review billing details here:
          <a href="${escapeHtml(signInUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(
            signInUrl,
          )}</a>
        </p>
        <p style="margin: 0; color: #6b7280; font-size: 12px;">
          If you’d like to top up prepaid credits, reply to this email and we’ll help you.
        </p>
      </div>
    `.trim();

    await sendEmail({
      to: advertiserEmail,
      subject: `Prepaid credits are low - Invoice ${invoiceNumber}`,
      html,
    });

    const { data: updatedInvoices, error: updateError } = await supabase
      .from(table("invoices"))
      .update({
        status: "Pending",
        amount_paid: 0,
        paid_date: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id)
      .select("*")
      .limit(1);
    if (updateError) throw updateError;

    const updatedInvoice = Array.isArray(updatedInvoices)
      ? updatedInvoices[0] || null
      : updatedInvoices;

    return Response.json({
      success: true,
      invoice: updatedInvoice || invoice,
      email: advertiserEmail,
      credit_balance: creditBalance,
      invoice_total: invoiceTotal,
      shortfall,
    });
  } catch (error) {
    console.error("Error sending low credit reminder:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to send low credit reminder",
        code: error?.code || null,
      },
      { status: 500 },
    );
  }
}

