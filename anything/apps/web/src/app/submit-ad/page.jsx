"use client";

import { useSubmitAdForm } from "@/hooks/useSubmitAdForm";
import { useModal } from "@/hooks/useModal";
import { AlertModal, ConfirmModal } from "@/components/Modal";
import { SuccessMessage } from "@/components/SubmitAdForm/SuccessMessage";
import { FormHeader } from "@/components/SubmitAdForm/FormHeader";
import { AdvertiserInfoSection } from "@/components/SubmitAdForm/AdvertiserInfoSection";
import { AdDetailsSection } from "@/components/SubmitAdForm/AdDetailsSection";
import { PostTypeSection } from "@/components/SubmitAdForm/PostTypeSection";
import { ScheduleSection } from "@/components/SubmitAdForm/ScheduleSection";
import { NotesSection } from "@/components/SubmitAdForm/NotesSection";

export default function SubmitAdPage() {
  const { modalState, showAlert, showConfirm } = useModal();

  const {
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
  } = useSubmitAdForm();

  if (success) {
    return <SuccessMessage onReset={resetSuccess} />;
  }

  return (
    <>
      {/* Modals */}
      {modalState.type === "alert" && (
        <AlertModal {...modalState.props} isOpen={modalState.isOpen} />
      )}
      {modalState.type === "confirm" && (
        <ConfirmModal {...modalState.props} isOpen={modalState.isOpen} />
      )}

      <div className="min-h-screen bg-white py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <FormHeader />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-10">
            <AdvertiserInfoSection
              formData={formData}
              onChange={handleChange}
            />

            <AdDetailsSection
              formData={formData}
              onChange={handleChange}
              onAddMedia={addMedia}
              onRemoveMedia={removeMedia}
              showAlert={showAlert}
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
              onAddCustomDate={addCustomDate}
              onRemoveCustomDate={removeCustomDate}
              onCheckAvailability={checkAvailability}
              checkingAvailability={checkingAvailability}
              availabilityError={availabilityError}
              pastTimeError={pastTimeError}
              fullyBookedDates={fullyBookedDates}
            />

            <NotesSection notes={formData.notes} onChange={handleChange} />

            {/* Submit */}
            <div className="pt-6 border-t">
              <button
                type="submit"
                disabled={
                  loading ||
                  checkingAvailability ||
                  !!availabilityError ||
                  !!pastTimeError
                }
                className="w-full bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {loading ? "Submitting..." : "Submit Ad Request"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
