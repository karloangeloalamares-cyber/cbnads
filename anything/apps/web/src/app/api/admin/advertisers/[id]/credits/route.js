import { requirePermission } from "../../../../utils/auth-check.js";
import { advertiserResponse, db, table, toNumber } from "../../../../utils/supabase-db.js";
import { isCreditRuleViolation } from "../../../../utils/prepaid-credits.js";
import { nextSequentialInvoiceNumber } from "../../../../utils/invoice-helpers.js";
import { getTodayInAppTimeZone } from "../../../../../lib/timezone.js";

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

const isAmbiguousCreditsRpcError = (error) =>
  String(error?.message || "")
    .trim()
    .toLowerCase()
    .includes('column reference "credits" is ambiguous');

const extractMissingColumnName = (error) => {
  const message = String(error?.message || "");
  const match = message.match(/column \"([^\"]+)\"/i);
  return match ? match[1] : null;
};

const isMissingColumnError = (error) => {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("column")
  );
};

const adjustCreditsFallback = async ({
  supabase,
  advertiserId,
  amount,
  entryType,
  reason,
  createdBy,
}) => {
  const normalizedAmount = roundMoney(amount);
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data: advertiser, error: advertiserReadError } = await supabase
      .from(table("advertisers"))
      .select("id, credits")
      .eq("id", advertiserId)
      .maybeSingle();
    if (advertiserReadError) {
      throw advertiserReadError;
    }
    if (!advertiser) {
      throw new Error("advertiser not found");
    }

    const balanceBefore = roundMoney(advertiser.credits);
    const balanceAfter = roundMoney(balanceBefore + normalizedAmount);
    if (balanceAfter < 0) {
      throw new Error("insufficient credits");
    }

    const { data: updatedRows, error: advertiserUpdateError } = await supabase
      .from(table("advertisers"))
      .update({
        credits: balanceAfter,
        updated_at: new Date().toISOString(),
      })
      .eq("id", advertiserId)
      .eq("credits", advertiser.credits)
      .select("id, credits");

    if (advertiserUpdateError) {
      throw advertiserUpdateError;
    }

    const updatedAdvertiser = Array.isArray(updatedRows) ? updatedRows[0] || null : updatedRows;
    if (!updatedAdvertiser) {
      if (attempt < maxAttempts) {
        continue;
      }
      throw new Error("Failed to adjust credits due to a concurrent update. Please retry.");
    }

    const { data: ledgerRows, error: ledgerError } = await supabase
      .from(table("credit_ledger"))
      .insert({
        advertiser_id: advertiserId,
        invoice_id: null,
        ad_id: null,
        amount: normalizedAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        entry_type: entryType,
        note: reason,
        created_by: createdBy || null,
      })
      .select("id")
      .limit(1);

    if (ledgerError) {
      throw ledgerError;
    }

    const ledger = Array.isArray(ledgerRows) ? ledgerRows[0] || null : ledgerRows || null;

    return {
      advertiser_id: advertiserId,
      credits: balanceAfter,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      ledger_id: ledger?.id || null,
    };
  }

  throw new Error("Failed to adjust credits. Please retry.");
};

const insertCreditInvoiceWithFallback = async (supabase, payload) => {
  let candidate = { ...payload };
  let lastError = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabase
      .from(table("invoices"))
      .insert(candidate)
      .select("*")
      .limit(1);
    if (!error) {
      const invoice = Array.isArray(data) ? data[0] || null : data || null;
      return invoice;
    }

    lastError = error;
    if (!isMissingColumnError(error)) {
      throw error;
    }

    const missingColumn = extractMissingColumnName(error);
    if (!missingColumn || !(missingColumn in candidate)) {
      throw error;
    }

    const nextCandidate = { ...candidate };
    delete nextCandidate[missingColumn];
    candidate = nextCandidate;
  }

  throw lastError || new Error("Failed to create the credit invoice.");
};

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

    let adjustment = null;
    const { data: adjustmentRows, error: adjustmentError } = await supabase.rpc(
      "cbnads_web_adjust_prepaid_credits",
      {
        p_advertiser_id: advertiserId,
        p_amount: amount,
        p_entry_type: entryType,
        p_note: reason,
        p_created_by: actorUserId,
        p_invoice_id: null,
        p_ad_id: null,
      },
    );

    if (adjustmentError) {
      if (isCreditRuleViolation(adjustmentError)) {
        return Response.json({ error: adjustmentError.message }, { status: 400 });
      }

      if (!isAmbiguousCreditsRpcError(adjustmentError)) {
        throw adjustmentError;
      }

      try {
        adjustment = await adjustCreditsFallback({
          supabase,
          advertiserId,
          amount,
          entryType,
          reason,
          createdBy: actorUserId,
        });
      } catch (fallbackError) {
        if (isCreditRuleViolation(fallbackError)) {
          return Response.json({ error: fallbackError.message }, { status: 400 });
        }
        throw fallbackError;
      }
    } else {
      adjustment = Array.isArray(adjustmentRows) ? adjustmentRows[0] || null : adjustmentRows;
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
      const invoiceNumber = await nextSequentialInvoiceNumber(supabase, table("invoices"), {
        prefix: "CRE",
      });
      const total = roundMoney(amount);
      creditInvoice = await insertCreditInvoiceWithFallback(supabase, {
        invoice_number: invoiceNumber,
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
        updated_at: new Date().toISOString(),
      });
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
