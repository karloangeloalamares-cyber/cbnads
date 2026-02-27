import { adminTableName, getSupabaseAdmin } from "../../../lib/supabaseAdmin.js";

export const db = () => getSupabaseAdmin();

export const table = (baseName) => adminTableName(baseName);

export const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const dateOnly = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  const asText = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(asText)) {
    return asText;
  }
  const parsed = new Date(asText);
  if (Number.isNaN(parsed.valueOf())) return "";
  return parsed.toISOString().slice(0, 10);
};

export const normalizePostType = (value) => {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  if (text === "one_time_post" || text === "one_time") return "one_time";
  if (text === "daily_run" || text === "daily") return "daily_run";
  if (text === "custom_schedule" || text === "custom") return "custom_schedule";
  return text || "one_time";
};

export const adDatesForDayCheck = (ad) => {
  const type = normalizePostType(ad?.post_type);
  const from = dateOnly(ad?.post_date_from || ad?.schedule || ad?.post_date);
  const to = dateOnly(ad?.post_date_to);

  if (type === "one_time") {
    return from ? [from] : [];
  }

  if (type === "daily_run") {
    if (!from) return [];
    const end = to || from;
    const startDate = new Date(`${from}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf()) || startDate > endDate) {
      return [];
    }
    const dates = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  if (type === "custom_schedule") {
    if (!Array.isArray(ad?.custom_dates)) return [];
    return ad.custom_dates.map(dateOnly).filter(Boolean);
  }

  return from ? [from] : [];
};

export const advertiserResponse = (row) => ({
  ...row,
  phone_number: row?.phone_number ?? row?.phone ?? null,
  total_spend: row?.total_spend ?? row?.ad_spend ?? 0,
  status: row?.status ?? "active",
});

