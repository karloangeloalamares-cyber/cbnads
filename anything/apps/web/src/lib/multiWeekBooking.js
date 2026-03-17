export const clampWeeks = (value, fallback = 4) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(12, Math.max(2, Math.floor(parsed)));
};

export const addDaysToDateKey = (dateKey, days) => {
  const normalized = String(dateKey || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) return "";
  parsed.setDate(parsed.getDate() + Number(days || 0));
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const normalizeAdvertiserMultiWeekOverride = (entry = {}) => ({
  product_id: String(entry.product_id || ""),
  placement: String(entry.placement || ""),
  ad_name: String(entry.ad_name || ""),
  ad_text: String(entry.ad_text || ""),
  use_base_media: entry.use_base_media !== false,
  media: Array.isArray(entry.media) ? entry.media : [],
  schedule_tbd: Boolean(entry.schedule_tbd),
  post_date_from: String(entry.post_date_from || ""),
  post_time: String(entry.post_time || ""),
  reminder_minutes: String(entry.reminder_minutes || "15-min"),
});

export const normalizeAdvertiserMultiWeekOverrides = (overrides, weeks) => {
  const normalizedOverrides = Array.isArray(overrides) ? overrides : [];
  return Array.from({ length: clampWeeks(weeks) }).map((_, index) =>
    normalizeAdvertiserMultiWeekOverride(
      normalizedOverrides[index] && typeof normalizedOverrides[index] === "object"
        ? normalizedOverrides[index]
        : {},
    ),
  );
};

export const resolveAdvertiserMultiWeekPreview = (
  formData,
  weekIndex,
  options = {},
) => {
  const includeBaseFallback = options.includeBaseFallback !== false;
  const overrides = normalizeAdvertiserMultiWeekOverrides(
    formData?.multi_week_overrides,
    formData?.multi_week_weeks || 4,
  );
  const override = overrides[weekIndex] || normalizeAdvertiserMultiWeekOverride();
  const baseName = includeBaseFallback ? String(formData?.ad_name || "").trim() : "";
  const baseText = includeBaseFallback ? String(formData?.ad_text || "").trim() : "";
  const baseMedia =
    includeBaseFallback && Array.isArray(formData?.media) ? formData.media : [];

  return {
    ...formData,
    ad_name:
      String(override.ad_name || "").trim() ||
      (baseName ? `${baseName} (Week ${weekIndex + 1})` : `Week ${weekIndex + 1}`),
    ad_text: String(override.ad_text || "").trim() || baseText,
    media: override.use_base_media !== false ? baseMedia : override.media,
    post_date_from: override.schedule_tbd
      ? ""
      : String(override.post_date_from || "").trim() ||
        addDaysToDateKey(formData?.series_week_start, weekIndex * 7),
    post_time: override.schedule_tbd ? "" : String(override.post_time || "").trim(),
  };
};

export const getEstimatedOccurrenceCount = (formData) => {
  const postType = String(formData?.post_type || "");
  if (postType === "Multi-week booking (TBD)") {
    return clampWeeks(formData?.multi_week_weeks || 4);
  }
  if (postType === "Custom Schedule") {
    return Array.isArray(formData?.custom_dates) ? formData.custom_dates.length : 0;
  }
  if (postType === "Daily Run") {
    const from = String(formData?.post_date_from || "").slice(0, 10);
    const to = String(formData?.post_date_to || "").slice(0, 10);
    if (!from || !to) return 0;
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end < start) return 0;
    return Math.floor((end.valueOf() - start.valueOf()) / 86400000) + 1;
  }
  return formData?.post_date_from ? 1 : 0;
};
