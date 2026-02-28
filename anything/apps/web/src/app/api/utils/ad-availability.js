import {
  adDatesForDayCheck,
  dateOnly,
  normalizePostType,
  table,
  toNumber,
} from "./supabase-db.js";

const normalizeTime = (value) => {
  if (!value) return "";
  const asText = String(value).trim();
  if (/^\d{2}:\d{2}$/.test(asText)) return `${asText}:00`;
  return asText;
};

const activePendingStatuses = new Set(["pending"]);

const isExcluded = (item, excludeId) => String(item?.id || "") === String(excludeId || "");

const includesDate = (item, date) => adDatesForDayCheck(item).includes(date);

const isCountableAd = (item) => {
  const status = String(item?.status || "").trim().toLowerCase();
  return status !== "archived" && status !== "deleted";
};

const isCountablePendingAd = (item) =>
  activePendingStatuses.has(String(item?.status || "").trim().toLowerCase());

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
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const getMaxAdsPerDay = async (supabase) => {
  const { data: settingsRows, error: settingsError } = await supabase
    .from(table("admin_settings"))
    .select("*")
    .order("id", { ascending: true })
    .limit(1);
  if (settingsError) throw settingsError;

  return (
    toNumber(settingsRows?.[0]?.max_ads_per_day, 0) ||
    toNumber(settingsRows?.[0]?.max_ads_per_slot, 0) ||
    5
  );
};

const getScheduledRecords = async (supabase) => {
  const [adsResult, pendingResult] = await Promise.all([
    supabase
      .from(table("ads"))
      .select("id, status, post_type, post_date, post_date_from, post_date_to, custom_dates, post_time"),
    supabase
      .from(table("pending_ads"))
      .select("id, status, post_type, post_date, post_date_from, post_date_to, custom_dates, post_time"),
  ]);

  if (adsResult.error) throw adsResult.error;
  if (pendingResult.error) throw pendingResult.error;

  const ads = (adsResult.data || []).filter(isCountableAd);
  const pendingAds = (pendingResult.data || []).filter(isCountablePendingAd);

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
    getScheduledRecords(supabase),
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

    return {
      available: totalAdsOnDate < maxAdsPerDay && !isTimeBlocked,
      blocked_times: Array.from(blockedTimes),
      total_ads_on_date: totalAdsOnDate,
      max_ads_per_day: maxAdsPerDay,
      is_day_full: totalAdsOnDate >= maxAdsPerDay,
      is_time_blocked: isTimeBlocked,
    };
  }

  return {
    available: totalAdsOnDate < maxAdsPerDay,
    total_ads_on_date: totalAdsOnDate,
    max_ads_per_day: maxAdsPerDay,
    is_day_full: totalAdsOnDate >= maxAdsPerDay,
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

  const [maxAdsPerDay, scheduledItems] = await Promise.all([
    getMaxAdsPerDay(supabase),
    getScheduledRecords(supabase),
  ]);

  const visibleItems = scheduledItems.filter((item) => !isExcluded(item, excludeId));
  const results = {};

  for (const day of normalizedDates) {
    const totalAdsOnDate = visibleItems.filter((item) => includesDate(item, day)).length;
    results[day] = {
      total_ads_on_date: totalAdsOnDate,
      max_ads_per_day: maxAdsPerDay,
      is_full: totalAdsOnDate >= maxAdsPerDay,
      tooltip: totalAdsOnDate >= maxAdsPerDay ? "Ad limit reached" : "",
    };
  }

  return {
    results,
    max_ads_per_day: maxAdsPerDay,
  };
};
