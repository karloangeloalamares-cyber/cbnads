import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appToast } from "@/lib/toast";
import { MediaUploadSection } from "@/components/SubmitAdForm/MediaUploadSection";
import CreateAdAdvertiserField from "@/components/CreateAdAdvertiserField";
import { AdTextEditor } from "@/components/SubmitAdForm/AdTextEditor";
import { AdPreview } from "@/components/SubmitAdForm/AdPreview";
import { AvailabilityDateField } from "@/components/SubmitAdForm/AvailabilityDateField";
import { TimeSelect } from "@/components/SubmitAdForm/ScheduleSection";
import { fetchDateBlockedTimes, fetchMonthAvailability } from "@/lib/adAvailabilityClient";
import { getTodayInAppTimeZone } from "@/lib/timezone";
import { Clock, ChevronDown } from "lucide-react";

const clampWeeks = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(12, Math.max(2, Math.floor(parsed)));
};

const addDaysToDateKey = (dateKey, days) => {
  const normalized = String(dateKey || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) return "";
  parsed.setDate(parsed.getDate() + Number(days || 0));
  return parsed.toISOString().slice(0, 10);
};

const adsSelectStyle = {
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 10 10\'%3E%3Cpath fill=\'%23666\' d=\'M5 7L1 3h8z\'/%3E%3C/svg%3E")',
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
  paddingRight: "40px",
};

const getCurrentETTime = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value || "00";
  const m = parts.find((p) => p.type === "minute")?.value || "00";
  return `${String(parseInt(h, 10) % 24).padStart(2, "0")}:${m}`;
};

const timeForInput = (timeStr) => {
  if (!timeStr) return "";
  return String(timeStr).slice(0, 5);
};

const toMonthKey = (dateKey) => String(dateKey || "").slice(0, 7);

const emptyOverride = () => ({
  product_id: "",
  placement: "",
  payment: "Unpaid",
  status: "Draft",
  ad_name: "",
  ad_text: "",
  media: [],
  schedule_tbd: false,
  post_date_from: "",
  post_time: "",
  reminder_minutes: "15-min",
});

export default function CreateMultiWeekSeries({
  advertisers,
  products,
  fetchWithSessionAuth,
  onCancel,
  onCreated,
  advertiserId,
  setAdvertiserId,
  onCreateNewAdvertiser,
  initialValues = null,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [weeks, setWeeks] = useState(4);
  const [seriesWeekStart, setSeriesWeekStart] = useState("");
  const [weekAds, setWeekAds] = useState([]);
  const [previewWeekIndex, setPreviewWeekIndex] = useState(null);
  const [seeded, setSeeded] = useState(false);
  const [monthAvailability, setMonthAvailability] = useState({});
  const [blockedTimesMap, setBlockedTimesMap] = useState({});
  const loadingMonthsRef = useRef(new Set());

  const normalizedWeeks = useMemo(() => clampWeeks(weeks), [weeks]);

  const placementOptions = useMemo(() => {
    const options = new Set(["WhatsApp", "Website"]);
    products.forEach((item) => {
      const placement = String(item?.placement || "").trim();
      if (placement) {
        options.add(placement);
      }
    });
    return [...options];
  }, [products]);

  const selectedAdvertiser = useMemo(
    () => advertisers.find((item) => String(item.id) === String(advertiserId)) || null,
    [advertiserId, advertisers],
  );

  useEffect(() => {
    setWeekAds((current) => {
      const next = Array.from({ length: normalizedWeeks }).map((_, index) => {
        const existing = current[index] && typeof current[index] === "object" ? current[index] : null;
        return existing
          ? {
              product_id: String(existing.product_id || ""),
              placement: String(existing.placement || ""),
              payment: String(existing.payment || "Unpaid"),
              status: String(existing.status || "Draft"),
              ad_name: String(existing.ad_name || ""),
              ad_text: String(existing.ad_text || ""),
              media: Array.isArray(existing.media) ? existing.media : [],
              schedule_tbd: Boolean(existing.schedule_tbd),
              post_date_from: String(existing.post_date_from || ""),
              post_time: String(existing.post_time || ""),
              reminder_minutes: String(existing.reminder_minutes || "15-min"),
            }
          : emptyOverride();
      });
      return next;
    });
  }, [normalizedWeeks]);

  const loadMonthAvailability = useCallback(
    async (monthDate) => {
      const monthKey = toMonthKey(monthDate instanceof Date ? monthDate.toISOString() : monthDate);
      if (!monthKey || loadingMonthsRef.current.has(monthKey)) {
        return;
      }

      loadingMonthsRef.current.add(monthKey);
      try {
        const results = await fetchMonthAvailability({ monthDate });
        setMonthAvailability((current) => ({ ...current, ...results }));
      } finally {
        loadingMonthsRef.current.delete(monthKey);
      }
    },
    [],
  );

  const loadBlockedTimesForDate = useCallback(async (dateKey) => {
    const normalizedDate = String(dateKey || "").slice(0, 10);
    if (!normalizedDate) return;
    const times = await fetchDateBlockedTimes({ date: normalizedDate });
    setBlockedTimesMap((prev) => ({ ...prev, [normalizedDate]: times }));
  }, []);

  useEffect(() => {
    if (!Array.isArray(products) || products.length === 0) {
      return;
    }

    setWeekAds((current) => {
      let changed = false;
      const next = current.map((entry) => {
        if (!entry || typeof entry !== "object") {
          return emptyOverride();
        }

        const productId = String(entry.product_id || "").trim();
        if (!productId) {
          return entry;
        }

        const product = products.find((item) => String(item.id) === productId) || null;
        const productPlacement = String(product?.placement || "").trim();
        const currentPlacement = String(entry.placement || "").trim();

        if (!productPlacement || currentPlacement) {
          return entry;
        }

        changed = true;
        return {
          ...entry,
          placement: productPlacement,
        };
      });

      return changed ? next : current;
    });
  }, [products]);

  useEffect(() => {
    setPreviewWeekIndex((current) => {
      if (typeof current !== "number") return null;
      if (current < 0 || current >= normalizedWeeks) return null;
      return current;
    });
  }, [normalizedWeeks]);

  useEffect(() => {
    setPreviewWeekIndex((current) => {
      if (typeof current === "number") return current;
      return normalizedWeeks > 0 ? 0 : null;
    });
  }, [normalizedWeeks]);

  useEffect(() => {
    if (seeded || !initialValues) {
      return;
    }
    setSeeded(true);

    if (initialValues.weeks) setWeeks(clampWeeks(initialValues.weeks));
    if (initialValues.series_week_start) setSeriesWeekStart(String(initialValues.series_week_start).slice(0, 10));

    const template = {
      product_id: String(initialValues.product_id || ""),
      placement: String(initialValues.placement || ""),
      payment: String(initialValues.payment || "Unpaid"),
      status: String(initialValues.status || "Draft"),
      ad_name: String(initialValues.ad_name || ""),
      ad_text: String(initialValues.ad_text || ""),
      media: Array.isArray(initialValues.media) ? initialValues.media : [],
      schedule_tbd: false,
      post_date_from: "",
      post_time: "",
      reminder_minutes: "15-min",
    };

    setWeekAds(
      Array.from({ length: clampWeeks(initialValues.weeks || weeks) }).map((_, index) => ({
        ...template,
        post_date_from: addDaysToDateKey(String(initialValues.series_week_start || seriesWeekStart), index * 7),
      })),
    );
  }, [initialValues, seeded]);

  useEffect(() => {
    setWeekAds((current) =>
      current.map((entry, index) => {
        if (String(entry?.post_date_from || "").trim()) {
          return entry;
        }

        return {
          ...entry,
          post_date_from: addDaysToDateKey(seriesWeekStart, index * 7),
        };
      }),
    );
  }, [seriesWeekStart]);

  useEffect(() => {
    if (!seriesWeekStart) {
      return;
    }
    void loadMonthAvailability(new Date(`${String(seriesWeekStart).slice(0, 10)}T00:00:00`));
  }, [loadMonthAvailability, seriesWeekStart]);

  useEffect(() => {
    const uniqueDates = Array.from(
      new Set(weekAds.map((entry) => String(entry?.post_date_from || "").slice(0, 10)).filter(Boolean)),
    );

    uniqueDates.forEach((dateKey) => {
      if (!blockedTimesMap[dateKey]) {
        void loadBlockedTimesForDate(dateKey);
      }
    });
  }, [blockedTimesMap, loadBlockedTimesForDate, weekAds]);

  const togglePreviewWeek = (index) => {
    setPreviewWeekIndex((current) => (current === index ? null : index));
  };

  const buildPreviewData = (index) => {
    const weekIndex = typeof index === "number" ? index : null;
    const advertiserName = selectedAdvertiser?.advertiser_name || selectedAdvertiser?.name || "";

    const week = weekIndex !== null ? weekAds[weekIndex] : null;
    const weekStart = weekIndex !== null ? addDaysToDateKey(seriesWeekStart, weekIndex * 7) : String(seriesWeekStart || "").slice(0, 10);

    return {
      advertiser_name: advertiserName,
      ad_name: String(week?.ad_name || "").trim(),
      ad_text: String(week?.ad_text || "").trim(),
      media: Array.isArray(week?.media) ? week.media : [],
      post_date_from: week?.schedule_tbd ? "" : String(week?.post_date_from || weekStart || ""),
      post_time: week?.schedule_tbd ? "" : String(week?.post_time || ""),
    };
  };

  const previewTitle =
    typeof previewWeekIndex === "number" ? `Preview: Week ${previewWeekIndex + 1}` : "Preview";

  const submit = async () => {
    if (submitting) return;
    if (!advertiserId) {
      appToast.error({ title: "Missing advertiser", description: "Select an advertiser." });
      return;
    }
    if (!String(seriesWeekStart || "").trim()) {
      appToast.error({ title: "Missing week start", description: "Select Week 1 start date." });
      return;
    }

    const missingWeekIndex = weekAds.findIndex(
      (item) =>
        !String(item?.ad_name || "").trim() ||
        !String(item?.product_id || "").trim() ||
        (!item?.schedule_tbd &&
          (!String(item?.post_date_from || "").trim() || !String(item?.post_time || "").trim())),
    );
    if (missingWeekIndex >= 0) {
      appToast.error({
        title: "Missing week details",
        description: `Week ${missingWeekIndex + 1} requires product, ad name, and either a schedule or TBD.`,
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetchWithSessionAuth("/api/ads/create-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advertiser_id: advertiserId,
          weeks: normalizedWeeks,
          series_week_start: String(seriesWeekStart).slice(0, 10),
          weeks_data: weekAds,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `Failed to create series (${response.status})`);
      }

      const data = await response.json();
      const seriesId = String(data?.series_id || "").trim();
      appToast.success({
        title: "Multi-week booking created",
        description: seriesId ? `Series ID: ${seriesId}` : `Created ${normalizedWeeks} ads`,
      });

      onCreated?.({ series_id: seriesId, ads: data?.ads || [] });
    } catch (error) {
      appToast.error({
        title: "Failed to create booking",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row">
      <div className="flex-1 px-8 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Create multi-week booking</h1>
              <p className="text-gray-600 text-sm mt-2">
                Create one ad per week. Set a schedule now or mark any week as TBD.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={submitting}
              >
                {submitting ? "Creating..." : "Create booking"}
              </button>
            </div>
          </div>

          <div className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Weeks</label>
              <input
                type="number"
                min={2}
                max={12}
                value={normalizedWeeks}
                onChange={(e) => setWeeks(e.target.value)}
                className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-2">2-12 weeks.</p>
            </div>
            <AvailabilityDateField
              label="Week 1 start (week of)"
              required
              value={String(seriesWeekStart || "").slice(0, 10)}
              onChange={(value) => setSeriesWeekStart(value)}
              blockedDates={{}}
              onLoadMonth={null}
              placeholder="Select week start"
              helperText="This is just an anchor for Week 1; each week will be scheduled later."
            />
          </div>

          <CreateAdAdvertiserField
            advertisers={advertisers}
            value={advertiserId}
            onChange={(id) => setAdvertiserId?.(id)}
            onCreateNew={() => onCreateNewAdvertiser?.()}
            disabled={submitting}
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Weeks</h3>
          <p className="text-xs text-gray-500 mb-4">
            Each week is its own ad. Set product, placement, payment, status, and content per week.
          </p>

          <div className="space-y-4">
            {weekAds.map((entry, index) => {
              const weekProduct =
                products.find((item) => String(item.id) === String(entry.product_id)) || null;

              return (
              <div key={index} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="text-sm font-semibold text-gray-900">Week {index + 1}</div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                    <input
                      type="checkbox"
                      checked={previewWeekIndex === index}
                      onChange={() => togglePreviewWeek(index)}
                    />
                    Preview
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Ad Product</label>
                    <select
                      value={entry.product_id}
                      onChange={(e) => {
                        const next = [...weekAds];
                        const nextProductId = e.target.value;
                        const nextProduct =
                          products.find((item) => String(item.id) === String(nextProductId)) || null;
                        const currentPlacement = String(next[index]?.placement || "").trim();
                        const currentProductPlacement = String(weekProduct?.placement || "").trim();
                        const shouldSyncPlacement =
                          !currentPlacement || currentPlacement === currentProductPlacement;
                        const nextPlacement = shouldSyncPlacement
                          ? String(nextProduct?.placement || "")
                          : next[index].placement;

                        next[index] = { ...next[index], product_id: nextProductId, placement: nextPlacement };
                        setWeekAds(next);
                      }}
                      className="w-full text-sm text-gray-900 bg-transparent focus:outline-none appearance-none cursor-pointer"
                      style={adsSelectStyle}
                    >
                      <option value="">Select product</option>
                      {products.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.product_name} - {item.placement || "N/A"} - ${Number(item.price || 0).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Placement</label>
                    <select
                      value={entry.placement}
                      onChange={(e) => {
                        const next = [...weekAds];
                        next[index] = { ...next[index], placement: e.target.value };
                        setWeekAds(next);
                      }}
                      className="w-full text-sm text-gray-900 bg-transparent focus:outline-none appearance-none cursor-pointer"
                      style={adsSelectStyle}
                    >
                      <option value="">Select placement</option>
                      {placementOptions.map((placement) => (
                        <option key={placement} value={placement}>
                          {placement}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Payment</label>
                    <select
                      value={entry.payment}
                      onChange={(e) => {
                        const next = [...weekAds];
                        next[index] = { ...next[index], payment: e.target.value };
                        setWeekAds(next);
                      }}
                      className="w-full text-sm text-gray-900 bg-transparent focus:outline-none appearance-none cursor-pointer"
                      style={adsSelectStyle}
                    >
                      <option value="Unpaid">Unpaid</option>
                      <option value="Pending">Pending</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>

                  <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                    <select
                      value={entry.status}
                      onChange={(e) => {
                        const next = [...weekAds];
                        next[index] = { ...next[index], status: e.target.value };
                        setWeekAds(next);
                      }}
                      className="w-full text-sm text-gray-900 bg-transparent focus:outline-none appearance-none cursor-pointer"
                      style={adsSelectStyle}
                    >
                      <option value="Draft">Draft</option>
                      <option value="Scheduled">Scheduled</option>
                      <option value="Approved">Approved</option>
                    </select>
                  </div>

                  <div className="border border-gray-200 rounded-lg bg-white px-3 pt-3 pb-2.5">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Ad Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={entry.ad_name}
                      onChange={(e) => {
                        const next = [...weekAds];
                        next[index] = { ...next[index], ad_name: e.target.value };
                        setWeekAds(next);
                      }}
                      placeholder="Enter ad name"
                      className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-gray-900">Schedule</h4>
                    <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(entry.schedule_tbd)}
                        onChange={(e) => {
                          const next = [...weekAds];
                          next[index] = { ...next[index], schedule_tbd: e.target.checked };
                          setWeekAds(next);
                        }}
                      />
                      TBD
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    {entry.schedule_tbd
                      ? "This week will be scheduled later."
                      : "All times are in New York time (ET)"}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_160px] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-y-3 gap-x-3">
                    <AvailabilityDateField
                      label="Post Date"
                      required={!entry.schedule_tbd}
                      value={entry.post_date_from}
                      onChange={(value) => {
                        const next = [...weekAds];
                        next[index] = { ...next[index], post_date_from: value };
                        setWeekAds(next);
                        void loadBlockedTimesForDate(value);
                      }}
                      disabled={entry.schedule_tbd}
                      minDate={getTodayInAppTimeZone()}
                      blockedDates={monthAvailability}
                      onLoadMonth={loadMonthAvailability}
                      placeholder="Select date"
                    />

                    <div
                      className={`relative rounded-lg px-4 pt-4 pb-3 transition-all ${monthAvailability[entry.post_date_from]?.is_full ? "bg-red-50 border border-red-200" : "bg-white border border-gray-200 hover:border-gray-300 focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0"}`}
                    >
                      <label
                        className={`block text-xs font-semibold mb-1 ${monthAvailability[entry.post_date_from]?.is_full ? "text-red-700" : "text-gray-700"}`}
                      >
                        Post Time (ET) {!entry.schedule_tbd ? <span className="text-red-500">*</span> : null}
                      </label>
                      {entry.schedule_tbd ? (
                        <p className="text-xs font-medium text-gray-500">Set to TBD for this week.</p>
                      ) : monthAvailability[entry.post_date_from]?.is_full ? (
                        <p className="text-xs font-medium text-red-600">
                          All slots are taken on that day - please choose a different date.
                        </p>
                      ) : (
                        <>
                          <div className="flex items-center gap-1 pr-6">
                            <TimeSelect
                              required={!entry.schedule_tbd}
                              value={timeForInput(entry.post_time)}
                              onChange={(value) => {
                                const next = [...weekAds];
                                next[index] = {
                                  ...next[index],
                                  post_time: value && value.length === 5 ? `${value}:00` : value,
                                };
                                setWeekAds(next);
                              }}
                              disabled={entry.schedule_tbd}
                              blockedTimes={blockedTimesMap[entry.post_date_from] || []}
                              minTime={entry.post_date_from === getTodayInAppTimeZone() ? getCurrentETTime() : null}
                            />
                          </div>
                          <Clock
                            size={16}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                          />
                        </>
                      )}
                    </div>

                    <div className={`relative border rounded-lg bg-white px-4 pt-4 pb-3 transition-all ${entry.schedule_tbd ? "border-gray-200 opacity-60" : "border-gray-200 hover:border-gray-300 focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0"}`}>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Reminder</label>
                      <div className="relative">
                        <select
                          value={entry.reminder_minutes}
                          disabled={entry.schedule_tbd}
                          onChange={(e) => {
                            const next = [...weekAds];
                            next[index] = { ...next[index], reminder_minutes: e.target.value };
                            setWeekAds(next);
                          }}
                          className={`w-full text-sm bg-transparent focus:outline-none appearance-none pr-6 font-medium ${entry.schedule_tbd ? "cursor-not-allowed text-gray-400" : "cursor-pointer text-gray-900"}`}
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

                <div className="mt-3">
                  <AdTextEditor
                    label="Ad Text"
                    name={`admin_series_week_${index}_ad_text`}
                    value={entry.ad_text}
                    onChange={(nextText) => {
                      const next = [...weekAds];
                      next[index] = { ...next[index], ad_text: nextText };
                      setWeekAds(next);
                    }}
                  />
                </div>

                <div className="mt-3">
                  <MediaUploadSection
                    media={entry.media}
                    inputId={`admin-series-week-media-${index}`}
                    onAddMedia={(item) => {
                      const next = [...weekAds];
                      next[index] = {
                        ...next[index],
                        media: [...(next[index].media || []), item],
                      };
                      setWeekAds(next);
                    }}
                    onRemoveMedia={(removeIndex) => {
                      const next = [...weekAds];
                      next[index] = {
                        ...next[index],
                        media: (next[index].media || []).filter((_, i) => i !== removeIndex),
                      };
                      setWeekAds(next);
                    }}
                  />
                </div>
              </div>
            );
            })}
          </div>
        </div>

      </div>
        </div>
      </div>

      <div className="hidden lg:flex w-[380px] xl:w-[420px] bg-[#F5F5F5] px-5 py-8 sm:px-6 sm:py-10 xl:py-12 flex-shrink-0 justify-center">
        <div className="w-full max-w-[320px]">
          <div className="text-xs font-semibold text-gray-700 mb-3">{previewTitle}</div>
          <AdPreview formData={buildPreviewData(previewWeekIndex)} />
        </div>
      </div>
    </div>
  );
}
