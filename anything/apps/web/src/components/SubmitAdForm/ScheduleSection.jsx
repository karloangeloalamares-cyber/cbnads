import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, X, ChevronDown } from "lucide-react";
import { fetchDateBlockedTimes, fetchMonthAvailability } from "@/lib/adAvailabilityClient";
import { appToast } from "@/lib/toast";
import {
  formatDateKeyFromDate,
  getTodayDateInAppTimeZone,
  getTodayInAppTimeZone,
} from "@/lib/timezone";
import { MediaUploadSection } from "./MediaUploadSection";
import { AdTextEditor } from "./AdTextEditor";
import { AvailabilityDateField } from "./AvailabilityDateField";

const HOURS = Array.from({ length: 12 }).map((_, i) => String(i === 0 ? 12 : i));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const PERIODS = ["AM", "PM"];

// Convert a 12-hour display value + period to 24-hour integer
const to24Hour = (h12str, period) => {
  const h = parseInt(h12str, 10);
  if (period === "AM") return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
};

export function TimeSelect({ value, onChange, onBlur, required, blockedTimes = [], minTime = null }) {
  // value is expected to be "HH:MM" (24-hour format)
  const currentHour24 = value ? parseInt(value.split(":")[0], 10) : null;
  const currentMinute = value ? value.split(":")[1] : "";

  const currentPeriod = value ? (currentHour24 !== null && currentHour24 >= 12 ? "PM" : "AM") : "";
  let currentHour12 = currentHour24 !== null ? currentHour24 % 12 : "";
  if (currentHour12 === 0 && currentHour24 !== null) currentHour12 = 12;
  const displayHour = currentHour12 ? String(currentHour12) : "";

  // Parse minTime into { hour, minute } for comparison
  const minTime24 = useMemo(() => {
    if (!minTime) return null;
    const [h, m] = minTime.split(":");
    return { hour: parseInt(h, 10), minute: parseInt(m, 10) };
  }, [minTime]);

  // Derive which minutes are taken for the currently selected hour
  const blockedMinutesForHour = useMemo(() => {
    if (currentHour24 === null || !blockedTimes.length) return new Set();
    const hourStr = String(currentHour24).padStart(2, "0");
    return new Set(
      blockedTimes
        .map((t) => String(t).slice(0, 5)) // "HH:MM:SS" → "HH:MM"
        .filter((t) => t.startsWith(`${hourStr}:`))
        .map((t) => t.slice(3)),            // "HH:MM" → "MM"
    );
  }, [currentHour24, blockedTimes]);

  // Is a period option (AM/PM) in the past?
  const isPeriodPast = (period) => {
    if (!minTime24) return false;
    // AM is fully past once it's 12:00+ (noon)
    if (period === "AM") return minTime24.hour >= 12;
    return false;
  };

  // Is a 12-hour display hour option in the past, given the current period selection?
  const isHourPast = (h12str) => {
    if (!minTime24 || !currentPeriod) return false;
    const h24 = to24Hour(h12str, currentPeriod);
    // Disable if even the last minute (55) of this hour is before minTime
    return h24 * 60 + 55 < minTime24.hour * 60 + minTime24.minute;
  };

  // Is a specific minute past, given the currently selected hour?
  const isMinutePast = (m) => {
    if (!minTime24 || currentHour24 === null) return false;
    if (currentHour24 < minTime24.hour) return true;
    if (currentHour24 === minTime24.hour) return parseInt(m, 10) < minTime24.minute;
    return false;
  };

  const handleTimeChange = (type, val) => {
    let newHour12 = type === "hour" ? val : displayHour;
    let newMinute = type === "minute" ? val : (currentMinute || "00");
    let newPeriod = type === "period" ? val : (currentPeriod || "AM");

    if (!newHour12) newHour12 = "12";

    let newHour24 = parseInt(newHour12, 10);
    if (newPeriod === "PM" && newHour24 !== 12) newHour24 += 12;
    if (newPeriod === "AM" && newHour24 === 12) newHour24 = 0;

    const formattedHour24 = String(newHour24).padStart(2, "0");
    onChange?.(`${formattedHour24}:${newMinute}`);
  };

  return (
    <div className="flex items-center gap-1 w-full">
      <select
        required={required}
        value={displayHour}
        onChange={(e) => handleTimeChange("hour", e.target.value)}
        onBlur={onBlur}
        className={`w-full text-sm bg-transparent focus:outline-none appearance-none text-center cursor-pointer ${!displayHour ? "text-gray-400" : "text-gray-900"}`}
      >
        <option value="" disabled className="text-gray-400">HH</option>
        {HOURS.map((h) => {
          const isPast = isHourPast(h);
          return (
            <option key={h} value={h} disabled={isPast} className={isPast ? "text-gray-300" : "text-gray-900"}>
              {h.padStart(2, "0")}
            </option>
          );
        })}
      </select>
      <span className="text-sm text-gray-900 font-semibold">:</span>
      <select
        required={required}
        value={currentMinute}
        onChange={(e) => handleTimeChange("minute", e.target.value)}
        onBlur={onBlur}
        className={`w-full text-sm bg-transparent focus:outline-none appearance-none text-center cursor-pointer ${!currentMinute ? "text-gray-400" : "text-gray-900"}`}
      >
        <option value="" disabled className="text-gray-400">MM</option>
        {MINUTES.map((m) => {
          const isPast = isMinutePast(m);
          const isBlocked = blockedMinutesForHour.has(m);
          const isDisabled = isPast || isBlocked;
          return (
            <option key={m} value={m} disabled={isDisabled} className={isDisabled ? "text-gray-300" : "text-gray-900"}>
              {m}{isBlocked && !isPast ? " (taken)" : ""}
            </option>
          );
        })}
      </select>
      <select
        required={required}
        value={currentPeriod}
        onChange={(e) => handleTimeChange("period", e.target.value)}
        onBlur={onBlur}
        className={`w-full text-sm bg-transparent focus:outline-none appearance-none text-center cursor-pointer ml-1 ${!currentPeriod ? "text-gray-400" : "text-gray-900"}`}
      >
        <option value="" disabled className="text-gray-400">--</option>
        {PERIODS.map((p) => {
          const isPast = isPeriodPast(p);
          return (
            <option key={p} value={p} disabled={isPast} className={isPast ? "text-gray-300" : "text-gray-900"}>
              {p}
            </option>
          );
        })}
      </select>
    </div>
  );
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getMinDate = () => {
  return getTodayInAppTimeZone();
};

// Returns current ET time as "HH:MM" in 24-hour format
const getCurrentETTime = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value || "00";
  const m = parts.find((p) => p.type === "minute")?.value || "00";
  // Handle "24" edge case from some runtimes
  return `${String(parseInt(h, 10) % 24).padStart(2, "0")}:${m}`;
};

const parseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const formatDateLong = (dateStr) => {
  const parsed = parseDate(dateStr);
  if (!parsed) return "";
  return parsed.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
};

const timeForInput = (timeStr) => {
  if (!timeStr) return "";
  return timeStr.substring(0, 5);
};

const toMonthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export function ScheduleSection({
  postType,
  formData,
  onChange,
  customDate,
  setCustomDate,
  customTime,
  setCustomTime,
  onAddCustomDate,
  onRemoveCustomDate,
  onUpdateCustomDateTime,
  onCheckAvailability,
  checkingAvailability,
  availabilityError,
  pastTimeError,
  fullyBookedDates,
  excludeAdId,
}) {
  const hasBookedDates = fullyBookedDates && fullyBookedDates.length > 0;
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [monthAvailability, setMonthAvailability] = useState({});
  const [monthAvailabilityError, setMonthAvailabilityError] = useState("");
  const [blockedTimesMap, setBlockedTimesMap] = useState({});
  const loadingMonthsRef = useRef(new Set());
  const monthAbortControllerRef = useRef(null);
  const currentMonthRef = useRef(parseDate(formData.post_date_from) || getTodayDateInAppTimeZone());

  const getWeekDateKeys = useCallback((dateKey) => {
    const parsed = parseDate(dateKey);
    if (!parsed) return [];
    const start = new Date(parsed);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }).map((_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return formatDateKeyFromDate(day);
    });
  }, []);

  const loadBlockedTimesForDate = useCallback(
    async (dateKey) => {
      if (!dateKey) return;
      const times = await fetchDateBlockedTimes({ date: dateKey, excludeAdId });
      setBlockedTimesMap((prev) => ({ ...prev, [dateKey]: times }));
    },
    [excludeAdId],
  );

  const loadMonthAvailability = useCallback(
    async (monthDate) => {
      const monthKey = toMonthKey(monthDate);
      // Track the latest requested month for retry
      currentMonthRef.current = monthDate;
      if (loadingMonthsRef.current.has(monthKey)) {
        return;
      }

      loadingMonthsRef.current.add(monthKey);
      setCalendarLoading(true);
      setMonthAvailabilityError("");

      if (monthAbortControllerRef.current) {
        monthAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      monthAbortControllerRef.current = controller;

      try {
        const results = await fetchMonthAvailability({
          monthDate,
          excludeAdId,
          signal: controller.signal,
        });
        setMonthAvailability((current) => ({ ...current, ...results }));
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.error("[ScheduleSection] Failed to load monthly availability:", error?.message || error);
          setMonthAvailabilityError("Unable to load monthly availability right now.");
        }
      } finally {
        loadingMonthsRef.current.delete(monthKey);
        setCalendarLoading(loadingMonthsRef.current.size > 0);
      }
    },
    [excludeAdId],
  );

  useEffect(() => {
    loadingMonthsRef.current.clear();
    setMonthAvailability({});
    setMonthAvailabilityError("");
    setBlockedTimesMap({});
    void loadMonthAvailability(
      parseDate(formData.post_date_from) || getTodayDateInAppTimeZone(),
    );
  }, [excludeAdId, formData.post_date_from, loadMonthAvailability]);

  useEffect(() => {
    if (postType !== "Multi-week booking (TBD)") {
      return;
    }

    const weeks = Math.min(12, Math.max(1, Number(formData.multi_week_weeks || 4) || 4));
    const overrides = Array.isArray(formData.multi_week_overrides)
      ? formData.multi_week_overrides
      : [];

    const normalized = Array.from({ length: weeks }).map((_, index) => {
      const existing = overrides[index] && typeof overrides[index] === "object" ? overrides[index] : {};
      return {
        ad_name: String(existing.ad_name || ""),
        ad_text: String(existing.ad_text || ""),
        use_base_media: existing.use_base_media !== false,
        media: Array.isArray(existing.media) ? existing.media : [],
      };
    });

    const needsUpdate =
      overrides.length !== weeks ||
      overrides.some((entry, index) => {
        const normalizedEntry = normalized[index];
        if (!entry || typeof entry !== "object") return true;
        if (String(entry.ad_name || "") !== normalizedEntry.ad_name) return true;
        if (String(entry.ad_text || "") !== normalizedEntry.ad_text) return true;
        if ((entry.use_base_media !== false) !== normalizedEntry.use_base_media) return true;
        if (!Array.isArray(entry.media)) return true;
        return false;
      });

    if (needsUpdate) {
      onChange("multi_week_overrides", normalized);
    }
  }, [formData.multi_week_overrides, formData.multi_week_weeks, onChange, postType]);

  useEffect(() => {
    if (!formData.post_date_from) {
      return;
    }

    const weekKeys = getWeekDateKeys(formData.post_date_from);
    if (weekKeys.length === 0) {
      return;
    }

    const first = weekKeys[0];
    const last = weekKeys[weekKeys.length - 1];
    const firstDate = parseDate(first);
    const lastDate = parseDate(last);
    if (!firstDate || !lastDate) {
      return;
    }

    void loadMonthAvailability(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1));
    if (firstDate.getMonth() !== lastDate.getMonth() || firstDate.getFullYear() !== lastDate.getFullYear()) {
      void loadMonthAvailability(new Date(lastDate.getFullYear(), lastDate.getMonth(), 1));
    }
  }, [formData.post_date_from, getWeekDateKeys, loadMonthAvailability]);

  // Fetch blocked times for One-Time Post when the date is set
  useEffect(() => {
    if (postType === "One-Time Post" && formData.post_date_from) {
      void loadBlockedTimesForDate(formData.post_date_from);
    }
  }, [postType, formData.post_date_from, loadBlockedTimesForDate]);

  // Auto-seed one empty slot when switching to Custom Schedule (Issue #11)
  useEffect(() => {
    if (
      postType === "Custom Schedule" &&
      (!formData.custom_dates || formData.custom_dates.length === 0)
    ) {
      onChange("custom_dates", [{ date: "", time: "", reminder: "15-min" }]);
    }
  }, [postType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (monthAbortControllerRef.current) {
        monthAbortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!pastTimeError) {
      return;
    }

    appToast.error({
      title: "Invalid post time",
      description: pastTimeError,
    });
  }, [pastTimeError]);

  useEffect(() => {
    if (!availabilityError || hasBookedDates) {
      return;
    }

    appToast.error({
      title: "Date unavailable",
      description: availabilityError,
    });
  }, [availabilityError, hasBookedDates]);

  const blockedDates = monthAvailability || {};

  const availabilityChecking = checkingAvailability || calendarLoading;

  const triggerAvailabilityCheck = () => {
    if (onCheckAvailability) {
      window.setTimeout(() => {
        void onCheckAvailability();
      }, 0);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Schedule</h3>
      <p className="text-xs text-gray-500 mb-4">
        All times are in New York time (ET)
      </p>

      {postType === "Multi-week booking (TBD)" && (
        <>
          {(() => {
            const weeksValue = Math.min(12, Math.max(1, Number(formData.multi_week_weeks || 4) || 4));

            return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Weeks <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={12}
                value={weeksValue}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  const clamped = Number.isFinite(next) ? Math.min(12, Math.max(1, Math.floor(next))) : 1;
                  onChange("multi_week_weeks", clamped);
                }}
                className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-2">Creates one TBD ad per week (1–12).</p>
            </div>

            <AvailabilityDateField
              label="Week 1 start (week of)"
              required
              value={formData.series_week_start}
              onChange={(value) => onChange("series_week_start", value)}
              minDate={getMinDate()}
              blockedDates={{}}
              onLoadMonth={loadMonthAvailability}
              placeholder="Select week start"
              helperText="This is just an anchor for Week 1; each week will be scheduled later."
            />
          </div>
            );
          })()}

          <div className="mt-5 border border-gray-200 rounded-xl bg-white p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Per-week overrides</h4>
                <p className="text-xs text-gray-500">
                  Each week inherits the base ad. Leave overrides blank to reuse it.
                </p>
              </div>
            </div>

            {(() => {
              const weeks = Math.min(12, Math.max(1, Number(formData.multi_week_weeks || 4) || 4));
              const baseWeekStart = String(formData.series_week_start || "").slice(0, 10);
              const overrides = Array.isArray(formData.multi_week_overrides)
                ? formData.multi_week_overrides
                : [];

              const normalizedOverrides = Array.from({ length: weeks }).map((_, index) => {
                const existing = overrides[index] && typeof overrides[index] === "object" ? overrides[index] : {};
                return {
                  ad_name: String(existing.ad_name || ""),
                  ad_text: String(existing.ad_text || ""),
                  use_base_media: existing.use_base_media !== false,
                  media: Array.isArray(existing.media) ? existing.media : [],
                };
              });

              const computeWeekStart = (startKey, index) => {
                const parsed = parseDate(startKey);
                if (!parsed) return "";
                const d = new Date(parsed);
                d.setDate(d.getDate() + index * 7);
                return formatDateKeyFromDate(d);
              };

              return (
                <div className="space-y-4">
                  {normalizedOverrides.map((entry, index) => {
                    const weekStartKey = baseWeekStart ? computeWeekStart(baseWeekStart, index) : "";
                    const label = weekStartKey ? formatDateLong(weekStartKey) : "—";

                    return (
                      <div key={index} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              Week {index + 1} <span className="text-gray-500 font-medium">• week of {label}</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">Schedule: TBD</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="border border-gray-200 rounded-lg bg-white px-3 pt-3 pb-2.5">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Override Ad Name (optional)
                            </label>
                            <input
                              type="text"
                              value={entry.ad_name}
                              onChange={(e) => {
                                const next = [...normalizedOverrides];
                                next[index] = { ...next[index], ad_name: e.target.value };
                                onChange("multi_week_overrides", next);
                              }}
                              placeholder="Leave blank to use base"
                              className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                            />
                          </div>

                          <div className="border border-gray-200 rounded-lg bg-white px-3 pt-3 pb-2.5">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Attachments
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={!entry.use_base_media}
                                onChange={(e) => {
                                  const next = [...normalizedOverrides];
                                  const enableOverride = Boolean(e.target.checked);
                                  const baseMedia = Array.isArray(formData.media) ? formData.media : [];
                                  const existingMedia = Array.isArray(next[index].media) ? next[index].media : [];
                                  next[index] = {
                                    ...next[index],
                                    use_base_media: !enableOverride,
                                    media: enableOverride && existingMedia.length === 0 ? baseMedia : existingMedia,
                                  };
                                  onChange("multi_week_overrides", next);
                                }}
                              />
                              Use different attachments this week
                            </label>
                            <p className="text-xs text-gray-500 mt-2">
                              Unchecked = uses the base attachments. Checked = customize attachments for this week.
                            </p>
                          </div>
                        </div>

                        <div className="mt-3">
                          <AdTextEditor
                            label="Ad Text"
                            name={`multi_week_overrides_${index}_ad_text`}
                            value={entry.ad_text}
                            onChange={(nextText) => {
                              const next = [...normalizedOverrides];
                              next[index] = { ...next[index], ad_text: nextText };
                              onChange("multi_week_overrides", next);
                            }}
                          />
                          <p className="text-xs text-gray-500 mt-2">
                            Leave blank to use the base ad text.
                          </p>
                        </div>

                        {!entry.use_base_media ? (
                          <div className="mt-3">
                            <MediaUploadSection
                              media={entry.media}
                              inputId={`media-upload-week-${index}`}
                              onAddMedia={(mediaItem) => {
                                const next = [...normalizedOverrides];
                                const nextMedia = [...(next[index].media || []), mediaItem];
                                next[index] = { ...next[index], media: nextMedia, use_base_media: false };
                                onChange("multi_week_overrides", next);
                              }}
                              onRemoveMedia={(removeIndex) => {
                                const next = [...normalizedOverrides];
                                const nextMedia = (next[index].media || []).filter((_, i) => i !== removeIndex);
                                next[index] = { ...next[index], media: nextMedia, use_base_media: false };
                                onChange("multi_week_overrides", next);
                              }}
                              showAlert={() => {}}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

        </>
      )}

      {postType === "One-Time Post" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_160px] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-y-3 gap-x-3">
            <AvailabilityDateField
              label="Post Date"
              required
              value={formData.post_date_from}
              onChange={(value) => {
                onChange("post_date_from", value);
                triggerAvailabilityCheck();
              }}
              minDate={getMinDate()}
              blockedDates={blockedDates}
              onLoadMonth={loadMonthAvailability}
              placeholder="Select date"
            />

            <div className={`relative rounded-lg px-4 pt-4 pb-3 transition-all ${blockedDates[formData.post_date_from] ? "bg-red-50 border border-red-200" : "bg-white border border-gray-200 hover:border-gray-300 focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0"}`}>
              <label className={`block text-xs font-semibold mb-1 ${blockedDates[formData.post_date_from] ? "text-red-700" : "text-gray-700"}`}>
                Post Time (ET) <span className="text-red-500">*</span>
              </label>
              {blockedDates[formData.post_date_from] ? (
                <p className="text-xs font-medium text-red-600">All slots are taken on that day — please choose a different date.</p>
              ) : (
                <>
                  <div className="flex items-center gap-1 pr-6">
                    <TimeSelect
                      required
                      value={timeForInput(formData.post_time)}
                      onChange={(val) => onChange("post_time", val)}
                      onBlur={triggerAvailabilityCheck}
                      blockedTimes={blockedTimesMap[formData.post_date_from] || []}
                      minTime={formData.post_date_from === getTodayInAppTimeZone() ? getCurrentETTime() : null}
                    />
                  </div>
                  <Clock size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  {availabilityChecking ? (
                    <p className="text-xs text-gray-500 mt-1">Checking availability...</p>
                  ) : null}
                </>
              )}
            </div>

            <div className="relative border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Reminder
              </label>
              <div className="relative">
                <select
                  value={formData.reminder_minutes}
                  onChange={(e) => onChange("reminder_minutes", e.target.value)}
                  className="w-full text-sm text-gray-900 bg-transparent focus:outline-none appearance-none cursor-pointer pr-6 font-medium"
                >
                  <option value="15-min">15 min before</option>
                  <option value="30-min">30 min before</option>
                  <option value="1-hour">1 hour before</option>
                  <option value="custom">Custom</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center">
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          {formData.post_date_from ? (
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">This week’s load (booked/limit)</div>
              <div className="grid grid-cols-7 gap-1">
                {getWeekDateKeys(formData.post_date_from).map((dateKey) => {
                  const info = blockedDates?.[dateKey] || null;
                  const bookedCountRaw = info?.bookedCount ?? info?.booked_count ?? info?.total_ads_on_date;
                  const limitRaw = info?.limit ?? info?.max_ads_per_day;
                  const bookedCount = Number.isFinite(Number(bookedCountRaw)) ? Number(bookedCountRaw) : null;
                  const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : null;
                  const isFull = Boolean(info?.is_full);

                  return (
                    <div
                      key={dateKey}
                      className={[
                        "rounded-md px-2 py-1 text-center border",
                        dateKey === formData.post_date_from ? "bg-white border-gray-900" : "bg-white border-gray-200",
                        isFull ? "opacity-60" : "",
                      ].join(" ")}
                      title={isFull ? "Full" : "Available"}
                    >
                      <div className="text-[11px] text-gray-600">{weekdayLabels[new Date(`${dateKey}T00:00:00`).getDay()]}</div>
                      <div className="text-xs font-semibold text-gray-900">{String(dateKey).slice(8, 10)}</div>
                      <div className="text-[11px] text-gray-600">
                        {bookedCount !== null && limit !== null ? `${bookedCount}/${limit}` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Pick a quieter day by choosing a date with a lower booked count.
              </p>
            </div>
          ) : null}
        </>
      )}

      {postType === "Daily Run" && (
        <>
          <div className="space-y-4 w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AvailabilityDateField
                label="Start Date"
                required
                value={formData.post_date_from}
                onChange={(value) => {
                  onChange("post_date_from", value);
                  triggerAvailabilityCheck();
                }}
                minDate={getMinDate()}
                blockedDates={blockedDates}
                onLoadMonth={loadMonthAvailability}
                placeholder="Select start date"
              />

              <AvailabilityDateField
                label="End Date"
                required
                value={formData.post_date_to}
                onChange={(value) => {
                  onChange("post_date_to", value);
                  triggerAvailabilityCheck();
                }}
                minDate={formData.post_date_from || getMinDate()}
                blockedDates={blockedDates}
                onLoadMonth={loadMonthAvailability}
                placeholder="Select end date"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_160px] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-y-3 gap-x-3">
              <div className="relative border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Post Time (ET) <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-1 pr-6">
                  <TimeSelect
                    required
                    value={timeForInput(formData.post_time)}
                    onChange={(val) => onChange("post_time", val)}
                    onBlur={triggerAvailabilityCheck}
                    minTime={formData.post_date_from === getTodayInAppTimeZone() ? getCurrentETTime() : null}
                  />
                </div>
                <Clock size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              <div className="relative border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Reminder
                </label>
                <div className="relative">
                  <select
                    value={formData.reminder_minutes}
                    onChange={(e) => onChange("reminder_minutes", e.target.value)}
                    className="w-full text-sm text-gray-900 bg-transparent focus:outline-none appearance-none cursor-pointer pr-6 font-medium"
                  >
                    <option value="15-min">15 min before</option>
                    <option value="30-min">30 min before</option>
                    <option value="1-hour">1 hour before</option>
                    <option value="custom">Custom</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center">
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {availabilityChecking ? (
            <p className="text-xs text-gray-500 mt-2">Checking availability...</p>
          ) : null}
        </>
      )}

      {postType === "Custom Schedule" && (
        <div className="space-y-4">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Post Date, Time & Reminder</h3>
          </div>

          {formData.custom_dates.map((entry, index) => {
            const dateStr = typeof entry === "object" && entry !== null ? entry.date : entry;
            const fallbackTime = String(formData.post_time || "").trim();
            const timeStr =
              typeof entry === "object" && entry !== null
                ? entry.time || entry.post_time || fallbackTime
                : fallbackTime;
            const reminderStr = typeof entry === "object" && entry !== null ? (entry.reminder || "15-min") : "15-min";
            const isDateFull = Boolean(dateStr && blockedDates[dateStr]);

            return (
              <div
                key={index}
                className={`border rounded-xl px-4 py-3 transition-all ${isDateFull ? "bg-red-50 border-red-200" : "bg-white border-gray-200 hover:border-gray-300"}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Date {index + 1}
                    </span>
                    {isDateFull && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full">
                        All slots taken
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newDates = [...formData.custom_dates];
                      newDates.splice(index, 1);
                      onChange("custom_dates", newDates);
                      triggerAvailabilityCheck();
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_160px] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-y-3 gap-x-3">
                  <AvailabilityDateField
                    label="Date"
                    variant="subtle"
                    value={dateStr}
                    onChange={(val) => {
                      const newDates = [...formData.custom_dates];
                      const currentEntry = typeof newDates[index] === "object" && newDates[index] !== null
                        ? { ...newDates[index] }
                        : { date: dateStr, time: timeStr, reminder: reminderStr };
                      currentEntry.date = val;
                      newDates[index] = currentEntry;
                      onChange("custom_dates", newDates);
                      triggerAvailabilityCheck();
                      void loadBlockedTimesForDate(val);
                    }}
                    minDate={getMinDate()}
                    blockedDates={blockedDates}
                    onLoadMonth={loadMonthAvailability}
                    placeholder="Select date"
                  />

                  <div className="relative rounded-lg bg-red-50 border border-red-100 px-4 pt-4 pb-3 transition-all md:col-span-2" style={isDateFull ? {} : { display: "none" }}>
                    <p className="text-xs font-semibold text-red-700">All slots are taken on that day — please choose a different date.</p>
                  </div>

                  {!isDateFull && (
                  <div className="relative rounded-lg bg-gray-50 px-3 pt-2.5 pb-2 focus-within:bg-white focus-within:ring-1 focus-within:ring-gray-900 transition-all">
                    <label className="block text-xs font-semibold text-gray-700 mb-0.5">Time (ET)</label>
                    <div className="flex items-center gap-1 pr-6 mt-0.5">
                      <TimeSelect
                        value={timeForInput(timeStr)}
                        onChange={(val) => {
                          const newDates = [...formData.custom_dates];
                          const currentEntry = typeof newDates[index] === "object" && newDates[index] !== null
                            ? { ...newDates[index] }
                            : { date: dateStr, time: timeStr, reminder: reminderStr };
                          currentEntry.time = val && val.length === 5 ? `${val}:00` : val;
                          newDates[index] = currentEntry;
                          onChange("custom_dates", newDates);
                          triggerAvailabilityCheck();
                        }}
                        blockedTimes={blockedTimesMap[dateStr] || []}
                        minTime={dateStr === getTodayInAppTimeZone() ? getCurrentETTime() : null}
                      />
                    </div>
                    <Clock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  )}

                  {!isDateFull && (
                  <div className="relative rounded-lg bg-gray-50 px-3 pt-2.5 pb-2 focus-within:bg-white focus-within:ring-1 focus-within:ring-gray-900 transition-all">
                    <label className="block text-xs font-semibold text-gray-700 mb-0.5">Reminder</label>
                    <div className="relative mt-0.5">
                      <select
                        value={reminderStr}
                        onChange={(e) => {
                          const newDates = [...formData.custom_dates];
                          const currentEntry = typeof newDates[index] === "object" && newDates[index] !== null
                            ? { ...newDates[index] }
                            : { date: dateStr, time: timeStr, reminder: reminderStr };
                          currentEntry.reminder = e.target.value;
                          newDates[index] = currentEntry;
                          onChange("custom_dates", newDates);
                        }}
                        className="w-full text-sm text-gray-900 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer relative z-10"
                      >
                        <option value="15-min">15 min before</option>
                        <option value="30-min">30 min before</option>
                        <option value="1-hour">1 hour before</option>
                        <option value="custom">Custom</option>
                      </select>
                      <ChevronDown size={16} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-0" />
                    </div>
                  </div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                const newDates = [...(formData.custom_dates || [])];
                newDates.push({ date: "", time: "", reminder: "15-min" });
                onChange("custom_dates", newDates);
              }}
              className="px-4 py-2 border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <span className="text-lg leading-none mt-[-2px]">+</span> Add another date
            </button>
          </div>

          {availabilityChecking ? (
            <p className="text-xs text-gray-500 mt-2">Checking availability...</p>
          ) : null}
        </div>
      )}

      {hasBookedDates ? (
        <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-lg mt-4">
          <div className="flex items-start gap-2">
            <span className="text-red-600 flex-shrink-0 mt-0.5 text-base">X</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-900">
                The following dates have reached the ad limit:
              </p>
              <ul className="mt-2 space-y-1">
                {fullyBookedDates.map((date) => (
                  <li key={date} className="text-sm text-red-700">
                    {formatDateLong(date)}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-red-700 mt-2">Please choose different dates.</p>
            </div>
          </div>
        </div>
      ) : null}

      {monthAvailabilityError ? (
        <div className="bg-amber-50 border border-amber-200 px-4 py-3 rounded-lg mt-4 text-sm text-amber-700 flex items-center justify-between gap-3">
          <span>{monthAvailabilityError}</span>
          <button
            type="button"
            onClick={() => {
              loadedMonthsRef.current.delete(toMonthKey(currentMonthRef.current));
              setMonthAvailabilityError("");
              void loadMonthAvailability(currentMonthRef.current);
            }}
            className="shrink-0 text-xs font-semibold text-amber-800 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
