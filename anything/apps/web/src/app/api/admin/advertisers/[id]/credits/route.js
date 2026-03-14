import { requirePermission } from "../../../../utils/auth-check.js";
import { advertiserResponse, db, table, toNumber } from "../../../../utils/supabase-db.js";
import { isCreditRuleViolation } from "../../../../utils/prepaid-credits.js";

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

    const { data: adjustmentRows, error: adjustmentError } = await supabase.rpc(
      "cbnads_web_adjust_prepaid_credits",
      {
        p_advertiser_id: advertiserId,
        p_amount: amount,
        p_entry_type: entryType,
        p_note: reason,
        p_created_by: auth.user.id,
        p_invoice_id: null,
        p_ad_id: null,
      },
    );

    if (adjustmentError) {
      if (isCreditRuleViolation(adjustmentError)) {
        return Response.json({ error: adjustmentError.message }, { status: 400 });
      }
      throw adjustmentError;
    }

    const adjustment = Array.isArray(adjustmentRows) ? adjustmentRows[0] || null : adjustmentRows;
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

    return Response.json({
      advertiser: advertiserResponse(advertiser),
      adjustment,
    });
  } catch (error) {
    console.error("Error adjusting advertiser credits:", error);
    return Response.json(
      { error: "Failed to adjust advertiser credits" },
      { status: 500 },
    );
  }
}
