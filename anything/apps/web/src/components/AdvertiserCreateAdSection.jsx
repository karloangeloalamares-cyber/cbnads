"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, X } from "lucide-react";
import { FormHeader } from "@/components/SubmitAdForm/FormHeader";
import { AdvertiserInfoSection } from "@/components/SubmitAdForm/AdvertiserInfoSection";
import { AdDetailsSection } from "@/components/SubmitAdForm/AdDetailsSection";
import { AdPreview } from "@/components/SubmitAdForm/AdPreview";
import { NotesSection } from "@/components/SubmitAdForm/NotesSection";
import { PostTypeSection } from "@/components/SubmitAdForm/PostTypeSection";
import { ScheduleSection } from "@/components/SubmitAdForm/ScheduleSection";
import { AvailabilityDateField } from "@/components/SubmitAdForm/AvailabilityDateField";
import {
  checkAdAvailability,
  checkMultiWeekOverridesAvailability,
  normalizeCustomDateEntries,
} from "@/lib/adAvailabilityClient";
import {
  formatFlexiblePhoneInput,
} from "@/lib/phone";
import { isPastDateTimeInAppTimeZone } from "@/lib/timezone";
import { appToast } from "@/lib/toast";
import { navigateBackWithFallback } from "@/lib/navigation";
import {
  clampWeeks,
  resolveAdvertiserMultiWeekPreview,
} from "@/lib/multiWeekBooking";

const blankSubmissionForm = {
  advertiser_name: "",
  contact_name: "",
  email: "",
  phone_number: "",
  ad_name: "",
  product_id: "",
  post_type: "One-Time Post",
  post_date_from: "",
  post_date_to: "",
  custom_dates: [],
  post_time: "",
  reminder_minutes: "15-min",
  ad_text: "",
  media: [],
  placement: "",
  notes: "",
  multi_week_weeks: 4,
  series_week_start: "",
  multi_week_overrides: [],
};

const isFormBlank = (formData) =>
  !String(formData?.contact_name || "").trim() &&
  !String(formData?.phone_number || "").trim() &&
  !String(formData?.ad_name || "").trim() &&
  !String(formData?.ad_text || "").trim() &&
  !String(formData?.placement || "").trim() &&
  !String(formData?.notes || "").trim() &&
  !String(formData?.post_date_from || "").trim() &&
  !String(formData?.post_date_to || "").trim() &&
  !String(formData?.post_time || "").trim() &&
  (!Array.isArray(formData?.custom_dates) || formData.custom_dates.length === 0) &&
  (!Array.isArray(formData?.media) || formData.media.length === 0);

const buildInitialFormData = ({ advertiser, user }) => ({
  ...blankSubmissionForm,
  advertiser_name:
    String(advertiser?.advertiser_name || user?.advertiser_name || "").trim(),
  contact_name:
    String(advertiser?.contact_name || user?.name || user?.advertiser_name || "").trim(),
  email: String(advertiser?.email || user?.email || "").trim().toLowerCase(),
  phone_number: formatFlexiblePhoneInput(
    advertiser?.phone_number ||
      advertiser?.phone ||
      user?.whatsapp_number ||
      user?.phone_number ||
      user?.phone ||
      "",
  ),
});

export default function AdvertiserCreateAdSection({
  advertiser = null,
  products = [],
  user = null,
  fetchWithSessionAuth,
  onBack,
  onSubmitted,
}) {
  const submitWithAuth = fetchWithSessionAuth || fetch;
  const initialForm = useMemo(
    () => buildInitialFormData({ advertiser, user }),
    [advertiser, user],
  );
  const [formData, setFormData] = useState(initialForm);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewWeekIndex, setPreviewWeekIndex] = useState(0);
  const [showMultiWeekWorkspace, setShowMultiWeekWorkspace] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [pastTimeError, setPastTimeError] = useState(null);
  const [fullyBookedDates, setFullyBookedDates] = useState([]);
  const formDataRef = useRef(formData);
  const availabilityRequestIdRef = useRef(0);

  const identityReady =
    String(initialForm.advertiser_name || "").trim() &&
    String(initialForm.email || "").trim();
  const isMultiWeekPreview = formData.post_type === "Multi-week booking (TBD)";
  const previewWeekCount = useMemo(
    () => (isMultiWeekPreview ? clampWeeks(formData.multi_week_weeks || 4, 4) : 0),
    [formData.multi_week_weeks, isMultiWeekPreview],
  );
  const previewData = useMemo(
    () => (
      isMultiWeekPreview
        ? resolveAdvertiserMultiWeekPreview(
            {
              ...formData,
              media: Array.isArray(formData.media) ? formData.media : [],
            },
            Math.min(previewWeekCount - 1, Math.max(0, previewWeekIndex)),
            {
              includeBaseFallback: !showMultiWeekWorkspace,
            },
          )
        : {
            ...formData,
            media: Array.isArray(formData.media) ? formData.media : [],
          }
    ),
    [formData, isMultiWeekPreview, previewWeekCount, previewWeekIndex],
  );
  const isDedicatedMultiWeek = showMultiWeekWorkspace;
  const useSplitLayout = true;

  useEffect(() => {
    if (!showPreview || !isMultiWeekPreview) {
      return;
    }
    setPreviewWeekIndex((current) => Math.min(previewWeekCount - 1, Math.max(0, current)));
  }, [isMultiWeekPreview, previewWeekCount, showPreview]);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    setFormData((current) => {
      const nextIdentity = buildInitialFormData({ advertiser, user });
      if (isFormBlank(current)) {
        return nextIdentity;
      }

      return {
        ...current,
        advertiser_name: nextIdentity.advertiser_name,
        email: nextIdentity.email,
        contact_name: nextIdentity.contact_name,
        phone_number: nextIdentity.phone_number,
      };
    });
  }, [advertiser, user]);

  const resetForm = () => {
    const next = buildInitialFormData({ advertiser, user });
    formDataRef.current = next;
    availabilityRequestIdRef.current += 1;
    setFormData(next);
    setCustomDate("");
    setCustomTime("");
    setAvailabilityError(null);
    setCheckingAvailability(false);
    setPastTimeError(null);
    setFullyBookedDates([]);
    setShowPreview(false);
  };

  const handleChange = (field, value) => {
    setFormData((current) => {
      const normalizedValue =
        field === "phone_number" ? formatFlexiblePhoneInput(value) : value;
      const next = {
        ...current,
        [field]: normalizedValue,
      };
      formDataRef.current = next;

      if (["post_date_from", "post_time"].includes(field)) {
        const dateValue = field === "post_date_from" ? normalizedValue : current.post_date_from;
        const timeValue = field === "post_time" ? normalizedValue : current.post_time;

        if (dateValue && timeValue) {
          setPastTimeError(
            isPastDateTimeInAppTimeZone(dateValue, timeValue)
              ? "This date and time is in the past. Please choose a future time."
              : null,
          );
        } else {
          setPastTimeError(null);
        }
      }

      return next;
    });

    if (["post_type", "post_date_from", "post_date_to", "post_time", "custom_dates"].includes(field)) {
      availabilityRequestIdRef.current += 1;
      setCheckingAvailability(false);
      setAvailabilityError(null);
      setFullyBookedDates([]);
    }
  };

  const addMedia = (mediaItem) => {
    setFormData((current) => {
      const next = {
        ...current,
        media: [...(Array.isArray(current.media) ? current.media : []), mediaItem],
      };
      formDataRef.current = next;
      return next;
    });
  };

  const removeMedia = (index) => {
    setFormData((current) => {
      const next = {
        ...current,
        media: (Array.isArray(current.media) ? current.media : []).filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      };
      formDataRef.current = next;
      return next;
    });
  };

  const checkAvailability = async () => {
    const requestId = availabilityRequestIdRef.current + 1;
    availabilityRequestIdRef.current = requestId;
    setCheckingAvailability(true);
    setAvailabilityError(null);
    setFullyBookedDates([]);

    try {
      const currentFormData = formDataRef.current;
      const result = await checkAdAvailability({
        postType: currentFormData.post_type,
        postDateFrom: currentFormData.post_date_from,
        postDateTo: currentFormData.post_date_to,
        customDates: currentFormData.custom_dates,
        postTime: currentFormData.post_time,
      });

      if (requestId !== availabilityRequestIdRef.current) {
        return result;
      }

      if (!result.available) {
        setAvailabilityError(result.availabilityError);
        setFullyBookedDates(result.fullyBookedDates);
      }

      return result;
    } catch (error) {
      console.error("Error checking submission availability:", error);
      if (requestId === availabilityRequestIdRef.current) {
        setAvailabilityError("Could not check availability. Please try again.");
      }
      throw error;
    } finally {
      if (requestId === availabilityRequestIdRef.current) {
        setCheckingAvailability(false);
      }
    }
  };

  const validateForm = async () => {
    const current = formDataRef.current;
    const isMultiWeek = current.post_type === "Multi-week booking (TBD)";

    if (!identityReady) {
      appToast.error({
        title: "Account setup incomplete",
        description: "Your advertiser account is not linked correctly. Please contact support.",
      });
      return false;
    }

    const missingRequiredFields = [];
    if (!String(current.advertiser_name || "").trim()) missingRequiredFields.push("advertiser name");
    if (!String(current.email || "").trim()) missingRequiredFields.push("email");
    if (!isMultiWeek && !String(current.ad_name || "").trim()) {
      missingRequiredFields.push("ad name");
    }

    if (missingRequiredFields.length > 0) {
      appToast.error({
        title: "Complete all required fields before submitting.",
        description: `Missing: ${missingRequiredFields.join(", ")}`,
      });
      return false;
    }

    if (pastTimeError) {
      appToast.error({
        title: "Invalid post time",
        description: pastTimeError,
      });
      return false;
    }

    if (
      current.post_type === "One-Time Post" &&
      current.post_date_from &&
      current.post_time &&
      isPastDateTimeInAppTimeZone(current.post_date_from, current.post_time)
    ) {
      setPastTimeError("This date and time is in the past. Please choose a future time.");
      appToast.error({
        title: "Cannot submit an ad scheduled in the past.",
      });
      return false;
    }

    if (current.post_type === "Daily Run") {
      if (!current.post_date_from || !current.post_date_to) {
        appToast.error({
          title: "Start date and end date are required.",
        });
        return false;
      }

      if (current.post_date_to < current.post_date_from) {
        appToast.error({
          title: "End date must be on or after the start date.",
        });
        return false;
      }
    }

    if (
      current.post_type === "Custom Schedule" &&
      normalizeCustomDateEntries(current.custom_dates).length === 0
    ) {
      appToast.error({
        title: "Add at least one custom date before submitting.",
      });
      return false;
    }

    if (isMultiWeek) {
      const weeks = clampWeeks(current.multi_week_weeks || 4, 4);
      if (Number(current.multi_week_weeks) !== weeks) {
        appToast.error({
          title: "Weeks must be between 2 and 12.",
        });
        return false;
      }

      if (!String(current.series_week_start || "").trim()) {
        appToast.error({
          title: "Select the Week 1 start date before submitting.",
        });
        return false;
      }

      const overrides = Array.isArray(current.multi_week_overrides)
        ? current.multi_week_overrides
        : [];

      for (let index = 0; index < overrides.length; index += 1) {
        const entry = overrides[index];
        if (!entry || typeof entry !== "object") {
          continue;
        }

        if (!String(entry.ad_name || "").trim()) {
          appToast.error({
            title: `Week ${index + 1} needs an ad name.`,
          });
          return false;
        }

        if (!String(entry.ad_text || "").trim()) {
          appToast.error({
            title: `Week ${index + 1} needs ad text.`,
          });
          return false;
        }
      }

      for (let index = 0; index < overrides.length; index += 1) {
        const entry = overrides[index];
        if (!entry || typeof entry !== "object") {
          continue;
        }

        if (entry.schedule_tbd) {
          continue;
        }

        const weekDate = String(entry.post_date_from || "").trim();
        const weekTime = String(entry.post_time || "").trim();
        if (!weekDate || !weekTime) {
          appToast.error({
            title: `Week ${index + 1} needs a date/time or must be marked TBD.`,
          });
          return false;
        }

        if (isPastDateTimeInAppTimeZone(weekDate, weekTime)) {
          appToast.error({
            title: `Week ${index + 1} is scheduled in the past.`,
          });
          return false;
        }
      }

      const weeklyAvailability = await checkMultiWeekOverridesAvailability({
        overrides,
      });
      if (!weeklyAvailability.available) {
        setFullyBookedDates(weeklyAvailability.fullyBookedDates || []);
        appToast.error({
          title: `Week ${weeklyAvailability.weekIndex + 1}: ${weeklyAvailability.availabilityError || "Selected date is unavailable."}`,
        });
        return false;
      }

      return true;
    }

    if (fullyBookedDates.length > 0) {
      appToast.error({
        title: "Please resolve fully booked dates before submitting.",
      });
      return false;
    }

    try {
      const availability = await checkAvailability();
      if (!availability?.available) {
        appToast.error({
          title: availability.availabilityError || "Selected dates are unavailable.",
        });
        return false;
      }
    } catch {
      appToast.error({
        title: "Could not check availability. Please try again.",
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const isValid = await validateForm();
    if (!isValid) {
      return;
    }

    setLoading(true);

    try {
      const current = formDataRef.current;
      const firstWeekAdName = (Array.isArray(current.multi_week_overrides)
        ? current.multi_week_overrides
        : []
      )
        .map((entry) => String(entry?.ad_name || "").trim())
        .find(Boolean);
      const resolvedAdName =
        String(current.ad_name || "").trim() ||
        firstWeekAdName ||
        (current.post_type === "Multi-week booking (TBD)" ? "Multi-week booking" : "");
      const postTimeWithSeconds =
        current.post_time && current.post_time.length === 5
          ? `${current.post_time}:00`
          : current.post_time;

      const sanitizedMultiWeekOverrides = Array.isArray(current.multi_week_overrides)
        ? current.multi_week_overrides.map((entry) => ({
            ad_name: String(entry?.ad_name || ""),
            ad_text: String(entry?.ad_text || ""),
            use_base_media: entry?.use_base_media !== false,
            media: Array.isArray(entry?.media) ? entry.media : [],
            schedule_tbd: Boolean(entry?.schedule_tbd),
            post_date_from: String(entry?.post_date_from || "").slice(0, 10),
            post_time:
              entry?.post_time && String(entry.post_time).length === 5
                ? `${entry.post_time}:00`
                : entry?.post_time || "",
            reminder_minutes: String(entry?.reminder_minutes || "15-min"),
          }))
        : [];

      const response = await submitWithAuth("/api/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...current,
          ad_name: resolvedAdName,
          product_id: null,
          placement: "",
          post_time: postTimeWithSeconds,
          custom_dates: current.custom_dates,
          ...(current.post_type === "Multi-week booking (TBD)"
            ? {
                multi_week: {
                  weeks: clampWeeks(current.multi_week_weeks || 4, 4),
                  series_week_start: String(current.series_week_start || "").slice(0, 10),
                  overrides: sanitizedMultiWeekOverrides,
                },
              }
            : {}),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to submit ad request.");
      }

      resetForm();
      await onSubmitted?.(data?.pending_ad || null);
      appToast.success({
        title: "Ad request submitted.",
        description: "Your request is now in Submissions for review.",
      });
    } catch (error) {
      console.error("Failed to submit advertiser ad request:", error);
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to submit ad request.",
      });
    } finally {
      setLoading(false);
    }
  };

  const exitCreateFlow = () => {
    if (loading) {
      return;
    }
    resetForm();
    navigateBackWithFallback({ fallback: onBack });
  };

  const requestAdvertiserSubmit = () => {
    const form = document.getElementById("advertiser-create-ad-form");
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    }
  };

  const submitDisabled = loading || checkingAvailability || !identityReady;

  return (
    <>
      <div className={`min-h-screen ${isDedicatedMultiWeek ? "bg-[#FAFAFA]" : "bg-white"}`}>
        <div className="flex max-w-none mx-auto">
          <div className={`flex-1 px-5 py-8 sm:px-6 sm:py-10 xl:p-12 ${isDedicatedMultiWeek ? "bg-[#FAFAFA]" : "bg-white"}`}>
            <div className={`${useSplitLayout ? "max-w-[1380px]" : "max-w-[680px]"} mx-auto mb-6 flex items-center justify-between`}>
              <button
                type="button"
                onClick={exitCreateFlow}
                disabled={loading}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowLeft size={18} />
                Back
              </button>

              <div className="flex items-center gap-2">
                {!isDedicatedMultiWeek ? (
                  <button
                    type="button"
                    onClick={() => setShowPreview(true)}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400 lg:hidden"
                  >
                    <Eye size={15} />
                    Preview
                  </button>
                ) : null}
              </div>
            </div>

            <div className={useSplitLayout ? "max-w-[1380px] mx-auto grid gap-8 xl:gap-10 lg:grid-cols-[minmax(0,820px)_380px] xl:grid-cols-[minmax(0,880px)_420px] items-start" : "max-w-[680px] mx-auto"}>
              <div className={useSplitLayout ? "min-w-0" : ""}>
              {isDedicatedMultiWeek ? (
                <div className="mb-8 rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-sm sm:px-8 sm:py-7">
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-2xl">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                        Series Request
                      </p>
                      <h1 className="text-3xl font-bold text-gray-900 mb-2">Create multi-week booking</h1>
                      <p className="text-sm leading-6 text-gray-600">
                        Build one ad request per week, set the week count and anchor date here, then submit the series for admin review. Product and pricing can be attached later during approval.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-start">
                      <button
                        type="button"
                        onClick={() => {
                          setShowMultiWeekWorkspace(false);
                          handleChange("post_type", "One-Time Post");
                        }}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={requestAdvertiserSubmit}
                        disabled={submitDisabled}
                        className="px-4 py-2 bg-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? "Submitting..." : "Submit booking"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-gray-200 bg-[#FAFAFA] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Weeks
                      </div>
                      <input
                        type="number"
                        min={2}
                        max={12}
                        value={formData.multi_week_weeks || 4}
                        onChange={(event) => handleChange("multi_week_weeks", event.target.value)}
                        className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-base font-semibold text-gray-900 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                      />
                      <p className="mt-2 text-xs text-gray-500">Choose between 2 and 12 linked weekly requests.</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-[#FAFAFA] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Week 1 Start
                      </div>
                      <div className="mt-2">
                        <AvailabilityDateField
                          label="Week 1 start"
                          value={formData.series_week_start || ""}
                          onChange={(value) => handleChange("series_week_start", value)}
                          blockedDates={{}}
                          onLoadMonth={null}
                          placeholder="Select week start"
                          variant="subtle"
                          hideLabel
                        />
                      </div>
                      <p className="mt-2 text-xs text-gray-500">This anchors the sequence for the rest of the series.</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-[#FAFAFA] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Review Flow
                      </div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        Admin assigns product later
                      </div>
                      <p className="mt-2 text-xs text-gray-500">Use this form for schedule and creative only. Product and pricing are attached during review.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <FormHeader />
                  </div>
                  <div className="shrink-0 pt-2 sm:pt-16">
                    <button
                      type="button"
                      onClick={() => {
                        handleChange("post_type", "Multi-week booking (TBD)");
                        setShowMultiWeekWorkspace(true);
                      }}
                      className="h-10 px-4 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-all"
                    >
                      Multi-week booking
                    </button>
                  </div>
                </div>
              )}

              {!identityReady ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 mb-8">
                  Your advertiser profile is missing a linked company name or email. Contact the
                  CBN team before submitting a new ad request.
                </div>
              ) : null}

              <form
                id="advertiser-create-ad-form"
                onSubmit={handleSubmit}
                noValidate
                className={useSplitLayout ? "space-y-10 rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-sm sm:px-8 sm:py-8" : "space-y-8"}
              >
                <AdvertiserInfoSection
                  formData={formData}
                  onChange={handleChange}
                  readOnlyFields={[
                    "advertiser_name",
                    "contact_name",
                    "email",
                    "phone_number",
                  ]}
                  helperText="These fields are linked to your signup profile and are auto-filled for every request."
                  allowInternationalPhone
                />

                {!isDedicatedMultiWeek ? (
                  <AdDetailsSection
                    formData={formData}
                    onChange={handleChange}
                    onAddMedia={addMedia}
                    onRemoveMedia={removeMedia}
                  />
                ) : null}

                {!isDedicatedMultiWeek ? (
                  <PostTypeSection
                    selectedType={formData.post_type}
                    onChange={handleChange}
                    includeMultiWeek={false}
                  />
                ) : null}

                <ScheduleSection
                  postType={isDedicatedMultiWeek ? "Multi-week booking (TBD)" : formData.post_type}
                  formData={formData}
                  onChange={handleChange}
                  customDate={customDate}
                  setCustomDate={setCustomDate}
                  customTime={customTime}
                  setCustomTime={setCustomTime}
                  onAddCustomDate={() => {}}
                  onRemoveCustomDate={() => {}}
                  onUpdateCustomDateTime={() => {}}
                  onCheckAvailability={checkAvailability}
                  checkingAvailability={checkingAvailability}
                  availabilityError={availabilityError}
                  pastTimeError={pastTimeError}
                  fullyBookedDates={fullyBookedDates}
                  products={products}
                  variant={isDedicatedMultiWeek ? "public-review-multi-week" : "default"}
                />

                <NotesSection notes={formData.notes} onChange={handleChange} />

                {!isDedicatedMultiWeek ? (
                  <div className="pt-6 border-t">
                    <button
                      type="submit"
                      disabled={submitDisabled}
                      className="w-full bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                    >
                      {loading ? "Submitting..." : "Submit Ad Request"}
                    </button>
                  </div>
                ) : null}
              </form>
              </div>
              {useSplitLayout ? (
                <div className="hidden lg:flex sticky top-8 min-h-[720px] rounded-[32px] border border-gray-200 bg-white p-5 shadow-sm xl:p-6">
                  <div className="flex w-full flex-col rounded-[26px] bg-[#F7F4EE] px-5 py-5">
                    <div className="mb-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Live Preview
                      </div>
                      {isDedicatedMultiWeek ? (
                        <div className="mt-2 text-sm font-semibold text-gray-900">
                          {`Week ${previewWeekIndex + 1}`}
                        </div>
                      ) : (
                        <div className="mt-2 text-sm font-semibold text-gray-900">
                          Main create-ad preview
                        </div>
                      )}
                      <p className="mt-1 text-xs leading-5 text-gray-600">
                        {isDedicatedMultiWeek
                          ? "Switch weeks to review copy, media, and schedule overrides before you submit the full series."
                          : "Your mobile ad preview updates as you fill in the form."}
                      </p>
                    </div>
                    {isDedicatedMultiWeek ? (
                      <div className="mb-5 grid grid-cols-2 gap-2">
                        {Array.from({ length: previewWeekCount }).map((_, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => setPreviewWeekIndex(index)}
                            className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                              previewWeekIndex === index
                                ? "border-gray-900 bg-gray-900 text-white"
                                : "border-white bg-white/80 text-gray-700 hover:border-gray-300"
                            }`}
                          >
                            {`Week ${index + 1}`}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex-1 rounded-[28px] bg-white px-3 py-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
                      <AdPreview formData={previewData} />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {showPreview ? (
        <div
          className="fixed inset-0 z-50 flex"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowPreview(false);
            }
          }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative ml-auto w-full max-w-[480px] h-full bg-[#F5F5F5] shadow-2xl flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-200 sticky top-0 z-10">
              <span className="text-sm font-semibold text-gray-900">
                {isMultiWeekPreview ? `Ad Preview - Week ${previewWeekIndex + 1}` : "Ad Preview"}
              </span>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-6">
              {isMultiWeekPreview ? (
                <div className="mb-5 flex flex-wrap gap-2">
                  {Array.from({ length: previewWeekCount }).map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setPreviewWeekIndex(index)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        previewWeekIndex === index
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {`Week ${index + 1}`}
                    </button>
                  ))}
                </div>
              ) : null}
              <AdPreview formData={previewData} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
