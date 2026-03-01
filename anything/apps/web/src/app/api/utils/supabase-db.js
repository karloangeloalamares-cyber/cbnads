import { adminTableName, getSupabaseAdmin } from "../../../lib/supabaseAdmin.js";
import { formatDateKeyFromDate, normalizeDateKey } from "../../../lib/timezone.js";

export const db = () => getSupabaseAdmin();

export const table = (baseName) => adminTableName(baseName);

export const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const dateOnly = (value) => {
  return normalizeDateKey(value);
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
      dates.push(formatDateKeyFromDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  if (type === "custom_schedule") {
    if (!Array.isArray(ad?.custom_dates)) return [];
    return ad.custom_dates
      .map((entry) => {
        if (entry && typeof entry === "object") {
          return dateOnly(entry.date);
        }
        return dateOnly(entry);
      })
      .filter(Boolean);
  }

  return from ? [from] : [];
};

export const advertiserResponse = (row) => ({
  ...row,
  phone_number: row?.phone_number ?? row?.phone ?? null,
  total_spend: row?.total_spend ?? row?.ad_spend ?? 0,
  status: row?.status ?? "active",
});
