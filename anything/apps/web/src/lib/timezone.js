export const APP_TIME_ZONE = "America/New_York";

const getFormatter = (() => {
  const cache = new Map();

  return (options) => {
    const cacheKey = JSON.stringify(options);
    if (!cache.has(cacheKey)) {
      cache.set(
        cacheKey,
        new Intl.DateTimeFormat("en-US", {
          timeZone: APP_TIME_ZONE,
          ...options,
        }),
      );
    }
    return cache.get(cacheKey);
  };
})();

const getDateTimeParts = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }

  const formatter = getFormatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const partMap = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      partMap[part.type] = part.value;
    }
  }

  if (!partMap.year || !partMap.month || !partMap.day) {
    return null;
  }

  return {
    year: partMap.year,
    month: partMap.month,
    day: partMap.day,
    hour: partMap.hour || "00",
    minute: partMap.minute || "00",
    second: partMap.second || "00",
    dateKey: `${partMap.year}-${partMap.month}-${partMap.day}`,
    timeKey: `${partMap.hour || "00"}:${partMap.minute || "00"}:${partMap.second || "00"}`,
  };
};

export const formatDateKeyFromDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
};

export const normalizeDateKey = (value) => {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return getTodayInAppTimeZone(value);
  }

  const text = String(value).trim();
  if (!text) {
    return "";
  }

  const dateMatch = text.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateMatch) {
    return dateMatch[1];
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf())) {
    return "";
  }

  return getTodayInAppTimeZone(parsed);
};

export const normalizeTimeValue = (value, withSeconds = false) => {
  if (!value) {
    return "";
  }

  const text = String(value).trim();
  if (!text) {
    return "";
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
    return withSeconds ? text : text.slice(0, 5);
  }

  if (/^\d{2}:\d{2}$/.test(text)) {
    return withSeconds ? `${text}:00` : text;
  }

  return withSeconds ? text.slice(0, 8) : text.slice(0, 5);
};

export const getTodayInAppTimeZone = (value = new Date()) =>
  getDateTimeParts(value)?.dateKey || "";

export const getTodayDateInAppTimeZone = (value = new Date()) => {
  const dateKey = getTodayInAppTimeZone(value);
  return dateKey ? new Date(`${dateKey}T00:00:00`) : new Date();
};

export const isBeforeTodayInAppTimeZone = (value, reference = new Date()) => {
  const dateKey = normalizeDateKey(value);
  const todayKey = getTodayInAppTimeZone(reference);
  if (!dateKey || !todayKey) {
    return false;
  }

  return dateKey < todayKey;
};

export const isPastDateTimeInAppTimeZone = (
  dateValue,
  timeValue,
  reference = new Date(),
) => {
  const dateKey = normalizeDateKey(dateValue);
  const timeKey = normalizeTimeValue(timeValue, true) || "00:00:00";
  const nowParts = getDateTimeParts(reference);

  if (!dateKey || !nowParts) {
    return false;
  }

  return `${dateKey}T${timeKey}` < `${nowParts.dateKey}T${nowParts.timeKey}`;
};

export const formatDateTimeInAppTimeZone = (value, options = {}) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "N/A";
  }

  return date.toLocaleString("en-US", {
    timeZone: APP_TIME_ZONE,
    ...options,
  });
};
