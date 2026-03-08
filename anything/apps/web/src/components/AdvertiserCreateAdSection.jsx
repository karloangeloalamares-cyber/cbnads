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
import {
  checkAdAvailability,
  normalizeCustomDateEntries,
} from "@/lib/adAvailabilityClient";
import { formatUSPhoneNumber, isCompleteUSPhoneNumber } from "@/lib/phone";
import { isPastDateTimeInAppTimeZone } from "@/lib/timezone";
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
  phone_number: formatUSPhoneNumber(
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
  const [availabilityError, setAvailabilityError] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [pastTimeError, setPastTimeError] = useState(null);
  const [fullyBookedDates, setFullyBookedDates] = useState([]);
  const formDataRef = useRef(formData);
  const availabilityRequestIdRef = useRef(0);

  const identityReady =
    String(initialForm.advertiser_name || "").trim() &&
    String(initialForm.email || "").trim();
  const previewData = useMemo(
    () => ({
      ...formData,
      media: Array.isArray(formData.media) ? formData.media : [],
    }),
    [formData],
  );

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

    if (current.phone_number && !isCompleteUSPhoneNumber(current.phone_number)) {
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

  const exitCreateFlow = () => {
    if (loading) {
      return;
    }
    resetForm();
    onBack?.();
  };

  const submitDisabled = loading || checkingAvailability || !identityReady;

  return (
    <>
      <div className="min-h-screen bg-white">
        <div className="flex max-w-none mx-auto">
          <div className="flex-1 bg-white px-5 py-8 sm:px-6 sm:py-10 xl:p-12">
            <div className="max-w-[680px] mx-auto mb-6 flex items-center justify-between">
              <button
                type="button"
                onClick={exitCreateFlow}
                disabled={loading}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowLeft size={18} />
                Back
              </button>

              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400"
              >
                <Eye size={15} />
                Preview
              </button>
            </div>

            <div className="max-w-[680px] mx-auto">
              <FormHeader />

              {!identityReady ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 mb-8">
                  Your advertiser profile is missing a linked company name or email. Contact the
                  CBN team before submitting a new ad request.
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-8">
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
                />

                <AdDetailsSection
                  formData={formData}
                  onChange={handleChange}
                  onAddMedia={addMedia}
                  onRemoveMedia={removeMedia}
                />

                <PostTypeSection selectedType={formData.post_type} onChange={handleChange} />

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

                <div className="pt-6 border-t">
                  <button
                    type="submit"
                    disabled={submitDisabled}
                    className="w-full bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    {loading ? "Submitting..." : "Submit Ad Request"}
                  </button>
                </div>
              </form>
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
              <span className="text-sm font-semibold text-gray-900">Ad Preview</span>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-6">
              <AdPreview formData={previewData} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
