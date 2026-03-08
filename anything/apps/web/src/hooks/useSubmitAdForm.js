import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkAdAvailability,
  normalizeCustomDateEntries,
} from "@/lib/adAvailabilityClient";
import {
  getTodayInAppTimeZone,
  isBeforeTodayInAppTimeZone,
  isPastDateTimeInAppTimeZone,
} from "@/lib/timezone";
import {
  formatUSPhoneNumber,
  isCompleteUSPhoneNumber,
} from "@/lib/phone";
import { appToast } from "@/lib/toast";
import { useAccountSetup } from "./useAccountSetup";

const SUBMISSION_NOTIFICATION_EVENT = "cbn:pending-submission-created";
const SUBMISSION_NOTIFICATION_STORAGE_KEY = "cbn:pending-submission-created";

const initialFormData = {
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

const createIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

export function useSubmitAdForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [submittedData, setSubmittedData] = useState(null);
  const [pendingAdId, setPendingAdId] = useState("");
  const [phase, setPhase] = useState("form");
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [pastTimeError, setPastTimeError] = useState(null);
  const [fullyBookedDates, setFullyBookedDates] = useState([]);
  const formDataRef = useRef(formData);
  const submitInFlightRef = useRef(false);
  const submitIdempotencyKeyRef = useRef("");
  const availabilityRequestIdRef = useRef(0);

  const account = useAccountSetup();

  const emitSubmissionCreatedSignal = useCallback(
    (pendingSubmissionId = "", source = "public-submit-ad") => {
      if (typeof window === "undefined") {
        return;
      }

      const eventPayload = {
        source: String(source || "").trim() || "public-submit-ad",
        id: String(pendingSubmissionId || "").trim() || null,
        timestamp: Date.now(),
      };

      try {
        window.dispatchEvent(
          new CustomEvent(SUBMISSION_NOTIFICATION_EVENT, { detail: eventPayload }),
        );
      } catch {
        // Ignore local event dispatch failures.
      }

      try {
        window.localStorage.setItem(
          SUBMISSION_NOTIFICATION_STORAGE_KEY,
          JSON.stringify(eventPayload),
        );
      } catch {
        // Ignore storage write failures (private mode/quota/etc).
      }
    },
    [],
  );

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const handleChange = useCallback((field, value) => {
    submitIdempotencyKeyRef.current = "";
    setFormData((prev) => {
      const normalizedValue =
        field === "phone_number" ? formatUSPhoneNumber(value) : value;
      const updated = { ...prev, [field]: normalizedValue };
      formDataRef.current = updated;

      if (["post_date_from", "post_time"].includes(field)) {
        const dateVal = field === "post_date_from" ? normalizedValue : prev.post_date_from;
        const timeVal = field === "post_time" ? normalizedValue : prev.post_time;

        if (dateVal && timeVal) {
          if (isPastDateTimeInAppTimeZone(dateVal, timeVal)) {
            setPastTimeError("This date and time is in the past. Please choose a future time.");
          } else {
            setPastTimeError(null);
          }
        } else {
          setPastTimeError(null);
        }
      }

      return updated;
    });

    if (["post_date_from", "post_date_to", "post_time", "post_type", "custom_dates"].includes(field)) {
      availabilityRequestIdRef.current += 1;
      setCheckingAvailability(false);
      setAvailabilityError(null);
      setFullyBookedDates([]);
    }
  }, []);

  const showSubmitError = (message) => {
    appToast.error({
      title: "Unable to submit ad",
      description: message,
    });
  };

  const addCustomDate = () => {
    if (!customDate) return;

    if (isBeforeTodayInAppTimeZone(customDate)) {
      showSubmitError("Cannot select past dates");
      return;
    }

    const alreadyExists = formData.custom_dates.some((entry) => {
      const existingDate =
        typeof entry === "object" && entry !== null ? entry.date : entry;
      return existingDate === customDate;
    });

    if (!alreadyExists) {
      const timeForDate = customTime || formData.post_time || "";
      const timeWithSeconds =
        timeForDate && timeForDate.length === 5 ? `${timeForDate}:00` : timeForDate;

      const newEntry = {
        date: customDate,
        time: timeWithSeconds,
        reminder: "15-min",
      };

      handleChange("custom_dates", [...formData.custom_dates, newEntry]);
      setCustomDate("");
      setCustomTime("");
      setAvailabilityError(null);
      setFullyBookedDates([]);
    }
  };

  const removeCustomDate = (dateToRemove) => {
    handleChange(
      "custom_dates",
      formData.custom_dates.filter((entry) => {
        const dateStr = typeof entry === "object" && entry !== null ? entry.date : entry;
        return dateStr !== dateToRemove;
      }),
    );

    setAvailabilityError(null);
    setFullyBookedDates([]);
  };

  const updateCustomDateTime = (dateStr, newTime) => {
    const timeWithSeconds =
      newTime && newTime.length === 5 ? `${newTime}:00` : newTime;

    const updated = formData.custom_dates.map((entry) => {
      if (typeof entry === "object" && entry !== null && entry.date === dateStr) {
        return { ...entry, time: timeWithSeconds };
      }

      if (typeof entry === "string" && entry === dateStr) {
        return { date: entry, time: timeWithSeconds, reminder: "15-min" };
      }

      return entry;
    });

    handleChange("custom_dates", updated);
  };

  const addMedia = useCallback((mediaItem) => {
    setFormData((prev) => ({
      ...prev,
      media: [...prev.media, mediaItem],
    }));
  }, []);

  const removeMedia = useCallback((index) => {
    setFormData((prev) => ({
      ...prev,
      media: prev.media.filter((_, i) => i !== index),
    }));
  }, []);

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
    } catch (err) {
      console.error("Error checking availability:", err);
      if (requestId === availabilityRequestIdRef.current) {
        setAvailabilityError("Could not check availability. Please try again.");
      }
    } finally {
      if (requestId === availabilityRequestIdRef.current) {
        setCheckingAvailability(false);
      }
    }
  };

  const validateDateTime = (currentFormData) => {
    if (
      currentFormData.post_type === "One-Time Post" &&
      currentFormData.post_date_from &&
      currentFormData.post_time
    ) {
      if (
        isPastDateTimeInAppTimeZone(
          currentFormData.post_date_from,
          currentFormData.post_time,
        )
      ) {
        showSubmitError("Cannot select a past date and time");
        setPastTimeError("This date and time is in the past. Please choose a future time.");
        return false;
      }
    }

    if (currentFormData.post_type === "Daily Run") {
      const startDate = String(currentFormData.post_date_from || "").trim();
      const today = getTodayInAppTimeZone();

      if (startDate && today && startDate < today) {
        showSubmitError("Start date cannot be in the past");
        setPastTimeError(null);
        return false;
      }

      if (currentFormData.post_date_to) {
        const endDate = String(currentFormData.post_date_to || "").trim();
        if (endDate < startDate) {
          showSubmitError("End date must be after start date");
          setPastTimeError(null);
          return false;
        }
      }
    }

    setPastTimeError(null);
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;
    setLoading(true);
    const formElement = event.currentTarget;
    const domFormData =
      typeof FormData !== "undefined" && formElement instanceof HTMLFormElement
        ? new FormData(formElement)
        : null;

    const currentFormData = {
      ...formDataRef.current,
      advertiser_name: String(
        domFormData?.get("advertiser_name") ?? formDataRef.current.advertiser_name ?? "",
      ),
      contact_name: String(
        domFormData?.get("contact_name") ?? formDataRef.current.contact_name ?? "",
      ),
      email: String(domFormData?.get("email") ?? formDataRef.current.email ?? ""),
      phone_number: formatUSPhoneNumber(
        String(domFormData?.get("phone_number") ?? formDataRef.current.phone_number ?? ""),
      ),
      ad_name: String(domFormData?.get("ad_name") ?? formDataRef.current.ad_name ?? ""),
      ad_text: String(domFormData?.get("ad_text") ?? formDataRef.current.ad_text ?? ""),
    };
    formDataRef.current = currentFormData;

    try {
      if (
        !String(currentFormData.advertiser_name || "").trim() ||
        !String(currentFormData.contact_name || "").trim() ||
        !String(currentFormData.email || "").trim() ||
        !String(currentFormData.phone_number || "").trim() ||
        !String(currentFormData.ad_name || "").trim()
      ) {
        showSubmitError("Please fill in all required fields");
        return;
      }

      if (!isCompleteUSPhoneNumber(currentFormData.phone_number)) {
        showSubmitError("Phone number must be a complete US number.");
        return;
      }

      if (!validateDateTime(currentFormData)) {
        return;
      }

      const availability = await checkAdAvailability({
        postType: currentFormData.post_type,
        postDateFrom: currentFormData.post_date_from,
        postDateTo: currentFormData.post_date_to,
        customDates: normalizeCustomDateEntries(currentFormData.custom_dates),
        postTime: currentFormData.post_time,
      });

      if (!availability.available) {
        setFullyBookedDates(availability.fullyBookedDates || []);
        showSubmitError(availability.availabilityError || "Selected dates are unavailable.");
        return;
      }

      const timeWithSeconds =
        currentFormData.post_time && currentFormData.post_time.length === 5
          ? `${currentFormData.post_time}:00`
          : currentFormData.post_time;
      const idempotencyKey = submitIdempotencyKeyRef.current || createIdempotencyKey();
      submitIdempotencyKeyRef.current = idempotencyKey;

      const response = await fetch("/api/public/submit-ad", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          ...currentFormData,
          post_time: timeWithSeconds,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit ad");
      }

      const data = await response.json();
      const nextSubmittedData = { ...currentFormData, post_time: timeWithSeconds };
      const createdPendingAdId = String(data?.pending_ad?.id || "").trim();

      setSubmittedData(nextSubmittedData);
      setPendingAdId(createdPendingAdId);
      emitSubmissionCreatedSignal(createdPendingAdId);
      account.initAccount(currentFormData.email);
      setPhase("account");
      setFormData(initialFormData);
      submitIdempotencyKeyRef.current = "";
    } catch (err) {
      console.error("Error submitting ad:", err);
      showSubmitError(err.message || "Failed to submit ad request");
    } finally {
      submitInFlightRef.current = false;
      setLoading(false);
    }
  };

  const submitAccountSetup = (event) => {
    return account.submitAccountSetup(event, {
      pendingAdId,
      submittedData,
      onSuccess: () => setPhase("verify"),
    });
  };

  const continueWithGoogle = () => {
    return account.startGoogleSignUp({
      pendingAdId,
      submittedData,
    });
  };

  const completeGoogleLink = () => {
    return account.completeGoogleSignUp({
      onSuccess: () => {
        // Google emails are pre-verified, skip verification step
      },
      onSignIn: () => {
        window.location.href = '/submit-ad/success';
      },
    });
  };

  const resendVerification = () => {
    return account.resendVerification({
      email: account.accountData.email || submittedData?.email || "",
    });
  };

  const goToSignIn = () => {
    return account.goToSignIn({
      email: account.accountData.email || submittedData?.email || "",
    });
  };

  const resetSuccess = () => {
    setPhase("form");
    setSubmittedData(null);
    setPendingAdId("");
    account.resetAccount();
    setAvailabilityError(null);
    setPastTimeError(null);
    setFullyBookedDates([]);
    submitIdempotencyKeyRef.current = "";
  };

  return {
    formData,
    submittedData,
    pendingAdId,
    phase,
    accountData: account.accountData,
    accountError: account.accountError,
    existingAccountPrompt: account.existingAccountPrompt,
    accountLoading: account.accountLoading,
    googleLoading: account.googleLoading,
    resendLoading: account.resendLoading,
    resendError: account.resendError,
    resendMessage: account.resendMessage,
    customDate,
    setCustomDate,
    customTime,
    setCustomTime,
    loading,
    availabilityError,
    checkingAvailability,
    pastTimeError,
    fullyBookedDates,
    handleChange,
    handleAccountChange: account.handleAccountChange,
    addCustomDate,
    removeCustomDate,
    updateCustomDateTime,
    addMedia,
    removeMedia,
    checkAvailability,
    handleSubmit,
    submitAccountSetup,
    continueWithGoogle,
    completeGoogleLink,
    resendVerification,
    goToSignIn,
    resetSuccess,
  };
}
