import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDateKeyFromDate, getTodayDateInAppTimeZone, getTodayInAppTimeZone } from "@/lib/timezone";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

export function AvailabilityDateField({
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
  disabled = false,
}) {
  const containerClasses =
    variant === "subtle"
      ? "rounded-lg bg-gray-50 px-3 pt-2.5 pb-2 focus-within:bg-white focus-within:ring-1 focus-within:ring-gray-900 transition-all"
      : "border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0";

  const fieldRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => parseDate(value) || getTodayDateInAppTimeZone());

  useEffect(() => {
    const selectedDate = parseDate(value);
    if (selectedDate) {
      setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [value]);

  useEffect(() => {
    if (visibleMonth instanceof Date && !Number.isNaN(visibleMonth.valueOf())) {
      return;
    }
    setVisibleMonth(parseDate(value) || getTodayDateInAppTimeZone());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMonth]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

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

  const minDateValue = String(minDate || getTodayInAppTimeZone()).slice(0, 10);
  const minMonthDate = parseDate(minDateValue);
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
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          className={`w-full flex items-center justify-between gap-3 text-left text-sm ${disabled ? "text-gray-400 cursor-not-allowed" : "text-gray-900"}`}
        >
          <span className={disabled ? "text-gray-400" : value ? "text-gray-900" : "text-gray-400"}>
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
                setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))
              }
              disabled={!canGoPreviousMonth}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="text-sm font-semibold text-gray-900">{formatMonthLabel(visibleMonth)}</div>

            <button
              type="button"
              onClick={() =>
                setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekdayLabels.map((labelText) => (
              <div key={labelText} className="text-[11px] font-semibold text-center text-gray-500 py-1">
                {labelText}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="h-11" />;
              }

              const dateKey = formatDateKeyFromDate(day);
              const blockedInfo = blockedDates?.[dateKey];
              const isBlocked = Boolean(blockedInfo?.is_full || blockedInfo?.blocked);
              const isPast = dateKey < minDateValue;
              const isDisabled = isPast || isBlocked;
              const isSelected = value === dateKey;

              const bookedCountRaw =
                blockedInfo?.bookedCount ?? blockedInfo?.booked_count ?? blockedInfo?.total_ads_on_date;
              const limitRaw = blockedInfo?.limit ?? blockedInfo?.max_ads_per_day;
              const bookedCount = Number.isFinite(Number(bookedCountRaw)) ? Number(bookedCountRaw) : null;
              const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : null;
              const countLabel = bookedCount !== null && limit !== null ? `${bookedCount}/${limit}` : null;

              const className = [
                "h-11 rounded-lg text-sm flex flex-col items-center justify-center leading-none",
                isSelected ? "bg-gray-900 text-white font-semibold" : "",
                !isSelected && !isDisabled ? "text-gray-900 hover:bg-gray-100" : "",
                isPast ? "bg-gray-50 text-gray-300 cursor-not-allowed" : "",
                isBlocked ? "bg-red-50 text-red-400 line-through cursor-not-allowed border border-red-100" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => !isDisabled && handleSelectDate(dateKey)}
                  disabled={isDisabled}
                  className={className}
                  title={countLabel ? `Booked ${countLabel}` : undefined}
                >
                  <span className="leading-none">{day.getDate()}</span>
                  {countLabel ? (
                    <span className={isSelected ? "text-[9px] text-white/80" : "text-[9px] text-gray-400"}>
                      {countLabel}
                    </span>
                  ) : (
                    <span className="text-[9px] leading-none opacity-0">0/0</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
