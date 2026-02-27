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
import { AdPreview } from "@/components/SubmitAdForm/AdPreview";

export default function SubmitAdPage() {
  const { modalState, showAlert, showConfirm } = useModal();

  const {
    formData,
    submittedData,
    customDate,
    setCustomDate,
    customTime,
    setCustomTime,
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
    updateCustomDateTime,
    addMedia,
    removeMedia,
    checkAvailability,
    handleSubmit,
    resetSuccess,
  } = useSubmitAdForm();

  const previewData = success ? submittedData : formData;
  const isSubmitDisabled =
    loading || checkingAvailability || !!availabilityError || !!pastTimeError;

  return (
    <>
      {modalState.type === "alert" && (
        <AlertModal {...modalState.props} isOpen={modalState.isOpen} />
      )}
      {modalState.type === "confirm" && (
        <ConfirmModal {...modalState.props} isOpen={modalState.isOpen} />
      )}

      <div className="min-h-screen bg-white">
        <div className="flex max-w-none mx-auto">
          <div className="flex-1 bg-white p-12">
            {success ? (
              <SuccessMessage onReset={resetSuccess} />
            ) : (
              <div className="max-w-[680px] mx-auto">
                <FormHeader />

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-8">
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
                    customTime={customTime}
                    setCustomTime={setCustomTime}
                    onAddCustomDate={addCustomDate}
                    onRemoveCustomDate={removeCustomDate}
                    onUpdateCustomDateTime={updateCustomDateTime}
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
                      disabled={isSubmitDisabled}
                      className="w-full bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                    >
                      {loading ? "Submitting..." : "Submit Ad Request"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <div className="hidden lg:block w-[700px] bg-[#F5F5F5] p-12 flex-shrink-0">
            <AdPreview formData={previewData} />
          </div>
        </div>
      </div>
    </>
  );
}