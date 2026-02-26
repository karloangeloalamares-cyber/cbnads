import { toNumber } from "@/app/api/utils/supabase-db";

export function parsePaymentAmount(value) {
  const text = String(value || "").trim();
  if (!text) return 0;

  const direct = Number(text);
  if (Number.isFinite(direct)) return direct;

  const normalized = text.replace(/[$,\s]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

export function adAmount(ad) {
  const fromPayment = parsePaymentAmount(ad?.payment);
  if (fromPayment > 0) return fromPayment;
  const fromPrice = toNumber(ad?.price, 0);
  if (fromPrice > 0) return fromPrice;
  return toNumber(ad?.product_price, 0);
}

export async function nextSequentialInvoiceNumber(supabase, invoicesTableName) {
  const { data, error } = await supabase
    .from(invoicesTableName)
    .select("invoice_number")
    .is("deleted_at", null);
  if (error) throw error;

  let maxValue = 0;
  for (const row of data || []) {
    const digits = String(row?.invoice_number || "").replace(/\D/g, "");
    const value = Number(digits);
    if (Number.isFinite(value) && value > maxValue) {
      maxValue = value;
    }
  }

  return `INV-${String(maxValue + 1).padStart(4, "0")}`;
}

