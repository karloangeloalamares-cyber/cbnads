import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X, ChevronDown } from "lucide-react";
import { fetchMonthAvailability } from "@/lib/adAvailabilityClient";
import { appToast } from "@/lib/toast";
import {
  formatDateKeyFromDate,
  getTodayDateInAppTimeZone,
  getTodayInAppTimeZone,
} from "@/lib/timezone";

const HOURS = Array.from({ length: 12 }).map((_, i) => String(i === 0 ? 12 : i));
const MINUTES = ["00", "15", "30", "45"];
const PERIODS = ["AM", "PM"];

function TimeSelect({ value, onChange, onBlur, required }) {
  // value is expected to be "HH:MM" (24-hour format)
  const currentHour24 = value ? parseInt(value.split(":")[0], 10) : null;
  const currentMinute = value ? value.split(":")[1] : "";

  const currentPeriod = value ? (currentHour24 !== null && currentHour24 >= 12 ? "PM" : "AM") : "";
  let currentHour12 = currentHour24 !== null ? currentHour24 % 12 : "";
  if (currentHour12 === 0 && currentHour24 !== null) currentHour12 = 12;
  const displayHour = currentHour12 ? String(currentHour12) : "";

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
        {HOURS.map((h) => (
          <option key={h} value={h} className="text-gray-900">{h.padStart(2, "0")}</option>
        ))}
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
        {MINUTES.map((m) => (
          <option key={m} value={m} className="text-gray-900">{m}</option>
        ))}
      </select>
      <select
        required={required}
        value={currentPeriod}
        onChange={(e) => handleTimeChange("period", e.target.value)}
        onBlur={onBlur}
        className={`w-full text-sm bg-transparent focus:outline-none appearance-none text-center cursor-pointer ml-1 ${!currentPeriod ? "text-gray-400" : "text-gray-900"}`}
      >
        <option value="" disabled className="text-gray-400">--</option>
        {PERIODS.map((p) => (
          <option key={p} value={p} className="text-gray-900">{p}</option>
        ))}
      </select>
    </div>
  );
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getMinDate = () => {
  return getTodayInAppTimeZone();
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

const formatMonthLabel = (date) =>
  date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

const timeForInput = (timeStr) => {
  if (!timeStr) return "";
  return timeStr.substring(0, 5);
};

const toMonthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const buildCalendarDays = (month) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const cells = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

function AvailabilityDateField({
  label,
  value,
  onChange,
  minDate,
  blockedDates,
  onLoadMonth,
  required,
  placeholder,
  helperText,
  variant = "default",
}) {
  const containerClasses = variant === "subtle"
    ? "rounded-lg bg-gray-50 px-4 pt-4 pb-3 focus-within:bg-white focus-within:ring-1 focus-within:ring-gray-900 transition-all"
    : "border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0";

  const fieldRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () => parseDate(value) || getTodayDateInAppTimeZone(),
  );

  useEffect(() => {
    const selectedDate = parseDate(value);
    if (selectedDate) {
      setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [value]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (fieldRef.current && !fieldRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open && onLoadMonth) {
      void onLoadMonth(visibleMonth);
    }
  }, [open, onLoadMonth, visibleMonth]);

  const minDateValue = minDate || getMinDate();
  const minMonthDate = parseDate(minDateValue) || parseDate(getMinDate());
  const canGoPreviousMonth =
    !minMonthDate ||
    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1) >
    new Date(minMonthDate.getFullYear(), minMonthDate.getMonth(), 1);

  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

  const handleSelectDate = (dateKey) => {
    onChange(dateKey);
    setOpen(false);
  };

  return (
    <div className="relative" ref={fieldRef}>
      <div className={containerClasses}>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </label>

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="w-full flex items-center justify-between gap-3 text-left text-sm text-gray-900"
        >
          <span className={value ? "text-gray-900" : "text-gray-400"}>
            {value ? formatDateLong(value) : placeholder || "Select date"}
          </span>
          <CalendarDays size={16} className="text-gray-400" />
        </button>

        {helperText ? <p className="text-xs text-gray-500 mt-2">{helperText}</p> : null}
      </div>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-[294px] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() =>
                canGoPreviousMonth &&
                setVisibleMonth(
                  new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1),
                )
              }
              disabled={!canGoPreviousMonth}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="text-sm font-semibold text-gray-900">
              {formatMonthLabel(visibleMonth)}
            </div>

            <button
              type="button"
              onClick={() =>
                setVisibleMonth(
                  new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1),
                )
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekdayLabels.map((labelText) => (
              <div
                key={labelText}
                className="text-[11px] font-semibold text-center text-gray-500 py-1"
              >
                {labelText}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="h-9" />;
              }

              const dateKey = formatDateKeyFromDate(day);
              const blockedInfo = blockedDates?.[dateKey];
              const isBlocked = Boolean(blockedInfo?.is_full || blockedInfo?.blocked);
              const isPast = dateKey < minDateValue;
              const isDisabled = isPast || isBlocked;
              const isSelected = value === dateKey;

              const className = [
                "h-9 rounded-lg text-sm flex items-center justify-center",
                isSelected ? "bg-gray-900 text-white font-semibold" : "",
                !isSelected && !isDisabled ? "text-gray-900 hover:bg-gray-100" : "",
                isPast ? "bg-gray-50 text-gray-300 cursor-not-allowed" : "",
                isBlocked
                  ? "bg-red-50 text-red-400 line-through cursor-not-allowed border border-red-100"
                  : "",
              ]
                .filter(Boolean)
                .join(" ");

              if (isDisabled) {
                const tooltipText = isBlocked
                  ? blockedInfo?.tooltip || "Ad limit reached"
                  : "Past dates unavailable";

                return (
                  <div
                    key={dateKey}
                    title={tooltipText}
                    aria-disabled="true"
                    className={className}
                  >
                    {day.getDate()}
                  </div>
                );
              }

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => handleSelectDate(dateKey)}
                  className={className}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
  const loadedMonthsRef = useRef(new Set());
  const loadingMonthsRef = useRef(new Set());
  const monthAbortControllerRef = useRef(null);
  const currentMonthRef = useRef(parseDate(formData.post_date_from) || getTodayDateInAppTimeZone());

  const loadMonthAvailability = useCallback(
    async (monthDate) => {
      const monthKey = toMonthKey(monthDate);
      // Track the latest requested month for retry
      currentMonthRef.current = monthDate;
      if (
        loadedMonthsRef.current.has(monthKey) ||
        loadingMonthsRef.current.has(monthKey)
      ) {
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
        loadedMonthsRef.current.add(monthKey);
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
    loadedMonthsRef.current.clear();
    loadingMonthsRef.current.clear();
    setMonthAvailability({});
    setMonthAvailabilityError("");
    void loadMonthAvailability(
      parseDate(formData.post_date_from) || getTodayDateInAppTimeZone(),
    );
  }, [excludeAdId, formData.post_date_from, loadMonthAvailability]);

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

  const blockedDates = useMemo(() => {
    return Object.fromEntries(
      Object.entries(monthAvailability).filter(([, info]) => info?.is_full),
    );
  }, [monthAvailability]);

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
                />
              </div>
              <Clock size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              {availabilityChecking ? (
                <p className="text-xs text-gray-500 mt-1">Checking availability...</p>
              ) : null}
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
            const timeStr = typeof entry === "object" && entry !== null ? entry.time : "";
            const reminderStr = typeof entry === "object" && entry !== null ? (entry.reminder || "15-min") : "15-min";

            return (
              <div
                key={index}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Date {index + 1}
                  </span>
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
                    }}
                    minDate={getMinDate()}
                    blockedDates={blockedDates}
                    onLoadMonth={loadMonthAvailability}
                    placeholder="Select date"
                  />

                  <div className="relative rounded-lg bg-gray-50 px-4 pt-4 pb-3 focus-within:bg-white focus-within:ring-1 focus-within:ring-gray-900 transition-all">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Time (ET)</label>
                    <div className="flex items-center gap-1 pr-6">
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
                      />
                    </div>
                    <Clock size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>

                  <div className="relative rounded-lg bg-gray-50 px-4 pt-4 pb-3 focus-within:bg-white focus-within:ring-1 focus-within:ring-gray-900 transition-all">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Reminder</label>
                    <div className="relative">
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
