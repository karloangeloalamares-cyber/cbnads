import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { fetchMonthAvailability } from "@/lib/adAvailabilityClient";
import { appToast } from "@/lib/toast";
import {
  formatDateKeyFromDate,
  getTodayDateInAppTimeZone,
  getTodayInAppTimeZone,
} from "@/lib/timezone";

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
}) {
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
      <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
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
  const loadedMonthsRef = useRef(new Set());
  const loadingMonthsRef = useRef(new Set());

  const loadMonthAvailability = useCallback(
    async (monthDate) => {
      const monthKey = toMonthKey(monthDate);
      if (
        loadedMonthsRef.current.has(monthKey) ||
        loadingMonthsRef.current.has(monthKey)
      ) {
        return;
      }

      loadingMonthsRef.current.add(monthKey);
      setCalendarLoading(true);

      try {
        const results = await fetchMonthAvailability({
          monthDate,
          excludeAdId,
        });
        loadedMonthsRef.current.add(monthKey);
        setMonthAvailability((current) => ({ ...current, ...results }));
      } catch (error) {
        console.error("Failed to load monthly availability:", error);
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
    void loadMonthAvailability(
      parseDate(formData.post_date_from) || getTodayDateInAppTimeZone(),
    );
  }, [excludeAdId, formData.post_date_from, loadMonthAvailability]);

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Post Time (ET) <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                required
                value={formData.post_time}
                onChange={(event) => onChange("post_time", event.target.value)}
                onBlur={triggerAvailabilityCheck}
                className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
              />
              {availabilityChecking ? (
                <p className="text-xs text-gray-500 mt-1">Checking availability...</p>
              ) : null}
            </div>
          </div>
        </>
      )}

      {postType === "Daily Run" && (
        <>
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

          {availabilityChecking ? (
            <p className="text-xs text-gray-500 mt-2">Checking availability...</p>
          ) : null}
        </>
      )}

      {postType === "Custom Schedule" && (
        <div>
          <div className="grid grid-cols-[1fr_140px_auto] gap-2 mb-3">
            <AvailabilityDateField
              label="Date"
              value={customDate}
              onChange={setCustomDate}
              minDate={getMinDate()}
              blockedDates={blockedDates}
              onLoadMonth={loadMonthAvailability}
              placeholder="Select date"
            />

            <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Time (ET)</label>
              <input
                type="time"
                value={customTime}
                onChange={(event) => setCustomTime(event.target.value)}
                className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                onAddCustomDate();
                triggerAvailabilityCheck();
              }}
              className="self-end px-6 py-3 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              Add
            </button>
          </div>

          {formData.custom_dates.length > 0 ? (
            <div className="space-y-2 mt-3">
              {formData.custom_dates.map((entry) => {
                const dateStr = typeof entry === "object" && entry !== null ? entry.date : entry;
                const timeStr = typeof entry === "object" && entry !== null ? entry.time : "";

                return (
                  <div
                    key={dateStr}
                    className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
                  >
                    <span className="text-sm text-gray-900 font-medium flex-1">
                      {formatDateLong(dateStr)}
                    </span>

                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-gray-400" />
                      <input
                        type="time"
                        value={timeForInput(timeStr)}
                        onChange={(event) => onUpdateCustomDateTime(dateStr, event.target.value)}
                        onBlur={triggerAvailabilityCheck}
                        className="text-sm text-gray-700 bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      />
                      {timeStr ? <span className="text-xs text-gray-500">ET</span> : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveCustomDate(dateStr)}
                      className="text-gray-400 hover:text-red-600 transition-colors text-lg leading-none"
                    >
                      x
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

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
    </div>
  );
}
