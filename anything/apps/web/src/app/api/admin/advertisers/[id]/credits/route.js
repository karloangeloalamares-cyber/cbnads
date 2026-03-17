import { requirePermission } from "../../../../utils/auth-check.js";
import { advertiserResponse, db, table, toNumber } from "../../../../utils/supabase-db.js";
import { isCreditRuleViolation } from "../../../../utils/prepaid-credits.js";
import { createInvoiceAtomic, resolveInvoiceRequestKey } from "../../../../utils/invoice-atomic.js";
import { getTodayInAppTimeZone } from "../../../../../../lib/timezone.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeOptionalUuid = (value) => {
  const normalized = String(value || "").trim();
  return UUID_REGEX.test(normalized) ? normalized : null;
};

const roundMoney = (value) => {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return Math.round(safe * 100) / 100;
};
const isIdempotencyConflictError = (error) =>
  String(error?.message || "").toLowerCase().includes("idempotency_key_conflict");

const resolveCreditRequestKey = ({ request, body, advertiserId }) =>
  resolveInvoiceRequestKey({
    request,
    bodyKey: body?.idempotency_key || body?.idempotencyKey,
    scope: `admin-credit-adjust:${advertiserId}`,
  });

export async function POST(request, { params }) {
  try {
    const auth = await requirePermission("billing:edit", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const advertiserId = String(params?.id || "").trim();
    if (!advertiserId) {
      return Response.json({ error: "Advertiser ID is required" }, { status: 400 });
    }

    const body = await request.json();
    const amount = toNumber(body?.amount, 0);
    const reason = String(body?.reason || "").trim();

    if (!amount) {
      return Response.json({ error: "A non-zero amount is required" }, { status: 400 });
    }

    if (!reason) {
      return Response.json({ error: "A reason is required" }, { status: 400 });
    }

    const entryType = amount > 0 ? "manual_credit_add" : "manual_credit_deduct";
    const supabase = db();
    const actorUserId = normalizeOptionalUuid(auth?.user?.id);
    const requestKey = resolveCreditRequestKey({
      request,
      body,
      advertiserId,
    });

    const { data: adjustmentRows, error: adjustmentError } = await supabase.rpc(
      "cbnads_web_adjust_prepaid_credits_atomic",
      {
        p_advertiser_id: advertiserId,
        p_amount: amount,
        p_entry_type: entryType,
        p_note: reason,
        p_created_by: actorUserId,
        p_invoice_id: null,
        p_ad_id: null,
        p_source_request_key: requestKey,
      },
    );

    if (adjustmentError) {
      if (isCreditRuleViolation(adjustmentError)) {
        return Response.json({ error: adjustmentError.message }, { status: 400 });
      }
      if (isIdempotencyConflictError(adjustmentError)) {
        return Response.json(
          { error: "Idempotency key already used with a different credit adjustment payload." },
          { status: 409 },
        );
      }
      throw adjustmentError;
    }

    const adjustment = Array.isArray(adjustmentRows) ? adjustmentRows[0] || null : adjustmentRows;
    if (!adjustment) {
      throw new Error("Credit adjustment RPC returned no adjustment row.");
    }

    const { data: advertiser, error: advertiserError } = await supabase
      .from(table("advertisers"))
      .select("*")
      .eq("id", advertiserId)
      .maybeSingle();
    if (advertiserError) {
      throw advertiserError;
    }
    if (!advertiser) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    let creditInvoice = null;
    if (amount > 0) {
      const today = getTodayInAppTimeZone();
      const total = roundMoney(amount);
      const ledgerId = String(adjustment?.ledger_id || "").trim() || null;
      const sourceRequestKey = ledgerId
        ? `admin-credit-invoice:${ledgerId}`
        : requestKey
          ? `${requestKey}:invoice`
          : null;

      const createdInvoice = await createInvoiceAtomic({
        supabase,
        invoice: {
          invoice_prefix: "CRE",
          source_request_key: sourceRequestKey,
          advertiser_id: advertiserId,
          advertiser_name: String(advertiser?.advertiser_name || "").trim() || null,
          issue_date: today,
          due_date: today,
          status: "Paid",
          amount: total,
          total,
          amount_paid: total,
          paid_date: today,
          bill_to:
            String(advertiser?.business_name || "").trim() ||
            String(advertiser?.advertiser_name || "").trim() ||
            null,
          contact_name: String(advertiser?.contact_name || "").trim() || null,
          contact_email: String(advertiser?.email || "").trim() || null,
          ad_ids: [],
          notes: `Credit top-up: ${reason}`,
          paid_via_credits: false,
        },
        items: [],
        adIds: [],
        updateAdsPayment: null,
        applyCredits: false,
        actorUserId,
      });
      creditInvoice = createdInvoice.invoice;

      if (ledgerId && creditInvoice?.id) {
        const { error: ledgerUpdateError } = await supabase
          .from(table("credit_ledger"))
          .update({ invoice_id: creditInvoice.id })
          .eq("id", ledgerId)
          .is("invoice_id", null);
        if (ledgerUpdateError) {
          throw ledgerUpdateError;
        }
      }
    }

    return Response.json({
      advertiser: advertiserResponse(advertiser),
      adjustment,
      credit_invoice: creditInvoice,
    });
  } catch (error) {
    console.error("Error adjusting advertiser credits:", error);
    return Response.json(
      { error: "Failed to adjust advertiser credits" },
      { status: 500 },
    );
  }
}
