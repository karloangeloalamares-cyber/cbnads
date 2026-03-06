import {
  adDatesForDayCheck,
  dateOnly,
  normalizePostType,
  table,
  toNumber,
} from "./supabase-db.js";
import { formatDateKeyFromDate } from "../../../lib/timezone.js";

const normalizeTime = (value) => {
  if (!value) return "";
  const asText = String(value).trim();
  if (/^\d{2}:\d{2}$/.test(asText)) return `${asText}:00`;
  return asText;
};

const activePendingStatuses = new Set(["pending"]);
const activeAdStatuses = new Set(["scheduled", "approved", "posted", "published", "active"]);

const isExcluded = (item, excludeId) => String(item?.id || "") === String(excludeId || "");

const includesDate = (item, date) => adDatesForDayCheck(item).includes(date);

const isMissingColumnError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42703" || /column .* does not exist/i.test(message);
};

const hasLinkedRecord = (value) => String(value || "").trim().length > 0;

const isCountableAd = (item) => {
  const status = String(item?.status || "").trim().toLowerCase();
  if (!status || status === "archived" || status === "deleted" || item?.archived === true) {
    return false;
  }
  return activeAdStatuses.has(status);
};

const isCountablePendingAd = (item) => {
  const status = String(item?.status || "").trim().toLowerCase();
  if (!activePendingStatuses.has(status)) {
    return false;
  }

  if (item?.rejected_at) {
    return false;
  }

  if (hasLinkedRecord(item?.linked_ad_id) || hasLinkedRecord(item?.linked_invoice_id)) {
    return false;
  }

  return true;
};

export const expandDateRange = (from, to) => {
  const start = dateOnly(from);
  const end = dateOnly(to || from);
  if (!start || !end) return [];

  const dates = [];
  const cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  if (Number.isNaN(cursor.valueOf()) || Number.isNaN(endDate.valueOf()) || cursor > endDate) {
    return [];
  }

  while (cursor <= endDate) {
    dates.push(formatDateKeyFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

// Module-level cache for max-ads-per-day (rarely changes, refreshed every 5 min)
let _maxAdsCache = null;
let _maxAdsCacheExpiry = 0;

const getMaxAdsPerDay = async (supabase) => {
  const now = Date.now();
  if (_maxAdsCache !== null && now < _maxAdsCacheExpiry) {
    return _maxAdsCache;
  }
  const { data: settingsRows, error: settingsError } = await supabase
    .from(table("admin_settings"))
    .select("max_ads_per_day, max_ads_per_slot")
    .order("id", { ascending: true })
    .limit(1);
  if (settingsError) throw settingsError;

  const value =
    toNumber(settingsRows?.[0]?.max_ads_per_day, 0) ||
    toNumber(settingsRows?.[0]?.max_ads_per_slot, 0) ||
    5;
  _maxAdsCache = value;
  _maxAdsCacheExpiry = now + 5 * 60 * 1000; // 5 minutes
  return value;
};

// Build a query for scheduled records filtered to dates that could overlap [minDate, maxDate].
// - One-time/custom posts with post_date_from in range are included.
// - Daily runs still active (post_date_to >= minDate or no end date) are included.
// - Records with null post_date_to are always included (custom schedules, ongoing daily runs).
// The JS-level includesDate() check is the authoritative filter; this just reduces fetch size.
const getScheduledRecords = async (supabase, { minDate, maxDate } = {}) => {
  const buildQuery = (tableName, selectClause) => {
    let q = supabase
      .from(tableName)
      .select(selectClause);

    if (minDate) {
      const max = maxDate || minDate;
      // Include if: date_from is in [minDate, max] OR post_date_to >= minDate OR no end date
      q = q.or(
        `and(post_date_from.gte.${minDate},post_date_from.lte.${max}),post_date_to.gte.${minDate},post_date_to.is.null`,
      );
    }

    return q;
  };

  const fetchRows = async (tableName, selectClauses) => {
    for (const selectClause of selectClauses) {
      const result = await buildQuery(tableName, selectClause);
      if (!result.error) {
        return result.data || [];
      }
      if (!isMissingColumnError(result.error)) {
        throw result.error;
      }
    }

    return [];
  };

  const [adsResult, pendingResult] = await Promise.all([
    fetchRows(table("ads"), [
      "id, status, archived, post_type, post_date, post_date_from, post_date_to, custom_dates, post_time",
      "id, status, post_type, post_date, post_date_from, post_date_to, custom_dates, post_time",
    ]),
    fetchRows(table("pending_ads"), [
      "id, status, linked_ad_id, linked_invoice_id, rejected_at, post_type, post_date, post_date_from, post_date_to, custom_dates, post_time",
      "id, status, post_type, post_date, post_date_from, post_date_to, custom_dates, post_time",
    ]),
  ]);

  const ads = adsResult.filter(isCountableAd);
  const pendingAds = pendingResult.filter(isCountablePendingAd);

  return [...ads, ...pendingAds];
};

export const checkSingleDateAvailability = async ({
  supabase,
  date,
  postType,
  postTime,
  excludeId,
}) => {
  const targetDate = dateOnly(date);
  if (!targetDate) {
    throw new Error("Invalid date provided");
  }

  const [maxAdsPerDay, scheduledItems] = await Promise.all([
    getMaxAdsPerDay(supabase),
    getScheduledRecords(supabase, { minDate: targetDate, maxDate: targetDate }),
  ]);

  const visibleItems = scheduledItems.filter((item) => !isExcluded(item, excludeId));
  const totalAdsOnDate = visibleItems.filter((item) => includesDate(item, targetDate)).length;

  const requestedType = normalizePostType(postType);
  if (requestedType === "one_time") {
    const requestedTime = normalizeTime(postTime);
    const blockedTimes = new Set(
      visibleItems
        .filter((item) => normalizePostType(item.post_type) === "one_time")
        .filter((item) => dateOnly(item.post_date_from || item.post_date) === targetDate)
        .map((item) => normalizeTime(item.post_time))
        .filter(Boolean),
    );

    const isTimeBlocked = requestedTime ? blockedTimes.has(requestedTime) : false;
    const isDayFull = totalAdsOnDate >= maxAdsPerDay;
    const available = !isDayFull && !isTimeBlocked;
    const reason = isDayFull ? "limit_reached" : isTimeBlocked ? "time_blocked" : null;

    return {
      available,
      limit: maxAdsPerDay,
      bookedCount: totalAdsOnDate,
      reason,
      tooltip: isDayFull ? "All slots are taken on that day" : isTimeBlocked ? "Time slot already booked" : null,
      blocked_times: Array.from(blockedTimes),
      total_ads_on_date: totalAdsOnDate,
      max_ads_per_day: maxAdsPerDay,
      is_day_full: isDayFull,
      is_time_blocked: isTimeBlocked,
    };
  }

  const isDayFull = totalAdsOnDate >= maxAdsPerDay;
  return {
    available: !isDayFull,
    limit: maxAdsPerDay,
    bookedCount: totalAdsOnDate,
    reason: isDayFull ? "limit_reached" : null,
    tooltip: isDayFull ? "All slots are taken on that day" : null,
    total_ads_on_date: totalAdsOnDate,
    max_ads_per_day: maxAdsPerDay,
    is_day_full: isDayFull,
    is_time_blocked: false,
    blocked_times: [],
  };
};

export const checkBatchAvailability = async ({
  supabase,
  dates,
  excludeId,
}) => {
  const normalizedDates = Array.from(new Set((dates || []).map(dateOnly).filter(Boolean)));
  if (normalizedDates.length === 0) {
    return { results: {}, max_ads_per_day: 5 };
  }

  const sortedDates = [...normalizedDates].sort();
  const minDate = sortedDates[0];
  const maxDate = sortedDates[sortedDates.length - 1];

  const [maxAdsPerDay, scheduledItems] = await Promise.all([
    getMaxAdsPerDay(supabase),
    getScheduledRecords(supabase, { minDate, maxDate }),
  ]);

  const visibleItems = scheduledItems.filter((item) => !isExcluded(item, excludeId));
  const results = {};

  for (const day of normalizedDates) {
    const totalAdsOnDate = visibleItems.filter((item) => includesDate(item, day)).length;
    const isFull = totalAdsOnDate >= maxAdsPerDay;
    results[day] = {
      available: !isFull,
      limit: maxAdsPerDay,
      bookedCount: totalAdsOnDate,
      reason: isFull ? "limit_reached" : null,
      total_ads_on_date: totalAdsOnDate,
      max_ads_per_day: maxAdsPerDay,
      is_full: isFull,
      tooltip: isFull ? "All slots are taken on that day" : null,
    };
  }

  return {
    results,
    max_ads_per_day: maxAdsPerDay,
  };
};
