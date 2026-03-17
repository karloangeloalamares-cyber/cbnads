import { table } from "./supabase-db.js";

const getFirstRow = (value) => (Array.isArray(value) ? value[0] || null : value || null);

const normalizeIdempotencyKey = (value) => {
  const key = String(value || "").trim().slice(0, 200);
  return key || null;
};

export const resolveInvoiceRequestKey = ({
  request = null,
  bodyKey = null,
  scope = "invoice",
} = {}) => {
  const explicit = normalizeIdempotencyKey(bodyKey);
  const header = normalizeIdempotencyKey(request?.headers?.get?.("x-idempotency-key"));
  const raw = explicit || header;
  if (!raw) {
    return null;
  }

  const normalizedScope = String(scope || "invoice").trim().toLowerCase();
  return `${normalizedScope}:${raw}`.slice(0, 255);
};

const normalizeItems = (items) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    ad_id: item?.ad_id || null,
    product_id: item?.product_id || null,
    description: item?.description || "",
    quantity: Number(item?.quantity) || 1,
    unit_price: Number(item?.unit_price) || 0,
    amount:
      Number(item?.amount) ||
      (Number(item?.quantity) || 1) * (Number(item?.unit_price) || 0),
    created_at: item?.created_at || undefined,
  }));

const uniqueStringIds = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

export const createInvoiceAtomic = async ({
  supabase,
  invoice = {},
  items = [],
  adIds = [],
  updateAdsPayment = null,
  applyCredits = false,
  actorUserId = null,
  creditNote = null,
} = {}) => {
  const normalizedItems = normalizeItems(items);
  const normalizedAdIds = uniqueStringIds([
    ...adIds,
    ...normalizedItems.map((item) => item.ad_id),
    ...(Array.isArray(invoice?.ad_ids) ? invoice.ad_ids : []),
  ]);

  const rpcPayload = {
    p_invoice: {
      ...invoice,
      ad_ids: normalizedAdIds,
    },
    p_items: normalizedItems,
    p_ad_ids: normalizedAdIds,
    p_update_ads_payment: updateAdsPayment,
    p_apply_credits: applyCredits === true,
    p_actor_user_id: actorUserId || null,
    p_credit_note: creditNote || null,
  };

  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    "cbnads_web_create_invoice_atomic",
    rpcPayload,
  );
  if (rpcError) {
    throw rpcError;
  }

  const rpcResult = getFirstRow(rpcRows);
  const invoiceId = String(rpcResult?.invoice_id || "").trim();
  if (!invoiceId) {
    throw new Error("Invoice creation RPC returned no invoice id.");
  }

  const { data: invoiceRow, error: invoiceError } = await supabase
    .from(table("invoices"))
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceError) {
    throw invoiceError;
  }
  if (!invoiceRow) {
    throw new Error("Invoice was not found after creation.");
  }

  const { data: itemRows, error: itemError } = await supabase
    .from(table("invoice_items"))
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  if (itemError) {
    throw itemError;
  }

  return {
    invoice: {
      ...invoiceRow,
      items: itemRows || [],
    },
    created: rpcResult?.created === true,
    appliedCredits: rpcResult?.applied_credits === true,
    creditReason: String(rpcResult?.credit_reason || "").trim() || null,
  };
};
