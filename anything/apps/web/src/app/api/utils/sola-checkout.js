import { toNumber } from "./supabase-db.js";

const readServerEnv = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const getRequestOrigin = (request) => {
  try {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "http://localhost:4000";
  }
};

export const getInvoiceOutstandingAmount = (invoice) => {
  const total = Math.max(0, toNumber(invoice?.total ?? invoice?.amount, 0));
  const amountPaid = Math.max(0, toNumber(invoice?.amount_paid, 0));

  if (normalizeText(invoice?.status) === "paid") {
    return 0;
  }

  const outstanding = total - amountPaid;
  if (outstanding > 0) {
    return outstanding;
  }

  return total;
};

export const hasInvoicePartialPayment = (invoice) => {
  const total = Math.max(0, toNumber(invoice?.total ?? invoice?.amount, 0));
  const amountPaid = Math.max(0, toNumber(invoice?.amount_paid, 0));

  if (normalizeText(invoice?.status) === "paid" || total <= 0) {
    return false;
  }

  return amountPaid > 0 && amountPaid < total;
};

export const isInvoicePaidViaCredits = (invoice) => invoice?.paid_via_credits === true;

export const getSolaPaymentSiteUrl = () =>
  readServerEnv(
    "SOLA_PAYMENTS_SITE_URL",
    "SOLA_PAYMENTS_PAYMENTSITE_URL",
    "SOLA_PAYMENTS_CHECKOUT_URL",
  );

const buildSolaReturnUrl = ({ request, invoice, outcome }) => {
  const url = new URL("/ads", `${getRequestOrigin(request)}/`);
  url.searchParams.set("section", "Billing");
  url.searchParams.set("provider", "sola");
  url.searchParams.set("sola", String(outcome || "return").trim() || "return");

  const invoiceId = String(invoice?.id || "").trim();
  if (invoiceId) {
    url.searchParams.set("invoice", invoiceId);
  }

  return url.toString();
};

export const buildSolaCheckoutUrl = ({ request, invoice }) => {
  const paymentSiteUrl = getSolaPaymentSiteUrl();
  if (!paymentSiteUrl) {
    throw new Error("SOLA_PAYMENTS_SITE_URL is not configured.");
  }

  let checkoutUrl;
  try {
    checkoutUrl = new URL(paymentSiteUrl);
  } catch {
    throw new Error("SOLA_PAYMENTS_SITE_URL is not a valid absolute URL.");
  }
  const outstandingAmount = getInvoiceOutstandingAmount(invoice);
  if (outstandingAmount <= 0) {
    throw new Error("Invoice does not have an outstanding balance.");
  }

  const invoiceId = String(invoice?.id || "").trim();
  const invoiceNumber = String(invoice?.invoice_number || invoiceId).trim();
  const advertiserId = String(invoice?.advertiser_id || "").trim();
  const contactEmail = String(invoice?.contact_email || "").trim().toLowerCase();
  const softwareName = readServerEnv("SOLA_PAYMENTS_SOFTWARE_NAME");
  const softwareVersion = readServerEnv("SOLA_PAYMENTS_SOFTWARE_VERSION");
  const description = invoiceNumber ? `Invoice ${invoiceNumber}` : "CBN Ads Invoice";

  checkoutUrl.searchParams.set("xAmount", outstandingAmount.toFixed(2));
  checkoutUrl.searchParams.set("xInvoice", invoiceNumber || invoiceId);
  if (invoiceId) {
    checkoutUrl.searchParams.set("xCustom01", invoiceId);
  }
  if (advertiserId) {
    checkoutUrl.searchParams.set("xCustom02", advertiserId);
  }
  if (contactEmail) {
    checkoutUrl.searchParams.set("xEmail", contactEmail);
  }

  checkoutUrl.searchParams.set("xDescription", description);
  checkoutUrl.searchParams.set("xComments", `CBN Ads payment for ${description}`);
  checkoutUrl.searchParams.set(
    "xRedirectURL",
    buildSolaReturnUrl({ request, invoice, outcome: "approved" }),
  );
  checkoutUrl.searchParams.set(
    "xRedirectURL_NotApproved",
    buildSolaReturnUrl({ request, invoice, outcome: "declined" }),
  );

  if (softwareName) {
    checkoutUrl.searchParams.set("xSoftwareName", softwareName);
  }
  if (softwareVersion) {
    checkoutUrl.searchParams.set("xSoftwareVersion", softwareVersion);
  }

  return checkoutUrl.toString();
};
