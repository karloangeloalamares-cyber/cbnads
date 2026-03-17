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

export function normalizePostType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
}

export function toDateOnly(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const direct = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];

  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const formatDateKeyFromDate = (value) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function expandDateRangeKeys(from, to) {
  const startKey = toDateOnly(from);
  const endKey = toDateOnly(to || from);
  if (!startKey || !endKey) return [];

  const start = new Date(`${startKey}T00:00:00`);
  const endDate = new Date(`${endKey}T00:00:00`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(endDate.valueOf()) || start > endDate) {
    return [];
  }

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= endDate) {
    dates.push(formatDateKeyFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

const parseCustomDates = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return [value];
    }
  }
  return [];
};

export function extractAdScheduleDateKeys(ad) {
  const postType = normalizePostType(ad?.post_type);
  if (postType === "daily_run") {
    const expanded = expandDateRangeKeys(
      ad?.post_date_from || ad?.post_date || ad?.schedule,
      ad?.post_date_to || ad?.post_date_from || ad?.post_date || ad?.schedule,
    );
    if (expanded.length > 0) {
      return expanded;
    }
  }

  if (postType === "custom_schedule") {
    const customDateKeys = parseCustomDates(ad?.custom_dates)
      .map((entry) => {
        if (entry && typeof entry === "object") {
          return toDateOnly(entry.date);
        }
        return toDateOnly(entry);
      })
      .filter(Boolean);
    if (customDateKeys.length > 0) {
      return [...new Set(customDateKeys)];
    }
  }

  const singleDate = toDateOnly(ad?.post_date_from || ad?.post_date || ad?.schedule);
  return singleDate ? [singleDate] : [];
}

export function formatInvoiceDateLabel(dateKey) {
  const normalizedDate = toDateOnly(dateKey);
  if (!normalizedDate) {
    return "";
  }
  const parsed = new Date(`${normalizedDate}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) {
    return normalizedDate;
  }
  return parsed.toLocaleDateString("en-US");
}

export function buildInvoiceLineItemsForAd({
  ad,
  unitAmount,
  invoiceId = null,
  productId = null,
  productName = null,
  createdAt = new Date().toISOString(),
} = {}) {
  const safeUnitAmount = Math.max(0, toNumber(unitAmount, 0));
  const dateKeys = extractAdScheduleDateKeys(ad);
  const effectiveDateKeys = dateKeys.length > 0 ? dateKeys : [null];
  const resolvedProductName = String(productName || ad?.product_name || "").trim();
  const baseDescription = resolvedProductName
    ? `${resolvedProductName}${ad?.ad_name ? ` | Ad: ${ad.ad_name}` : ""}`
    : ad?.ad_name || "Ad placement";
  const includeDateLabel = dateKeys.length > 1;

  return effectiveDateKeys.map((dateKey) => ({
    invoice_id: invoiceId,
    ad_id: ad?.id || null,
    product_id: productId || ad?.product_id || null,
    description:
      includeDateLabel && dateKey
        ? `${baseDescription} - ${formatInvoiceDateLabel(dateKey)}`
        : baseDescription,
    quantity: 1,
    unit_price: safeUnitAmount,
    amount: safeUnitAmount,
    created_at: createdAt,
  }));
}

export function sumInvoiceItemAmounts(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + toNumber(item?.amount ?? item?.unit_price, 0),
    0,
  );
}

const DEFAULT_INVOICE_PREFIX = "INV";
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

const normalizeInvoicePrefix = (value, fallback = DEFAULT_INVOICE_PREFIX) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return normalized || fallback;
};

export function formatInvoiceNumber({ date = new Date(), suffix, prefix = DEFAULT_INVOICE_PREFIX } = {}) {
  const dateDigits = toInvoiceDateDigits(date);
  const safeSuffix = suffix || generateSuffix();
  const invoicePrefix = normalizeInvoicePrefix(prefix);
  return `${invoicePrefix}-${dateDigits}-${safeSuffix}`;
}

export const isInvoiceNumberConflictError = (error) => {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "");
  const details = String(error?.details || "");
  const hint = String(error?.hint || "");
  return (
    code === "23505" &&
    /invoice_number|cbnads_web_invoices_invoice_number_key/i.test(
      `${message} ${details} ${hint}`,
    )
  );
};

export async function reserveInvoiceNumberWithRetry(
  createInvoiceAttempt,
  {
    date = new Date(),
    prefix = DEFAULT_INVOICE_PREFIX,
    maxAttempts = 8,
  } = {},
) {
  let lastConflictError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const invoiceNumber = formatInvoiceNumber({ date, prefix });
    try {
      const value = await createInvoiceAttempt({ invoiceNumber, attempt });
      return { value, invoiceNumber, attempt };
    } catch (error) {
      if (isInvoiceNumberConflictError(error)) {
        lastConflictError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastConflictError || new Error("Could not allocate a unique invoice number");
}

export function fallbackInvoiceNumber(date = new Date(), { prefix = DEFAULT_INVOICE_PREFIX } = {}) {
  return formatInvoiceNumber({ date, prefix });
}

export async function nextSequentialInvoiceNumber(
  supabase,
  invoicesTableName,
  { date = new Date(), prefix = DEFAULT_INVOICE_PREFIX } = {},
) {
  const isMissingColumnError = (error, columnName) => {
    const code = String(error?.code || "").trim();
    const message = String(error?.message || "").toLowerCase();
    return (
      code === "42703" ||
      code === "PGRST204" ||
      message.includes(`column \"${String(columnName || "").toLowerCase()}\"`) ||
      message.includes(`column "${String(columnName || "").toLowerCase()}"`) ||
      message.includes(String(columnName || "").toLowerCase())
    );
  };

  const fetchInvoiceNumbers = async (withDeletedFilter) => {
    let query = supabase.from(invoicesTableName).select("invoice_number");
    if (withDeletedFilter) {
      query = query.is("deleted_at", null);
    }
    return query;
  };

  let data;
  let error;
  ({ data, error } = await fetchInvoiceNumbers(true));
  if (error && isMissingColumnError(error, "deleted_at")) {
    ({ data, error } = await fetchInvoiceNumbers(false));
  }
  if (error) throw error;

  const existing = new Set(
    (data || []).map((row) => String(row?.invoice_number || "").toUpperCase()),
  );

  let candidate;
  let attempts = 0;
  do {
    candidate = formatInvoiceNumber({ date, prefix });
    if (++attempts > 100) throw new Error("Could not generate a unique invoice number");
  } while (existing.has(candidate));

  return candidate;
}
