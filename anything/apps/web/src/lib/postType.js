const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

export const normalizePostTypeValue = (value) => {
  const text = normalizeText(value);
  if (text === "one_time_post" || text === "one_time") {
    return "one_time";
  }
  if (text === "daily_run" || text === "daily") {
    return "daily_run";
  }
  if (text === "custom_schedule" || text === "custom") {
    return "custom_schedule";
  }
  return text || "one_time";
};

export const formatPostTypeLabel = (value) => {
  const normalized = normalizePostTypeValue(value);
  if (normalized === "daily_run") {
    return "Daily Run";
  }
  if (normalized === "custom_schedule") {
    return "Custom Schedule";
  }
  return "One-Time Post";
};

export const formatPostTypeBadgeLabel = (value) => {
  const normalized = normalizePostTypeValue(value);
  if (normalized === "daily_run") {
    return "Daily";
  }
  if (normalized === "custom_schedule") {
    return "Custom";
  }
  return "One-Time";
};
