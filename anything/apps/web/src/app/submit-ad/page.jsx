"use client";

import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useSubmitAdForm } from "@/hooks/useSubmitAdForm";
import { useModal } from "@/hooks/useModal";
import { AlertModal, ConfirmModal } from "@/components/Modal";
import { appToast } from "@/lib/toast";
import { FormHeader } from "@/components/SubmitAdForm/FormHeader";
import { AdvertiserInfoSection } from "@/components/SubmitAdForm/AdvertiserInfoSection";
import { AdDetailsSection } from "@/components/SubmitAdForm/AdDetailsSection";
import { PostTypeSection } from "@/components/SubmitAdForm/PostTypeSection";
import { ScheduleSection } from "@/components/SubmitAdForm/ScheduleSection";
import { NotesSection } from "@/components/SubmitAdForm/NotesSection";
import { AdPreview } from "@/components/SubmitAdForm/AdPreview";
import { CreateAdvertiserAccountStep } from "@/components/SubmitAdForm/CreateAdvertiserAccountStep";
import { VerifyAdvertiserEmailStep } from "@/components/SubmitAdForm/VerifyAdvertiserEmailStep";

export default function SubmitAdPage() {
  const { modalState, showAlert, showConfirm } = useModal();

  const {
    formData,
    submittedData,
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
  } = useSubmitAdForm();

  useEffect(() => {
    if (phase !== "form" || !error) {
      return;
    }

    appToast.error({
      title: "Unable to submit ad",
      description: error,
    });
  }, [error, phase]);

  const previewData = phase === "form" ? formData : submittedData || formData;
  const isSubmitDisabled =
    loading || checkingAvailability || !!availabilityError || !!pastTimeError;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = "/";
  };

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
            <div className="max-w-[680px] mx-auto mb-6">
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium"
              >
                <ArrowLeft size={18} />
                Back
              </button>
            </div>

            {phase === "account" ? (
              <CreateAdvertiserAccountStep
                accountData={accountData}
                accountError={accountError}
                accountLoading={accountLoading}
                submittedData={submittedData}
                onChange={handleAccountChange}
                onSubmit={submitAccountSetup}
              />
            ) : phase === "verify" ? (
              <VerifyAdvertiserEmailStep
                email={accountData.email || submittedData?.email || ""}
                resendLoading={resendLoading}
                resendMessage={resendMessage}
                resendError={resendError}
                onResend={resendVerification}
                onGoToSignIn={goToSignIn}
                onReset={resetSuccess}
              />
            ) : (
              <div className="max-w-[680px] mx-auto">
                <FormHeader />

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
