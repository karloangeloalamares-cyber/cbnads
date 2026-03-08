import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, X } from "lucide-react";
import { useSubmitAdForm } from "@/hooks/useSubmitAdForm";
import { useModal } from "@/hooks/useModal";
import { AlertModal, ConfirmModal } from "@/components/Modal";
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
  const [showPreview, setShowPreview] = useState(false);

  const {
    formData,
    submittedData,
    phase,
    accountData,
    accountError,
    existingAccountPrompt,
    accountLoading,
    resendLoading,
    resendError,
    resendMessage,
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
    handleAccountChange,
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
    googleLoading,
    resendVerification,
    goToSignIn,
    resetSuccess,
  } = useSubmitAdForm();

  // Handle Google OAuth callback when redirected back to this page
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isGoogleCallback =
      params.get("googleLink") === "1" &&
      (params.has("code") || params.has("error") || params.get("oauth") === "google");

    if (isGoogleCallback) {
      completeGoogleLink();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const previewData = phase === "form" ? formData : submittedData || formData;
  const isSubmitDisabled = loading || !!pastTimeError;

  const honeypotRef = useRef(null);

  const handleHoneypotSubmit = (e) => {
    // If honeypot field is filled, a bot submitted the form — silently abort
    if (honeypotRef.current && honeypotRef.current.value) {
      e.preventDefault();
      return;
    }
    handleSubmit(e);
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
          <div className="flex-1 bg-white px-5 py-8 sm:px-6 sm:py-10 xl:p-12">
            <div className="max-w-[680px] mx-auto mb-6 flex items-center justify-between">
              <a
                href="/"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium"
              >
                <ArrowLeft size={18} />
                Back
              </a>
              {phase === "form" && (
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400"
                >
                  <Eye size={15} />
                  Preview
                </button>
              )}
            </div>

            {phase === "account" ? (
              <CreateAdvertiserAccountStep
                accountData={accountData}
                accountError={accountError}
                existingAccountPrompt={existingAccountPrompt}
                accountLoading={accountLoading}
                googleLoading={googleLoading}
                submittedData={submittedData}
                onChange={handleAccountChange}
                onSubmit={submitAccountSetup}
                onGoogleSignUp={continueWithGoogle}
                onGoToSignIn={goToSignIn}
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

                <form onSubmit={handleHoneypotSubmit} method="post" className="space-y-8">
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

                  {/* Honeypot field — hidden from real users, catches bots */}
                  <input
                    ref={honeypotRef}
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    style={{ position: "absolute", left: "-9999px", opacity: 0, pointerEvents: "none" }}
                  />

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
        </div>
      </div>

      {/* Ad Preview Modal — Issue #12 */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPreview(false); }}
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
      )}
    </>
  );
}

export function HydrateFallback() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="animate-pulse text-gray-400 text-sm">Loading…</div>
    </div>
  );
}

