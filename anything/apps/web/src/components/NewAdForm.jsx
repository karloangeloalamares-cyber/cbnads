"use client";

import { useState, useEffect, useRef } from "react";
import { useUpload } from "@/utils/useUpload";
import { useAdFormData } from "@/hooks/useAdFormData";
import { useModal } from "@/hooks/useModal";
import { AlertModal, ConfirmModal } from "./Modal";
import { FormHeader } from "./NewAdForm/FormHeader";
import { DetailsSection } from "./NewAdForm/DetailsSection";
import { PostTypeSection } from "./NewAdForm/PostTypeSection";
import { ScheduleSection } from "./NewAdForm/ScheduleSection";
import { PaymentSection } from "./NewAdForm/PaymentSection";
import { AdContentSection } from "./NewAdForm/AdContentSection";

export default function NewAdForm({
  editingAd,
  initialFormData,
  onCancel,
  onSuccess,
  onContinueToBilling,
}) {
  const {
    advertisers,
    products,
    formData,
    setFormData,
    handleProductChange,
    addCustomDate,
    updateCustomDate,
    removeCustomDate,
    removeMedia,
    addAdvertiser,
  } = useAdFormData(editingAd, initialFormData);

  const [upload, { loading: uploading }] = useUpload();
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialFormDataRef = useRef(null);
  const { modalState, showAlert, showConfirm } = useModal();

  // Track initial form data to detect changes
  useEffect(() => {
    if (initialFormDataRef.current === null && formData) {
      initialFormDataRef.current = JSON.stringify(formData);
    }
  }, [formData]);

  // Detect unsaved changes
  useEffect(() => {
    if (initialFormDataRef.current && formData) {
      const currentData = JSON.stringify(formData);
      setHasUnsavedChanges(currentData !== initialFormDataRef.current);
    }
  }, [formData]);

  // Warn before leaving page if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleMediaUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        // Check video file size (200 MB limit)
        const isVideo = file.type.startsWith("video/");
        const maxSize = 200 * 1024 * 1024; // 200 MB in bytes

        if (isVideo && file.size > maxSize) {
          await showAlert({
            title: "File Too Large",
            message: `${file.name} is too large. Videos must be under 200 MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
            variant: "warning",
          });
          continue;
        }

        const result = await upload({ file });
        if (result.error) {
          console.error("Failed to upload media:", result.error);
          await showAlert({
            title: "Upload Failed",
            message: `Failed to upload ${file.name}: ${result.error}`,
            variant: "danger",
          });
          continue;
        }
        const mediaType = file.type.startsWith("video/") ? "video" : "image";
        setFormData((prev) => ({
          ...prev,
          media: [
            ...prev.media,
            { url: result.url, type: mediaType, name: file.name },
          ],
        }));
      } catch (error) {
        console.error("Failed to upload media:", error);
        await showAlert({
          title: "Upload Failed",
          message: `Failed to upload ${file.name}`,
          variant: "danger",
        });
      }
    }

    // Reset the input
    e.target.value = "";
  };

  const validateForm = async () => {
    // Required fields
    if (!formData.adName?.trim()) {
      await showAlert({
        title: "Validation Error",
        message: "Please enter an ad name",
        variant: "warning",
      });
      return false;
    }
    if (!formData.advertiser) {
      await showAlert({
        title: "Validation Error",
        message: "Please select an advertiser",
        variant: "warning",
      });
      return false;
    }
    if (!formData.postType) {
      await showAlert({
        title: "Validation Error",
        message: "Please select a post type",
        variant: "warning",
      });
      return false;
    }
    if (!formData.placement) {
      await showAlert({
        title: "Validation Error",
        message: "Please select a placement",
        variant: "warning",
      });
      return false;
    }

    // Schedule validation
    if (formData.postType === "One-Time Post" && !formData.postDate) {
      await showAlert({
        title: "Validation Error",
        message: "Please select a date for the one-time post",
        variant: "warning",
      });
      return false;
    }
    if (formData.postType === "Daily Run") {
      if (!formData.postDateFrom || !formData.postDateTo) {
        await showAlert({
          title: "Validation Error",
          message: "Please select start and end dates for the daily run",
          variant: "warning",
        });
        return false;
      }
    }
    if (
      formData.postType === "Custom Schedule" &&
      (!formData.customDates || formData.customDates.length === 0)
    ) {
      await showAlert({
        title: "Validation Error",
        message: "Please add at least one custom date",
        variant: "warning",
      });
      return false;
    }

    return true;
  };

  const checkInactiveAdvertiser = async () => {
    if (!formData.advertiser) return true;

    try {
      const response = await fetch("/api/advertisers/list");
      if (!response.ok) {
        console.error("Failed to fetch advertisers");
        return true; // Continue anyway if we can't check
      }

      const data = await response.json();
      const advertiser = data.advertisers?.find(
        (a) => a.advertiser_name === formData.advertiser,
      );

      if (advertiser && advertiser.status === "Inactive") {
        return await showConfirm({
          title: "Inactive Advertiser",
          message: `Warning: ${advertiser.advertiser_name} is marked as Inactive. Do you want to continue anyway?`,
          confirmText: "Continue",
          cancelText: "Cancel",
          variant: "warning",
        });
      }

      return true;
    } catch (error) {
      console.error("Failed to check advertiser status:", error);
      return true; // Continue anyway if check fails
    }
  };

  const convertTo24Hour = (time12h) => {
    if (!time12h) return null;

    const [time, modifier] = time12h.split(" ");
    let [hours, minutes] = time.split(":");

    if (hours === "12") {
      hours = "00";
    }

    if (modifier === "PM") {
      hours = parseInt(hours, 10) + 12;
    }

    return `${hours}:${minutes}:00`;
  };

  const prepareAdData = (status = "Draft") => {
    // Build time string from hour, minute, period
    let timeString = null;
    if (formData.postHour && formData.postMinute && formData.postPeriod) {
      timeString = `${formData.postHour}:${formData.postMinute} ${formData.postPeriod}`;
    }

    // Calculate reminder minutes
    let reminderMinutes = 15; // default
    if (formData.reminder === "15-min") {
      reminderMinutes = 15;
    } else if (formData.reminder === "30-min") {
      reminderMinutes = 30;
    } else if (formData.reminder === "1-hour") {
      reminderMinutes = 60;
    } else if (formData.reminder === "1-day") {
      reminderMinutes = 1440;
    } else if (
      formData.reminder === "custom" &&
      formData.customReminderMinutes
    ) {
      reminderMinutes = parseInt(formData.customReminderMinutes) || 15;
    }

    // Determine payment value based on payment mode
    let paymentValue;
    if (formData.paymentMode === "TBD") {
      paymentValue = "TBD";
    } else if (formData.paymentMode === "Paid") {
      paymentValue = "Paid";
    } else if (
      formData.paymentMode === "Custom Amount" &&
      formData.overrideAmount
    ) {
      // Format the custom amount
      paymentValue = `$${parseFloat(formData.overrideAmount.replace(/[$,]/g, "")).toFixed(2)}`;
    } else {
      // Fallback to TBD if Custom Amount is selected but no amount entered
      paymentValue = "TBD";
    }

    const data = {
      ad_name: formData.adName,
      advertiser: formData.advertiser,
      status: status,
      post_type: formData.postType,
      placement: formData.placement,
      payment: paymentValue,
      ad_text: formData.adText || "",
      media: formData.media || [],
      product_id: formData.product_id || null,
      post_time: timeString ? convertTo24Hour(timeString) : null,
      reminder_minutes: reminderMinutes,
    };

    // Add schedule fields based on post type
    if (formData.postType === "One-Time Post") {
      data.schedule = formData.postDate;
    } else if (formData.postType === "Daily Run") {
      data.post_date_from = formData.postDateFrom;
      data.post_date_to = formData.postDateTo;
    } else if (formData.postType === "Custom Schedule") {
      data.custom_dates = formData.customDates || [];
    }

    return data;
  };

  const handleSave = async () => {
    const isValid = await validateForm();
    if (!isValid) return;

    const continueAfterCheck = await checkInactiveAdvertiser();
    if (!continueAfterCheck) return;

    setSaving(true);
    try {
      const adData = prepareAdData(editingAd?.status || "Draft");

      const response = await fetch("/api/ads/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingAd.id,
          ...adData,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update ad");
      }

      // Reset unsaved changes tracking
      setHasUnsavedChanges(false);
      initialFormDataRef.current = null;

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Failed to save ad:", error);
      await showAlert({
        title: "Save Failed",
        message: `Failed to save ad: ${error.message}`,
        variant: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsDraft = async () => {
    const isValid = await validateForm();
    if (!isValid) return;

    const continueAfterCheck = await checkInactiveAdvertiser();
    if (!continueAfterCheck) return;

    setSaving(true);
    try {
      const adData = prepareAdData("Draft");

      const response = await fetch("/api/ads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create ad");
      }

      // Reset unsaved changes tracking
      setHasUnsavedChanges(false);
      initialFormDataRef.current = null;

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Failed to save draft:", error);
      await showAlert({
        title: "Save Failed",
        message: `Failed to save draft: ${error.message}`,
        variant: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleContinueToBilling = async () => {
    const isValid = await validateForm();
    if (!isValid) return;

    const continueAfterCheck = await checkInactiveAdvertiser();
    if (!continueAfterCheck) return;

    if (onContinueToBilling) {
      onContinueToBilling(formData);
    }
  };

  const handleCancel = async () => {
    if (hasUnsavedChanges) {
      const confirmLeave = await showConfirm({
        title: "Unsaved Changes",
        message: "You have unsaved changes. Are you sure you want to leave?",
        confirmText: "Leave",
        cancelText: "Stay",
        variant: "warning",
      });
      if (!confirmLeave) return;
    }
    onCancel();
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      {/* Modals */}
      {modalState.type === "alert" && (
        <AlertModal {...modalState.props} isOpen={modalState.isOpen} />
      )}
      {modalState.type === "confirm" && (
        <ConfirmModal {...modalState.props} isOpen={modalState.isOpen} />
      )}

      <FormHeader
        onCancel={handleCancel}
        onSave={handleSave}
        onSaveDraft={handleSaveAsDraft}
        onContinueToBilling={handleContinueToBilling}
        isEditing={!!editingAd}
        saving={saving}
        hasUnsavedChanges={hasUnsavedChanges}
      />
      <div className="max-w-[800px] mx-auto py-10 px-6">
        <div className="mb-10">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            {editingAd ? "Edit advertisement" : "Create a new ad"}
          </h2>
          <p className="text-sm text-gray-500">
            {editingAd
              ? "Update the details below to modify your advertisement"
              : "Fill in the details below to create your advertisement"}
          </p>
        </div>
        <DetailsSection
          formData={formData}
          advertisers={advertisers}
          products={products}
          onFormDataChange={setFormData}
          onProductChange={handleProductChange}
          onAdvertiserCreated={addAdvertiser}
        />
        <PostTypeSection
          postType={formData.postType}
          onPostTypeChange={(postType) =>
            setFormData({ ...formData, postType })
          }
        />
        <ScheduleSection
          formData={formData}
          onFormDataChange={setFormData}
          onAddCustomDate={addCustomDate}
          onUpdateCustomDate={updateCustomDate}
          onRemoveCustomDate={removeCustomDate}
        />
        <PaymentSection
          paymentMode={formData.paymentMode}
          onPaymentModeChange={(value) =>
            setFormData({ ...formData, paymentMode: value })
          }
          overrideAmount={formData.overrideAmount}
          onOverrideAmountChange={(value) =>
            setFormData({ ...formData, overrideAmount: value })
          }
        />
        <AdContentSection
          adText={formData.adText}
          media={formData.media}
          uploading={uploading}
          onAdTextChange={(value) =>
            setFormData({ ...formData, adText: value })
          }
          onMediaUpload={handleMediaUpload}
          onRemoveMedia={removeMedia}
        />
      </div>
    </div>
  );
}
