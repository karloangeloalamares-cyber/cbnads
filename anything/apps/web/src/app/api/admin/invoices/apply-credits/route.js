import { requirePermission } from "../../../utils/auth-check.js";
import { db } from "../../../utils/supabase-db.js";
import { applyInvoiceCredits } from "../../../utils/prepaid-credits.js";

export async function POST(request) {
  try {
    const auth = await requirePermission("billing:edit", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const body = await request.json();
    const invoiceId = String(body?.invoice_id || "").trim();
    if (!invoiceId) {
      return Response.json({ error: "invoice_id is required" }, { status: 400 });
    }

    const result = await applyInvoiceCredits({
      request,
      supabase: db(),
      invoiceId,
      actorUserId: auth.user.id,
      note: "Prepaid credits applied automatically from billing.",
      sendNotice: true,
    });

    if (!result.invoice && result.reason === "invoice_not_found") {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }

    return Response.json({
      applied: result.applied,
      reason: result.reason,
      notice_type: result.notice_type,
      remaining_credits: result.remainingCredits,
      invoice: result.invoice,
      notice: result.notice,
    });
  } catch (error) {
    console.error("Error applying prepaid credits:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to apply prepaid credits",
        code: error?.code || null,
      },
      { status: 500 },
    );
  }
}
