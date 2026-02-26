import { useState } from "react";
import { readDb, submitPendingAd } from "@/lib/localDb";

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
  post_time: "09:00",
  reminder_minutes: 15,
  ad_text: "",
  media: [],
  placement: "",
  notes: "",
};

const POST_TYPES = {
  ONE_TIME: "one_time",
  DAILY: "daily_run",
  CUSTOM: "custom_schedule",
};

const normalizePostType = (value) => {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  if (text === "one_time_post" || text === "one_time") {
    return POST_TYPES.ONE_TIME;
  }
  if (text === "daily_run" || text === "daily") {
    return POST_TYPES.DAILY;
  }
  if (text === "custom_schedule" || text === "custom") {
    return POST_TYPES.CUSTOM;
  }
  return POST_TYPES.ONE_TIME;
};

const toDateOnly = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeDateString = (value) => {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return toDateOnly(value);
  }

  const asText = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(asText)) {
    return asText;
  }

  const parsed = new Date(asText);
  if (Number.isNaN(parsed.valueOf())) {
    return "";
  }

  return toDateOnly(parsed);
};

const normalizeTime = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^\d{2}:\d{2}$/.test(trimmed)) {
      return `${trimmed}:00`;
    }
    return trimmed;
  }

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toTimeString().slice(0, 8);
  }

  return String(value);
};

const getDatesInRange = (from, to) => {
  const startString = normalizeDateString(from);
  const endString = normalizeDateString(to);

  if (!startString || !endString) {
    return [];
  }

  const start = new Date(`${startString}T00:00:00`);
  const end = new Date(`${endString}T00:00:00`);

  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start > end) {
    return [];
  }

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(toDateOnly(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const listRecordDates = (record) => {
  const type = normalizePostType(record?.post_type);
  const from = normalizeDateString(record?.post_date_from || record?.post_date);
  const to = normalizeDateString(record?.post_date_to);

  if (type === POST_TYPES.ONE_TIME) {
    return from ? [from] : [];
  }

  if (type === POST_TYPES.DAILY) {
    const effectiveTo = to || from;
    return getDatesInRange(from, effectiveTo);
  }

  if (type === POST_TYPES.CUSTOM) {
    if (!Array.isArray(record?.custom_dates)) {
      return [];
    }
    return record.custom_dates
      .map((value) => normalizeDateString(value))
      .filter(Boolean);
  }

  return from ? [from] : [];
};

const getMaxAdsPerDay = (db) => {
  const candidate =
    Number(db?.admin_settings?.max_ads_per_day) ||
    Number(db?.admin_settings?.max_ads_per_slot);
  if (Number.isFinite(candidate) && candidate > 0) {
    return candidate;
  }
  return 5;
};

const countAdsOnDate = (db, date) => {
  const target = normalizeDateString(date);
  if (!target) {
    return 0;
  }

  return (db?.ads || []).reduce((count, ad) => {
    const dates = listRecordDates(ad);
    return dates.includes(target) ? count + 1 : count;
  }, 0);
};

const isOneTimeTimeBlocked = (db, date, time) => {
  const targetDate = normalizeDateString(date);
  const targetTime = normalizeTime(time);

  if (!targetDate || !targetTime) {
    return false;
  }

  return (db?.ads || []).some((ad) => {
    const adType = normalizePostType(ad?.post_type);
    if (adType !== POST_TYPES.ONE_TIME) {
      return false;
    }

    const adDate = normalizeDateString(ad?.post_date_from || ad?.post_date);
    if (adDate !== targetDate) {
      return false;
    }

    const adTime = normalizeTime(ad?.post_time);
    return adTime === targetTime;
  });
};

const getAvailabilityResult = (data) => {
  const db = readDb();
  const maxAdsPerDay = getMaxAdsPerDay(db);
  const type = normalizePostType(data.post_type);

  if (type === POST_TYPES.ONE_TIME) {
    if (!data.post_date_from || !data.post_time) {
      return { availabilityError: null, fullyBookedDates: [] };
    }

    const totalAdsOnDate = countAdsOnDate(db, data.post_date_from);
    const isDayFull = totalAdsOnDate >= maxAdsPerDay;
    const isTimeBlocked = isOneTimeTimeBlocked(
      db,
      data.post_date_from,
      data.post_time,
    );

    if (isTimeBlocked) {
      return {
        availabilityError:
          "This time slot is already taken. Please choose a different time.",
        fullyBookedDates: [],
      };
    }

    if (isDayFull) {
      return {
        availabilityError:
          "This date is fully booked. Please choose a different date.",
        fullyBookedDates: [],
      };
    }

    return { availabilityError: null, fullyBookedDates: [] };
  }

  const datesToCheck =
    type === POST_TYPES.DAILY
      ? getDatesInRange(data.post_date_from, data.post_date_to)
      : (data.custom_dates || [])
          .map((value) => normalizeDateString(value))
          .filter(Boolean);

  if (datesToCheck.length === 0) {
    return { availabilityError: null, fullyBookedDates: [] };
  }

  const fullyBookedDates = datesToCheck.filter(
    (date) => countAdsOnDate(db, date) >= maxAdsPerDay,
  );

  if (fullyBookedDates.length > 0) {
    const availabilityError =
      type === POST_TYPES.CUSTOM
        ? "Some of your selected dates are fully booked."
        : "Some dates in your range are fully booked.";

    return { availabilityError, fullyBookedDates };
  }

  return { availabilityError: null, fullyBookedDates: [] };
};

const getPrimaryPostDate = (data) => {
  const type = normalizePostType(data.post_type);

  if (type === POST_TYPES.ONE_TIME || type === POST_TYPES.DAILY) {
    return normalizeDateString(data.post_date_from);
  }

  return normalizeDateString(data.custom_dates?.[0]);
};

const isPastDate = (value) => {
  const dateString = normalizeDateString(value);
  if (!dateString) {
    return false;
  }

  const selected = new Date(`${dateString}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return selected < today;
};

export function useSubmitAdForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [customDate, setCustomDate] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [pastTimeError, setPastTimeError] = useState(null);
  const [fullyBookedDates, setFullyBookedDates] = useState([]);

  const validatePastDateTime = (nextData) => {
    const type = normalizePostType(nextData.post_type);

    if (type === POST_TYPES.ONE_TIME) {
      if (!nextData.post_date_from || !nextData.post_time) {
        setPastTimeError(null);
        return;
      }

      const selectedDateTime = new Date(
        `${normalizeDateString(nextData.post_date_from)}T${nextData.post_time}`,
      );

      if (!Number.isNaN(selectedDateTime.valueOf()) && selectedDateTime < new Date()) {
        setPastTimeError(
          "This date and time is in the past. Please choose a future time.",
        );
      } else {
        setPastTimeError(null);
      }
      return;
    }

    if (isPastDate(nextData.post_date_from)) {
      setPastTimeError("Start date cannot be in the past.");
      return;
    }

    if (type === POST_TYPES.CUSTOM) {
      const hasPastDate = (nextData.custom_dates || []).some((value) => isPastDate(value));
      if (hasPastDate) {
        setPastTimeError("Custom schedule cannot include past dates.");
        return;
      }
    }

    setPastTimeError(null);
  };

  const handleChange = (field, value) => {
    setFormData((previous) => {
      const next = { ...previous, [field]: value };
      validatePastDateTime(next);
      return next;
    });

    if (
      ["post_date_from", "post_date_to", "post_time", "post_type", "custom_dates"].includes(field)
    ) {
      setAvailabilityError(null);
      setFullyBookedDates([]);
    }
  };

  const addCustomDate = () => {
    const dateToAdd = normalizeDateString(customDate);
    if (!dateToAdd) {
      return;
    }

    if (isPastDate(dateToAdd)) {
      setError("Cannot select past dates.");
      return;
    }

    if (formData.custom_dates.includes(dateToAdd)) {
      setError("This date is already selected.");
      return;
    }

    const nextDates = [...formData.custom_dates, dateToAdd].sort();
    handleChange("custom_dates", nextDates);
    setCustomDate("");
    setError(null);
  };

  const removeCustomDate = (date) => {
    const target = normalizeDateString(date);
    handleChange(
      "custom_dates",
      formData.custom_dates.filter((entry) => normalizeDateString(entry) !== target),
    );
  };

  const addMedia = (mediaItem) => {
    if (!mediaItem?.url) {
      return;
    }

    setFormData((previous) => ({
      ...previous,
      media: [...previous.media, mediaItem],
    }));
  };

  const removeMedia = (index) => {
    setFormData((previous) => ({
      ...previous,
      media: previous.media.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const checkAvailability = async () => {
    setCheckingAvailability(true);
    setAvailabilityError(null);
    setFullyBookedDates([]);

    try {
      const result = getAvailabilityResult(formData);
      setAvailabilityError(result.availabilityError);
      setFullyBookedDates(result.fullyBookedDates);
    } catch (availabilityIssue) {
      console.error("Error checking availability:", availabilityIssue);
      setAvailabilityError("Could not check availability. Please try again.");
    } finally {
      setCheckingAvailability(false);
    }
  };

  const validateForm = () => {
    if (
      !formData.advertiser_name ||
      !formData.contact_name ||
      !formData.email ||
      !formData.phone_number ||
      !formData.ad_name
    ) {
      setError("Please fill in all required fields.");
      return false;
    }

    const type = normalizePostType(formData.post_type);

    if (type === POST_TYPES.ONE_TIME) {
      if (!formData.post_date_from || !formData.post_time) {
        setError("Please choose a post date and time.");
        return false;
      }
      if (pastTimeError) {
        setError(pastTimeError);
        return false;
      }
    }

    if (type === POST_TYPES.DAILY) {
      if (!formData.post_date_from || !formData.post_date_to) {
        setError("Please choose a start date and end date.");
        return false;
      }

      const range = getDatesInRange(formData.post_date_from, formData.post_date_to);
      if (range.length === 0) {
        setError("End date must be after start date.");
        return false;
      }

      if (isPastDate(formData.post_date_from)) {
        setError("Start date cannot be in the past.");
        return false;
      }
    }

    if (type === POST_TYPES.CUSTOM) {
      if (!Array.isArray(formData.custom_dates) || formData.custom_dates.length === 0) {
        setError("Please add at least one custom date.");
        return false;
      }

      if (formData.custom_dates.some((value) => isPastDate(value))) {
        setError("Custom schedule cannot include past dates.");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!validateForm()) {
        return;
      }

      const availability = getAvailabilityResult(formData);
      setAvailabilityError(availability.availabilityError);
      setFullyBookedDates(availability.fullyBookedDates);

      if (availability.availabilityError || availability.fullyBookedDates.length > 0) {
        setError(
          availability.availabilityError ||
            "Please resolve fully booked dates before submitting.",
        );
        return;
      }

      const primaryDate = getPrimaryPostDate(formData);
      const normalizedTime = normalizeTime(formData.post_time);

      submitPendingAd({
        advertiser_name: formData.advertiser_name,
        contact_name: formData.contact_name,
        email: formData.email,
        phone_number: formData.phone_number,
        phone: formData.phone_number,
        business_name: "",
        ad_name: formData.ad_name,
        post_type: formData.post_type,
        post_date: primaryDate,
        post_date_from: normalizeDateString(formData.post_date_from),
        post_date_to: normalizeDateString(formData.post_date_to),
        custom_dates: (formData.custom_dates || []).map((value) => normalizeDateString(value)),
        post_time: normalizedTime,
        reminder_minutes: Number(formData.reminder_minutes) || 15,
        ad_text: formData.ad_text,
        media: formData.media,
        placement: formData.placement,
        notes: formData.notes,
      });

      setSuccess(true);
      setFormData(initialFormData);
      setCustomDate("");
      setPastTimeError(null);
      setAvailabilityError(null);
      setFullyBookedDates([]);
    } catch (submitError) {
      console.error("Error submitting ad:", submitError);
      setError("Failed to submit ad request.");
    } finally {
      setLoading(false);
    }
  };

  const resetSuccess = () => {
    setSuccess(false);
  };

  return {
    formData,
    customDate,
    setCustomDate,
    error,
    success,
    loading,
    availabilityError,
    checkingAvailability,
    pastTimeError,
    fullyBookedDates,
    handleChange,
    addCustomDate,
    removeCustomDate,
    addMedia,
    removeMedia,
    checkAvailability,
    handleSubmit,
    resetSuccess,
  };
}