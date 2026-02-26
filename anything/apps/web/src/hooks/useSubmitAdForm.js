import { useState } from "react";

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

export function useSubmitAdForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [customDate, setCustomDate] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [pastTimeError, setPastTimeError] = useState(null);
  // Stores full dates for multi-date post types (Daily Run, Custom Schedule)
  const [fullyBookedDates, setFullyBookedDates] = useState([]);

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      // Real-time past time/date validation
      if (["post_date_from", "post_time"].includes(field)) {
        const dateVal =
          field === "post_date_from" ? value : prev.post_date_from;
        const timeVal = field === "post_time" ? value : prev.post_time;

        if (dateVal && timeVal) {
          const now = new Date();
          const selectedDateTime = new Date(`${dateVal}T${timeVal}`);
          if (selectedDateTime < now) {
            setPastTimeError(
              "This date and time is in the past. Please choose a future time.",
            );
          } else {
            setPastTimeError(null);
          }
        } else {
          setPastTimeError(null);
        }
      }

      return updated;
    });

    // Clear availability errors when changing date, time, or post type
    if (
      ["post_date_from", "post_date_to", "post_time", "post_type"].includes(
        field,
      )
    ) {
      setAvailabilityError(null);
      setFullyBookedDates([]);
    }
  };

  const addCustomDate = () => {
    if (customDate) {
      // Check if date is in the past
      const selectedDate = new Date(customDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate < today) {
        setError("Cannot select past dates");
        return;
      }

      if (!formData.custom_dates.includes(customDate)) {
        handleChange("custom_dates", [...formData.custom_dates, customDate]);
        setCustomDate("");
        setError(null);
        // Clear availability errors since dates changed
        setAvailabilityError(null);
        setFullyBookedDates([]);
      }
    }
  };

  const removeCustomDate = (date) => {
    handleChange(
      "custom_dates",
      formData.custom_dates.filter((d) => d !== date),
    );
    // Clear availability errors since dates changed
    setAvailabilityError(null);
    setFullyBookedDates([]);
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

  // Helper to generate all dates in a range - fixed for timezone handling
  const getDatesInRange = (from, to) => {
    const dates = [];
    // Parse dates in local timezone to avoid timezone shifting
    const start = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    const current = new Date(start);
    while (current <= end) {
      // Format as YYYY-MM-DD in local timezone
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, "0");
      const day = String(current.getDate()).padStart(2, "0");
      dates.push(`${year}-${month}-${day}`);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const checkAvailability = async () => {
    setCheckingAvailability(true);
    setAvailabilityError(null);
    setFullyBookedDates([]);

    try {
      if (
        formData.post_type === "One-Time Post" &&
        formData.post_date_from &&
        formData.post_time
      ) {
        // Single date check
        const timeWithSeconds =
          formData.post_time.length === 5
            ? `${formData.post_time}:00`
            : formData.post_time;

        const response = await fetch("/api/ads/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: formData.post_date_from,
            post_type: formData.post_type,
            post_time: timeWithSeconds,
            exclude_ad_id: null,
          }),
        });

        if (!response.ok) {
          throw new Error(`Availability check failed: ${response.status}`);
        }

        const data = await response.json();

        if (!data.available) {
          if (data.is_time_blocked) {
            setAvailabilityError(
              "This time slot is already taken. Please choose a different time.",
            );
          } else if (data.is_day_full) {
            setAvailabilityError(
              "This date is fully booked. Please choose a different date.",
            );
          } else {
            setAvailabilityError("This time slot is not available.");
          }
        }
      } else if (
        formData.post_type === "Daily Run" &&
        formData.post_date_from &&
        formData.post_date_to
      ) {
        // Multi-date check for Daily Run
        const dates = getDatesInRange(
          formData.post_date_from,
          formData.post_date_to,
        );
        if (dates.length === 0 || dates.length > 365) return;

        const response = await fetch("/api/ads/availability-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dates,
            post_type: "Daily Run",
            exclude_ad_id: null,
          }),
        });

        if (!response.ok) {
          throw new Error(`Availability check failed: ${response.status}`);
        }

        const data = await response.json();
        const booked = [];

        for (const date of dates) {
          const info = data.results[date];
          if (info && info.is_full) {
            booked.push(date);
          }
        }

        if (booked.length > 0) {
          setFullyBookedDates(booked);
          setAvailabilityError("Some dates in your range are fully booked.");
        }
      } else if (
        formData.post_type === "Custom Schedule" &&
        formData.custom_dates.length > 0
      ) {
        // Multi-date check for Custom Schedule
        const validDates = formData.custom_dates.filter(
          (d) => d && d.length > 0,
        );
        if (validDates.length === 0) return;

        const response = await fetch("/api/ads/availability-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dates: validDates,
            post_type: "Custom Schedule",
            exclude_ad_id: null,
          }),
        });

        if (!response.ok) {
          throw new Error(`Availability check failed: ${response.status}`);
        }

        const data = await response.json();
        const booked = [];

        for (const date of validDates) {
          const info = data.results[date];
          if (info && info.is_full) {
            booked.push(date);
          }
        }

        if (booked.length > 0) {
          setFullyBookedDates(booked);
          setAvailabilityError("Some of your selected dates are fully booked.");
        }
      }
    } catch (err) {
      console.error("Error checking availability:", err);
      setAvailabilityError("Could not check availability. Please try again.");
    } finally {
      setCheckingAvailability(false);
    }
  };

  const validateDateTime = () => {
    const now = new Date();

    if (
      formData.post_type === "One-Time Post" &&
      formData.post_date_from &&
      formData.post_time
    ) {
      const selectedDateTime = new Date(
        `${formData.post_date_from}T${formData.post_time}`,
      );

      if (selectedDateTime < now) {
        setError("Cannot select a past date and time");
        setPastTimeError(
          "This date and time is in the past. Please choose a future time.",
        );
        return false;
      }
    }

    if (formData.post_type === "Daily Run") {
      const startDate = new Date(formData.post_date_from);
      startDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (startDate < today) {
        setError("Start date cannot be in the past");
        setPastTimeError(null);
        return false;
      }

      if (formData.post_date_to) {
        const endDate = new Date(formData.post_date_to);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Validate required fields
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

    // Block submission if there's a past time error
    if (pastTimeError) {
      setError(pastTimeError);
      setLoading(false);
      return;
    }

    // Validate date/time
    if (!validateDateTime()) {
      setLoading(false);
      return;
    }

    // Block if there are fully booked dates (for multi-date types)
    if (fullyBookedDates.length > 0) {
      setError("Please resolve fully booked dates before submitting.");
      setLoading(false);
      return;
    }

    // Check availability one more time before submitting
    if (
      formData.post_type === "One-Time Post" &&
      formData.post_date_from &&
      formData.post_time
    ) {
      try {
        const timeWithSeconds =
          formData.post_time.length === 5
            ? `${formData.post_time}:00`
            : formData.post_time;

        const availResponse = await fetch("/api/ads/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: formData.post_date_from,
            post_type: formData.post_type,
            post_time: timeWithSeconds,
            exclude_ad_id: null,
          }),
        });

        if (!availResponse.ok) {
          throw new Error(`Availability check failed: ${availResponse.status}`);
        }

        const availData = await availResponse.json();

        if (!availData.available) {
          if (availData.is_time_blocked) {
            setError(
              "This time slot is already taken. Please choose a different time.",
            );
          } else if (availData.is_day_full) {
            setError(
              "This date is fully booked. Please choose a different date.",
            );
          } else {
            setError(
              "This time slot is not available. Please choose a different time.",
            );
          }
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("Error checking availability:", err);
        // Don't block submission if availability check fails
      }
    }

    // Check multi-date availability one more time for Daily Run / Custom Schedule
    if (
      formData.post_type === "Daily Run" &&
      formData.post_date_from &&
      formData.post_date_to
    ) {
      try {
        const dates = getDatesInRange(
          formData.post_date_from,
          formData.post_date_to,
        );
        if (dates.length > 0 && dates.length <= 365) {
          const availResponse = await fetch("/api/ads/availability-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dates,
              post_type: "Daily Run",
              exclude_ad_id: null,
            }),
          });

          if (availResponse.ok) {
            const availData = await availResponse.json();
            const booked = dates.filter((d) => availData.results[d]?.is_full);
            if (booked.length > 0) {
              setFullyBookedDates(booked);
              setError(
                "Some dates in your range are fully booked. Please choose different dates.",
              );
              setLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.error("Error checking availability:", err);
      }
    }

    if (
      formData.post_type === "Custom Schedule" &&
      formData.custom_dates.length > 0
    ) {
      try {
        const validDates = formData.custom_dates.filter(
          (d) => d && d.length > 0,
        );
        if (validDates.length > 0) {
          const availResponse = await fetch("/api/ads/availability-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dates: validDates,
              post_type: "Custom Schedule",
              exclude_ad_id: null,
            }),
          });

          if (availResponse.ok) {
            const availData = await availResponse.json();
            const booked = validDates.filter(
              (d) => availData.results[d]?.is_full,
            );
            if (booked.length > 0) {
              setFullyBookedDates(booked);
              setError(
                "Some of your selected dates are fully booked. Please choose different dates.",
              );
              setLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.error("Error checking availability:", err);
      }
    }

    try {
      // Convert time to HH:MM:SS format for database storage
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

      setSuccess(true);
      // Reset form
      setFormData(initialFormData);
    } catch (err) {
      console.error("Error submitting ad:", err);
      setError(err.message || "Failed to submit ad request");
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
