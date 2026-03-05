import { toNumber } from "./supabase-db.js";
import { getTodayInAppTimeZone } from "../../../lib/timezone.js";

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

const INVOICE_PREFIX = "INV";
const SUFFIX_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SUFFIX_LENGTH = 4;

const toInvoiceDateDigits = (value = new Date()) => {
  const dateKey = getTodayInAppTimeZone(value) || getTodayInAppTimeZone();
  return String(dateKey).replace(/-/g, "").slice(0, 8);
};

const generateSuffix = () =>
  Array.from({ length: SUFFIX_LENGTH }, () =>
    SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)],
  ).join("");

export function formatInvoiceNumber({ date = new Date(), suffix } = {}) {
  const dateDigits = toInvoiceDateDigits(date);
  const safeSuffix = suffix || generateSuffix();
  return `${INVOICE_PREFIX}-${dateDigits}-${safeSuffix}`;
}

export function fallbackInvoiceNumber(date = new Date()) {
  return formatInvoiceNumber({ date });
}

export async function nextSequentialInvoiceNumber(
  supabase,
  invoicesTableName,
  { date = new Date() } = {},
) {
  const { data, error } = await supabase
    .from(invoicesTableName)
    .select("invoice_number")
    .is("deleted_at", null);
  if (error) throw error;

  const existing = new Set(
    (data || []).map((row) => String(row?.invoice_number || "").toUpperCase()),
  );

  let candidate;
  let attempts = 0;
  do {
    candidate = formatInvoiceNumber({ date });
    if (++attempts > 100) throw new Error("Could not generate a unique invoice number");
  } while (existing.has(candidate));

  return candidate;
}
