import { formatDateKeyFromDate, normalizeDateKey } from "../../../lib/timezone.js";

export const clampWeeks = (value, { min = 1, max = 12, fallback = 4 } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

export const normalizeDateKeyStrict = (value) => {
  const normalized = normalizeDateKey(value);
  if (!normalized) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  return normalized;
};

export const addDaysToDateKey = (dateKey, days) => {
  const normalized = normalizeDateKeyStrict(dateKey);
  if (!normalized) return "";
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) return "";
  parsed.setDate(parsed.getDate() + Number(days || 0));
  return formatDateKeyFromDate(parsed);
};

export const buildSeriesWeekStarts = ({ seriesWeekStart, weeks }) => {
  const start = normalizeDateKeyStrict(seriesWeekStart);
  const count = clampWeeks(weeks);
  if (!start) return [];

  return Array.from({ length: count }).map((_, index) => ({
    series_index: index + 1,
    series_total: count,
    series_week_start: addDaysToDateKey(start, index * 7),
  }));
};

export const resolveWeeklyCreative = ({ base, override, index }) => {
  const baseName = String(base?.ad_name || "").trim();
  const baseText = String(base?.ad_text || "").trim();
  const baseMedia = Array.isArray(base?.media) ? base.media : [];

  const overrideName = String(override?.ad_name || "").trim();
  const overrideText = String(override?.ad_text || "").trim();
  const overrideMedia = Array.isArray(override?.media) ? override.media : [];
  const useBaseMedia = override?.use_base_media !== false;

  return {
    ad_name: overrideName || (baseName ? `${baseName} (Week ${index})` : `Week ${index}`),
    ad_text: overrideText || baseText || null,
    media: useBaseMedia ? baseMedia : overrideMedia,
  };
};
