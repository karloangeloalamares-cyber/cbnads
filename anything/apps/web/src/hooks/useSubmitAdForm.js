import { useState } from "react";
import {
  checkAdAvailability,
  normalizeCustomDateEntries,
} from "@/lib/adAvailabilityClient";
import {
  getTodayInAppTimeZone,
  isBeforeTodayInAppTimeZone,
  isPastDateTimeInAppTimeZone,
} from "@/lib/timezone";

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

const initialAccountData = (email = "") => ({
  email,
  password: "",
  confirmPassword: "",
});

export function useSubmitAdForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [submittedData, setSubmittedData] = useState(null);
  const [pendingAdId, setPendingAdId] = useState("");
  const [phase, setPhase] = useState("form");
  const [accountData, setAccountData] = useState(initialAccountData());
  const [accountError, setAccountError] = useState(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState(null);
  const [resendMessage, setResendMessage] = useState(null);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [pastTimeError, setPastTimeError] = useState(null);
  const [fullyBookedDates, setFullyBookedDates] = useState([]);

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      if (["post_date_from", "post_time"].includes(field)) {
        const dateVal = field === "post_date_from" ? value : prev.post_date_from;
        const timeVal = field === "post_time" ? value : prev.post_time;

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
  };

  const handleAccountChange = (field, value) => {
    setAccountData((prev) => ({ ...prev, [field]: value }));
    setAccountError(null);
    setResendError(null);
    setResendMessage(null);
  };

  const addCustomDate = () => {
    if (!customDate) return;

    if (isBeforeTodayInAppTimeZone(customDate)) {
      setError("Cannot select past dates");
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
        reminder_minutes: formData.reminder_minutes || 15,
      };

      handleChange("custom_dates", [...formData.custom_dates, newEntry]);
      setCustomDate("");
      setCustomTime("");
      setError(null);
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
        return { date: entry, time: timeWithSeconds, reminder_minutes: 15 };
      }

      return entry;
    });

    handleChange("custom_dates", updated);
  };

  const addMedia = (mediaItem) => {
    setFormData((prev) => ({
      ...prev,
      media: [...prev.media, mediaItem],
    }));
  };

  const removeMedia = (index) => {
    setFormData((prev) => ({
      ...prev,
      media: prev.media.filter((_, i) => i !== index),
    }));
  };

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
        setError("Cannot select a past date and time");
        setPastTimeError("This date and time is in the past. Please choose a future time.");
        return false;
      }
    }

    if (formData.post_type === "Daily Run") {
      const startDate = String(formData.post_date_from || "").trim();
      const today = getTodayInAppTimeZone();

      if (startDate && today && startDate < today) {
        setError("Start date cannot be in the past");
        setPastTimeError(null);
        return false;
      }

      if (formData.post_date_to) {
        const endDate = String(formData.post_date_to || "").trim();
        if (endDate < startDate) {
          setError("End date must be after start date");
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
    setError(null);
    setLoading(true);

    if (
      !formData.advertiser_name ||
      !formData.contact_name ||
      !formData.email ||
      !formData.phone_number ||
      !formData.ad_name
    ) {
      setError("Please fill in all required fields");
      setLoading(false);
      return;
    }

    if (pastTimeError) {
      setError(pastTimeError);
      setLoading(false);
      return;
    }

    if (!validateDateTime()) {
      setLoading(false);
      return;
    }

    if (fullyBookedDates.length > 0) {
      setError("Please resolve fully booked dates before submitting.");
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
        setError(availability.availabilityError || "Selected dates are unavailable.");
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error("Error checking availability:", err);
      setError("Could not check availability. Please try again.");
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
      setAccountData(initialAccountData(formData.email));
      setPhase("account");
      setFormData(initialFormData);
      setResendError(null);
      setResendMessage(null);
    } catch (err) {
      console.error("Error submitting ad:", err);
      setError(err.message || "Failed to submit ad request");
    } finally {
      setLoading(false);
    }
  };

  const submitAccountSetup = async (event) => {
    event.preventDefault();
    setAccountError(null);
    setResendError(null);
    setResendMessage(null);

    if (!submittedData) {
      setAccountError("Your submission could not be found. Please submit the ad again.");
      return;
    }

    if (!accountData.email || !accountData.password || !accountData.confirmPassword) {
      setAccountError("Please complete all account fields.");
      return;
    }

    if (accountData.password.length < 8) {
      setAccountError("Password must be at least 8 characters.");
      return;
    }

    if (accountData.password !== accountData.confirmPassword) {
      setAccountError("Passwords do not match.");
      return;
    }

    setAccountLoading(true);

    try {
      const response = await fetch("/api/public/submit-ad/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingAdId,
          advertiserName: submittedData.advertiser_name,
          contactName: submittedData.contact_name,
          phoneNumber: submittedData.phone_number,
          email: accountData.email,
          password: accountData.password,
          confirmPassword: accountData.confirmPassword,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create advertiser account.");
      }

      setAccountData((prev) => ({
        ...initialAccountData(data.email || prev.email),
      }));
      setPhase("verify");
    } catch (err) {
      console.error("Error creating advertiser account:", err);
      setAccountError(err.message || "Failed to create advertiser account.");
    } finally {
      setAccountLoading(false);
    }
  };

  const resendVerification = async () => {
    setResendLoading(true);
    setResendError(null);
    setResendMessage(null);

    try {
      const response = await fetch("/api/public/submit-ad/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: accountData.email || submittedData?.email || "",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to resend verification email.");
      }

      setResendMessage(`Verification email sent to ${data.email}.`);
    } catch (err) {
      console.error("Error resending verification email:", err);
      setResendError(err.message || "Failed to resend verification email.");
    } finally {
      setResendLoading(false);
    }
  };

  const goToSignIn = () => {
    const params = new URLSearchParams();
    const email = accountData.email || submittedData?.email || "";
    if (email) {
      params.set("email", email);
    }
    params.set("forceLogin", "1");
    params.set("audience", "advertiser");
    params.set("callbackUrl", "/ads");
    window.location.href = `/account/signin?${params.toString()}`;
  };

  const resetSuccess = () => {
    setPhase("form");
    setSubmittedData(null);
    setPendingAdId("");
    setAccountData(initialAccountData());
    setAccountError(null);
    setError(null);
    setAvailabilityError(null);
    setPastTimeError(null);
    setFullyBookedDates([]);
    setResendError(null);
    setResendMessage(null);
  };

  return {
    formData,
    submittedData,
    pendingAdId,
    phase,
    accountData,
    accountError,
    accountLoading,
    resendLoading,
    resendError,
    resendMessage,
    customDate,
    setCustomDate,
    customTime,
    setCustomTime,
    error,
    loading,
    availabilityError,
    checkingAvailability,
    pastTimeError,
    fullyBookedDates,
    handleChange,
    handleAccountChange,
    addCustomDate,
    removeCustomDate,
    updateCustomDateTime,
    addMedia,
    removeMedia,
    checkAvailability,
    handleSubmit,
    submitAccountSetup,
    resendVerification,
    goToSignIn,
    resetSuccess,
  };
}
