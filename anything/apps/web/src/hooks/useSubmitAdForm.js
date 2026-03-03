import { useCallback, useState } from "react";
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
  reminder_minutes: 15,
  ad_text: "",
  media: [],
  placement: "",
  notes: "",
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

  const account = useAccountSetup();

  const handleChange = useCallback((field, value) => {
    setFormData((prev) => {
      const normalizedValue =
        field === "phone_number" ? formatUSPhoneNumber(value) : value;
      const updated = { ...prev, [field]: normalizedValue };

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

    if (["post_date_from", "post_date_to", "post_time", "post_type"].includes(field)) {
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
    setCheckingAvailability(true);
    setAvailabilityError(null);
    setFullyBookedDates([]);

    try {
      const result = await checkAdAvailability({
        postType: formData.post_type,
        postDateFrom: formData.post_date_from,
        postDateTo: formData.post_date_to,
        customDates: formData.custom_dates,
        postTime: formData.post_time,
      });

      if (!result.available) {
        setAvailabilityError(result.availabilityError);
        setFullyBookedDates(result.fullyBookedDates);
      }
    } catch (err) {
      console.error("Error checking availability:", err);
      setAvailabilityError("Could not check availability. Please try again.");
    } finally {
      setCheckingAvailability(false);
    }
  };

  const validateDateTime = () => {
    if (formData.post_type === "One-Time Post" && formData.post_date_from && formData.post_time) {
      if (isPastDateTimeInAppTimeZone(formData.post_date_from, formData.post_time)) {
        showSubmitError("Cannot select a past date and time");
        setPastTimeError("This date and time is in the past. Please choose a future time.");
        return false;
      }
    }

    if (formData.post_type === "Daily Run") {
      const startDate = String(formData.post_date_from || "").trim();
      const today = getTodayInAppTimeZone();

      if (startDate && today && startDate < today) {
        showSubmitError("Start date cannot be in the past");
        setPastTimeError(null);
        return false;
      }

      if (formData.post_date_to) {
        const endDate = String(formData.post_date_to || "").trim();
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
    setLoading(true);

    if (
      !formData.advertiser_name ||
      !formData.contact_name ||
      !formData.email ||
      !formData.phone_number ||
      !formData.ad_name
    ) {
      showSubmitError("Please fill in all required fields");
      setLoading(false);
      return;
    }

    if (!isCompleteUSPhoneNumber(formData.phone_number)) {
      showSubmitError("Phone number must be a complete US number.");
      setLoading(false);
      return;
    }

    if (pastTimeError) {
      showSubmitError(pastTimeError);
      setLoading(false);
      return;
    }

    if (!validateDateTime()) {
      setLoading(false);
      return;
    }

    if (fullyBookedDates.length > 0) {
      showSubmitError("Please resolve fully booked dates before submitting.");
      setLoading(false);
      return;
    }

    try {
      const availability = await checkAdAvailability({
        postType: formData.post_type,
        postDateFrom: formData.post_date_from,
        postDateTo: formData.post_date_to,
        customDates: normalizeCustomDateEntries(formData.custom_dates),
        postTime: formData.post_time,
      });

      if (!availability.available) {
        setFullyBookedDates(availability.fullyBookedDates);
        showSubmitError(availability.availabilityError || "Selected dates are unavailable.");
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error("Error checking availability:", err);
      showSubmitError("Could not check availability. Please try again.");
      setLoading(false);
      return;
    }

    try {
      const timeWithSeconds =
        formData.post_time && formData.post_time.length === 5
          ? `${formData.post_time}:00`
          : formData.post_time;

      const response = await fetch("/api/public/submit-ad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          post_time: timeWithSeconds,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit ad");
      }

      const data = await response.json();
      const nextSubmittedData = { ...formData, post_time: timeWithSeconds };

      setSubmittedData(nextSubmittedData);
      setPendingAdId(data?.pending_ad?.id || "");
      account.initAccount(formData.email);
      setPhase("account");
      setFormData(initialFormData);
    } catch (err) {
      console.error("Error submitting ad:", err);
      showSubmitError(err.message || "Failed to submit ad request");
    } finally {
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
  };

  return {
    formData,
    submittedData,
    pendingAdId,
    phase,
    accountData: account.accountData,
    accountError: account.accountError,
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

