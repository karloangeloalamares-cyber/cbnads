import { useEffect, useMemo, useRef, useState } from "react";
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

const clampWeeks = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(12, Math.max(2, Math.floor(parsed)));
};

const addDaysToDateKey = (dateKey, days) => {
  const normalized = String(dateKey || "").slice(0, 10);
  if (!normalized) return "";
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) return "";
  parsed.setDate(parsed.getDate() + Number(days || 0));
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const resolveWeeklyPreview = (formData, weekIndex) => {
  const overrides = Array.isArray(formData.multi_week_overrides) ? formData.multi_week_overrides : [];
  const override = overrides[weekIndex] && typeof overrides[weekIndex] === "object" ? overrides[weekIndex] : {};
  const baseName = String(formData.ad_name || "").trim();
  const baseText = String(formData.ad_text || "").trim();
  const baseMedia = Array.isArray(formData.media) ? formData.media : [];
  const useBaseMedia = override.use_base_media !== false;
  const scheduleTbd = Boolean(override.schedule_tbd);

  return {
    ...formData,
    ad_name: String(override.ad_name || "").trim() || (baseName ? `${baseName} (Week ${weekIndex + 1})` : `Week ${weekIndex + 1}`),
    ad_text: String(override.ad_text || "").trim() || baseText,
    media: useBaseMedia ? baseMedia : Array.isArray(override.media) ? override.media : [],
    post_date_from: scheduleTbd
      ? ""
      : String(override.post_date_from || "").trim() || addDaysToDateKey(formData.series_week_start, weekIndex * 7),
    post_time: scheduleTbd ? "" : String(override.post_time || "").trim(),
  };
};

export default function SubmitAdPage() {
  const { modalState, showAlert, showConfirm } = useModal();
  const [showPreview, setShowPreview] = useState(false);
  const [previewWeekIndex, setPreviewWeekIndex] = useState(0);

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

  useEffect(() => {
    if (!showPreview || !isMultiWeekPreview) {
      return;
    }
    setPreviewWeekIndex((current) => Math.min(previewWeekCount - 1, Math.max(0, current)));
  }, [isMultiWeekPreview, previewWeekCount, showPreview]);

  const previewSource = phase === "form" ? formData : submittedData || formData;
  const isMultiWeekPreview = previewSource.post_type === "Multi-week booking (TBD)";
  const previewWeekCount = useMemo(
    () => (isMultiWeekPreview ? clampWeeks(previewSource.multi_week_weeks || 1) : 0),
    [isMultiWeekPreview, previewSource.multi_week_weeks],
  );
  const previewData = useMemo(() => {
    if (!isMultiWeekPreview) {
      return previewSource;
    }

    const clampedIndex = Math.min(previewWeekCount - 1, Math.max(0, previewWeekIndex));
    return resolveWeeklyPreview(previewSource, clampedIndex);
  }, [isMultiWeekPreview, previewSource, previewWeekCount, previewWeekIndex]);
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
              <span className="text-sm font-semibold text-gray-900">
                {isMultiWeekPreview ? `Ad Preview - Week ${previewWeekIndex + 1}` : "Ad Preview"}
              </span>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-6">
              {isMultiWeekPreview ? (
                <div className="mb-5 flex flex-wrap gap-2">
                  {Array.from({ length: previewWeekCount }).map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setPreviewWeekIndex(index)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        previewWeekIndex === index
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {`Week ${index + 1}`}
                    </button>
                  ))}
                </div>
              ) : null}
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

