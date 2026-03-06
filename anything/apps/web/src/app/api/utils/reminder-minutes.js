const REMINDER_PRESET_MINUTES = {
  "15-min": 15,
  "15m": 15,
  "30-min": 30,
  "30m": 30,
  "1-hour": 60,
  "1h": 60,
  "1-day": 1440,
  "1d": 1440,
};

export function parseReminderMinutes(value, fallback = 15) {
  const fallbackMinutes = Math.max(1, Number(fallback) || 15);

  if (value === null || value === undefined || value === "") {
    return fallbackMinutes;
  }

  if (typeof value === "number") {
    return Math.max(1, Number(value) || fallbackMinutes);
  }

  const text = String(value).trim().toLowerCase();
  if (!text) {
    return fallbackMinutes;
  }

  if (/^\d+$/.test(text)) {
    return Math.max(1, Number(text));
  }

  if (REMINDER_PRESET_MINUTES[text]) {
    return REMINDER_PRESET_MINUTES[text];
  }

  const unitMatch = text.match(/^(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)$/i);
  if (!unitMatch) {
    return fallbackMinutes;
  }

  const amount = Math.max(1, Number(unitMatch[1]));
  const unit = String(unitMatch[2] || "").toLowerCase();
  if (unit.startsWith("day")) return amount * 1440;
  if (unit.startsWith("hour") || unit.startsWith("hr")) return amount * 60;
  return amount;
}
