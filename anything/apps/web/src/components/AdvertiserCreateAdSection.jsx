"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Eye, RefreshCw, Send, X } from "lucide-react";
import { AdvertiserInfoSection } from "@/components/SubmitAdForm/AdvertiserInfoSection";
import { AdDetailsSection } from "@/components/SubmitAdForm/AdDetailsSection";
import { AdPreview } from "@/components/SubmitAdForm/AdPreview";
import { NotesSection } from "@/components/SubmitAdForm/NotesSection";
import { PostTypeSection } from "@/components/SubmitAdForm/PostTypeSection";
import { ScheduleSection } from "@/components/SubmitAdForm/ScheduleSection";
import {
  checkAdAvailability,
  normalizeCustomDateEntries,
} from "@/lib/adAvailabilityClient";
import { formatUSPhoneNumber, isCompleteUSPhoneNumber } from "@/lib/phone";
import {
  isPastDateTimeInAppTimeZone,
} from "@/lib/timezone";
import { appToast } from "@/lib/toast";

const blankSubmissionForm = {
  advertiser_name: "",
  contact_name: "",
  email: "",
  phone_number: "",
  ad_name: "",
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
};

const isFormBlank = (formData) =>
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
  phone_number: formatUSPhoneNumber(
    advertiser?.phone_number || advertiser?.phone || user?.whatsapp_number || "",
  ),
});

export default function AdvertiserCreateAdSection({
  advertiser = null,
  user = null,
  fetchWithSessionAuth,
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
  const [availabilityError, setAvailabilityError] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [pastTimeError, setPastTimeError] = useState(null);
  const [fullyBookedDates, setFullyBookedDates] = useState([]);
  const formDataRef = useRef(formData);
  const availabilityRequestIdRef = useRef(0);

  const identityReady =
    String(initialForm.advertiser_name || "").trim() &&
    String(initialForm.email || "").trim();

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
        contact_name: current.contact_name || nextIdentity.contact_name,
        phone_number: current.phone_number || nextIdentity.phone_number,
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
        field === "phone_number" ? formatUSPhoneNumber(value) : value;
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
        media: (Array.isArray(current.media) ? current.media : []).filter((_, itemIndex) => itemIndex !== index),
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

    if (!identityReady) {
      appToast.error({
        title: "Account setup incomplete",
        description: "Your advertiser account is not linked correctly. Please contact support.",
      });
      return false;
    }

    if (
      !current.advertiser_name ||
      !current.contact_name ||
      !current.email ||
      !current.phone_number ||
      !current.ad_name
    ) {
      appToast.error({
        title: "Complete all required fields before submitting.",
      });
      return false;
    }

    if (!isCompleteUSPhoneNumber(current.phone_number)) {
      appToast.error({
        title: "Phone number must be a complete US number.",
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
      const postTimeWithSeconds =
        current.post_time && current.post_time.length === 5
          ? `${current.post_time}:00`
          : current.post_time;

      const response = await submitWithAuth("/api/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...current,
          post_time: postTimeWithSeconds,
          custom_dates: current.custom_dates,
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

  return (
    <>
      <div className="mx-auto max-w-[1480px]">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Create Ad</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Submit a new ad request from your advertiser dashboard. It will follow the
              standard review, approval, email, and notification flow before it appears in
              your live ads.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 xl:hidden"
          >
            <Eye size={16} />
            Preview
          </button>
        </div>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-gray-100 p-2 text-gray-700">
              <AlertCircle size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Linked advertiser account</p>
              <p className="mt-1 text-sm text-gray-600">
                This request will be submitted under{" "}
                <span className="font-medium text-gray-900">
                  {initialForm.advertiser_name || "your advertiser account"}
                </span>
                {initialForm.email ? ` using ${initialForm.email}.` : "."}
              </p>
            </div>
          </div>
        </div>

        {!identityReady ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            Your advertiser profile is missing a linked company name or email. Contact the CBN
            team before submitting a new ad request.
          </div>
        ) : null}

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <div className="rounded-[28px] border border-gray-200 bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-8">
              <form onSubmit={handleSubmit} className="space-y-8">
                <AdvertiserInfoSection
                  formData={formData}
                  onChange={handleChange}
                  readOnlyFields={["advertiser_name", "email"]}
                  helperText="Your advertiser name and login email stay linked to this account. You can update the contact person and phone number for this request."
                />

                <AdDetailsSection
                  formData={formData}
                  onChange={handleChange}
                  onAddMedia={addMedia}
                  onRemoveMedia={removeMedia}
                />

                <PostTypeSection
                  selectedType={formData.post_type}
                  onChange={handleChange}
                />

                <ScheduleSection
                  postType={formData.post_type}
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
                />

                <NotesSection notes={formData.notes} onChange={handleChange} />

                <div className="flex flex-col gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw size={16} />
                    Reset form
                  </button>

                  <button
                    type="submit"
                    disabled={loading || checkingAvailability || !identityReady}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
                  >
                    <Send size={16} />
                    {loading ? "Submitting..." : "Submit Ad Request"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-8 rounded-[28px] border border-gray-200 bg-white px-5 py-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Live Preview
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Review your submission before sending it to the team.
                  </p>
                </div>
              </div>
              <AdPreview formData={formData} />
            </div>
          </aside>
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
          <div className="relative ml-auto h-full w-full max-w-[480px] bg-[#F5F5F5] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Ad Preview</p>
                <p className="text-xs text-gray-500">Review before submitting</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>
            <div className="h-[calc(100%-65px)] overflow-y-auto px-5 py-6">
              <AdPreview formData={formData} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
