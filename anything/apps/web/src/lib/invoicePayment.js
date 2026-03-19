export const INVOICE_PAYMENT_PROVIDER_OPTIONS = [
  { value: "sola", label: "Sola" },
  { value: "stripe", label: "Stripe" },
  { value: "paypal", label: "PayPal" },
  { value: "venmo", label: "Venmo" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

export const normalizeInvoicePaymentProvider = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "bank" || normalized === "wire") {
    return "bank_transfer";
  }

  return normalized;
};

export const getInvoicePaymentProviderLabel = (value) => {
  const normalized = normalizeInvoicePaymentProvider(value);
  return (
    INVOICE_PAYMENT_PROVIDER_OPTIONS.find((option) => option.value === normalized)?.label ||
    (normalized
      ? normalized
          .split("_")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ")
      : "Unspecified")
  );
};

export const isSolaInvoicePaymentProvider = (value) =>
  normalizeInvoicePaymentProvider(value) === "sola";

export const invoicePaymentProviderRequiresReference = (value) => {
  const normalized = normalizeInvoicePaymentProvider(value);
  return Boolean(normalized) && normalized !== "cash";
};

export const invoicePaymentProviderRequiresNote = (value) =>
  normalizeInvoicePaymentProvider(value) === "other";
