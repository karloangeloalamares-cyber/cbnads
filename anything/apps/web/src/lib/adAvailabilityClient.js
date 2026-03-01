import { formatDateKeyFromDate } from "@/lib/timezone";

const normalizeTime = (value) => {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{2}:\d{2}$/.test(text)) return `${text}:00`;
  return text;
};

export const normalizeCustomDateEntries = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      if (entry && typeof entry === "object") {
        return String(entry.date || "").slice(0, 10);
      }
      return String(entry || "").slice(0, 10);
    })
    .filter(Boolean);

export const getDatesInRange = (from, to) => {
  const dates = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const current = new Date(start);

  if (
    Number.isNaN(start.valueOf()) ||
    Number.isNaN(end.valueOf()) ||
    start > end
  ) {
    return [];
  }

  while (current <= end) {
    dates.push(formatDateKeyFromDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
};

const readErrorMessage = async (response, fallback) => {
  try {
    const data = await response.json();
    return data?.error || fallback;
  } catch {
    return fallback;
  }
};

export const checkAdAvailability = async ({
  postType,
  postDateFrom,
  postDateTo,
  customDates,
  postTime,
  excludeAdId,
}) => {
  if (postType === "One-Time Post" && postDateFrom && postTime) {
    const response = await fetch("/api/ads/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: postDateFrom,
        postType,
        postTime: normalizeTime(postTime),
        adId: excludeAdId || null,
      }),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, `Availability check failed: ${response.status}`),
      );
    }

    const data = await response.json();

    return {
      available: Boolean(data.available),
      availabilityError: data.available
        ? null
        : data.reason === "limit_reached" || data.is_day_full
          ? "Ad limit reached for this date. Please choose the next available day."
          : data.reason === "time_blocked" || data.is_time_blocked
            ? "This time slot is already taken. Please choose a different time."
            : "This time slot is not available.",
      fullyBookedDates:
        (data.reason === "limit_reached" || data.is_day_full) && postDateFrom ? [postDateFrom] : [],
      data,
    };
  }

  if (postType === "Daily Run" && postDateFrom && postDateTo) {
    const dates = getDatesInRange(postDateFrom, postDateTo);
    if (dates.length === 0 || dates.length > 365) {
      return { available: true, availabilityError: null, fullyBookedDates: [], data: null };
    }

    const response = await fetch("/api/ads/availability-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dates,
        postType: "Daily Run",
        adId: excludeAdId || null,
      }),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, `Availability check failed: ${response.status}`),
      );
    }

    const data = await response.json();
    const availabilityByDate = data.availabilityByDate || data.results || {};
    const fullyBookedDates = dates.filter((date) => availabilityByDate?.[date]?.is_full);

    return {
      available: fullyBookedDates.length === 0,
      availabilityError:
        fullyBookedDates.length > 0
          ? "Ad limit reached on one or more dates in this range. Please choose different dates."
          : null,
      fullyBookedDates,
      data,
    };
  }

  if (postType === "Custom Schedule") {
    const dates = normalizeCustomDateEntries(customDates);
    if (dates.length === 0) {
      return { available: true, availabilityError: null, fullyBookedDates: [], data: null };
    }

    const response = await fetch("/api/ads/availability-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dates,
        postType: "Custom Schedule",
        adId: excludeAdId || null,
      }),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, `Availability check failed: ${response.status}`),
      );
    }

    const data = await response.json();
    const availabilityByDate = data.availabilityByDate || data.results || {};
    const fullyBookedDates = dates.filter((date) => availabilityByDate?.[date]?.is_full);

    return {
      available: fullyBookedDates.length === 0,
      availabilityError:
        fullyBookedDates.length > 0
          ? "Ad limit reached on one or more selected dates. Please choose different dates."
          : null,
      fullyBookedDates,
      data,
    };
  }

  return {
    available: true,
    availabilityError: null,
    fullyBookedDates: [],
    data: null,
  };
};

export const fetchMonthAvailability = async ({ monthDate, excludeAdId, signal }) => {
  const month = new Date(monthDate);
  if (Number.isNaN(month.valueOf())) {
    return {};
  }

  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const dates = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(formatDateKeyFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const response = await fetch("/api/ads/availability-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      dates,
      adId: excludeAdId || null,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Availability check failed: ${response.status}`),
    );
  }

  const data = await response.json();
  return data.availabilityByDate || data.results || {};
};
