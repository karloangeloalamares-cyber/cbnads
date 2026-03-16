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
import {
  clampWeeks,
  resolveAdvertiserMultiWeekPreview,
} from "@/lib/multiWeekBooking";
import { navigateBackWithFallback } from "@/lib/navigation";

export default function SubmitAdPage() {
  const { modalState, showAlert, showConfirm } = useModal();
  const [showPreview, setShowPreview] = useState(false);
  const [previewWeekIndex, setPreviewWeekIndex] = useState(0);
  const [showMultiWeekWorkspace, setShowMultiWeekWorkspace] = useState(false);

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

  const previewSource = phase === "form" ? formData : submittedData || formData;
  const isMultiWeekPreview = previewSource.post_type === "Multi-week booking (TBD)";
  const previewWeekCount = useMemo(
    () => (isMultiWeekPreview ? clampWeeks(previewSource.multi_week_weeks || 1) : 0),
    [isMultiWeekPreview, previewSource.multi_week_weeks],
  );

  useEffect(() => {
    if (!showPreview || !isMultiWeekPreview) {
      return;
    }
    setPreviewWeekIndex((current) => Math.min(previewWeekCount - 1, Math.max(0, current)));
  }, [isMultiWeekPreview, previewWeekCount, showPreview]);

  const previewData = useMemo(() => {
    if (!isMultiWeekPreview) {
      return previewSource;
    }

    const clampedIndex = Math.min(previewWeekCount - 1, Math.max(0, previewWeekIndex));
    return resolveAdvertiserMultiWeekPreview(previewSource, clampedIndex);
  }, [isMultiWeekPreview, previewSource, previewWeekCount, previewWeekIndex]);
  const isSubmitDisabled = loading || !!pastTimeError;
  const isDedicatedMultiWeek = phase === "form" && showMultiWeekWorkspace;
  const useSplitLayout = phase === "form";

  const honeypotRef = useRef(null);

  const handleHoneypotSubmit = (e) => {
    // If honeypot field is filled, a bot submitted the form — silently abort
    if (honeypotRef.current && honeypotRef.current.value) {
      e.preventDefault();
      return;
    }
    handleSubmit(e);
  };

  const handlePageBack = () => {
    if (isDedicatedMultiWeek) {
      setShowMultiWeekWorkspace(false);
      handleChange("post_type", "One-Time Post");
      return;
    }

    navigateBackWithFallback({ fallbackPath: "/" });
  };

  return (
    <>
      {modalState.type === "alert" && (
        <AlertModal {...modalState.props} isOpen={modalState.isOpen} />
      )}
      {modalState.type === "confirm" && (
        <ConfirmModal {...modalState.props} isOpen={modalState.isOpen} />
      )}

      <div className={`min-h-screen ${isDedicatedMultiWeek ? "bg-[#FAFAFA]" : "bg-white"}`}>
        <div className="flex max-w-none mx-auto">
          <div className={`flex-1 px-5 py-8 sm:px-6 sm:py-10 xl:p-12 ${isDedicatedMultiWeek ? "bg-[#FAFAFA]" : "bg-white"}`}>
            <div className={`${useSplitLayout ? "max-w-[1380px]" : "max-w-[680px]"} mx-auto mb-6 flex items-center justify-between`}>
              <button
                type="button"
                onClick={handlePageBack}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium"
              >
                <ArrowLeft size={18} />
                Back
              </button>
              {phase === "form" && (
                <div className="flex items-center gap-2">
                  {!isDedicatedMultiWeek ? (
                    <button
                      type="button"
                      onClick={() => setShowPreview(true)}
                      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400 lg:hidden"
                    >
                      <Eye size={15} />
                      Preview
                    </button>
                  ) : null}
                </div>
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
              <div className={useSplitLayout ? "max-w-[1380px] mx-auto grid gap-8 xl:gap-10 lg:grid-cols-[minmax(0,820px)_380px] xl:grid-cols-[minmax(0,880px)_420px] items-start" : "max-w-[680px] mx-auto"}>
                <div className={useSplitLayout ? "min-w-0" : ""}>
                {isDedicatedMultiWeek ? (
                  <div className="mb-8 rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-sm sm:px-8 sm:py-7">
                    <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                      <div className="max-w-2xl">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                          Series Request
                        </p>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create multi-week booking</h1>
                        <p className="text-sm leading-6 text-gray-600">
                          Build one ad request per week, set the week count and anchor date here, then submit the series for admin review. Product and pricing can be attached later during approval.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 self-start">
                        <button
                          type="button"
                          onClick={() => {
                            setShowMultiWeekWorkspace(false);
                            handleChange("post_type", "One-Time Post");
                          }}
                          className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          form="submit-ad-form"
                          disabled={isSubmitDisabled}
                          className="px-4 py-2 bg-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loading ? "Submitting..." : "Submit booking"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-gray-200 bg-[#FAFAFA] px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Weeks
                        </div>
                        <input
                          type="number"
                          min={2}
                          max={12}
                          value={formData.multi_week_weeks || 4}
                          onChange={(event) => handleChange("multi_week_weeks", event.target.value)}
                          className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-base font-semibold text-gray-900 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                        />
                        <p className="mt-2 text-xs text-gray-500">Choose between 2 and 12 linked weekly requests.</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-[#FAFAFA] px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Week 1 Start
                        </div>
                        <input
                          type="date"
                          value={formData.series_week_start || ""}
                          onChange={(event) => handleChange("series_week_start", event.target.value)}
                          className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                        />
                        <p className="mt-2 text-xs text-gray-500">This anchors the sequence for the rest of the series.</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-[#FAFAFA] px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Review Flow
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-900">
                          Admin assigns product later
                        </div>
                        <p className="mt-2 text-xs text-gray-500">Use this form for schedule and creative only. Product and pricing are attached during review.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-8 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <FormHeader />
                    </div>
                    <div className="hidden lg:flex shrink-0 pt-16">
                      <button
                        type="button"
                        onClick={() => {
                          handleChange("post_type", "Multi-week booking (TBD)");
                          setShowMultiWeekWorkspace(true);
                        }}
                        className="h-10 px-4 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-all"
                      >
                        Multi-week booking
                      </button>
                    </div>
                  </div>
                )}

                <form
                  id="submit-ad-form"
                  onSubmit={handleHoneypotSubmit}
                  method="post"
                  className={useSplitLayout ? "space-y-10 rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-sm sm:px-8 sm:py-8" : "space-y-8"}
                >
                  <AdvertiserInfoSection
                    formData={formData}
                    onChange={handleChange}
                  />

                  {!isDedicatedMultiWeek ? (
                    <AdDetailsSection
                      formData={formData}
                      onChange={handleChange}
                      onAddMedia={addMedia}
                      onRemoveMedia={removeMedia}
                      showAlert={showAlert}
                    />
                  ) : null}

                  {!isDedicatedMultiWeek ? (
                    <PostTypeSection
                      selectedType={formData.post_type}
                      onChange={handleChange}
                      includeMultiWeek={false}
                    />
                  ) : null}

                  <ScheduleSection
                    postType={isDedicatedMultiWeek ? "Multi-week booking (TBD)" : formData.post_type}
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
                    products={[]}
                    variant={isDedicatedMultiWeek ? "public-review-multi-week" : "default"}
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

                  {!isDedicatedMultiWeek ? (
                    <div className="pt-6 border-t">
                      <button
                        type="submit"
                        disabled={isSubmitDisabled}
                        className="w-full bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                      >
                        {loading ? "Submitting..." : "Submit Ad Request"}
                      </button>
                    </div>
                  ) : null}
                </form>
                </div>
                {useSplitLayout ? (
                  <div className="hidden lg:flex sticky top-8 min-h-[720px] rounded-[32px] border border-gray-200 bg-white p-5 shadow-sm xl:p-6">
                    <div className="flex w-full flex-col rounded-[26px] bg-[#F7F4EE] px-5 py-5">
                      <div className="mb-5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                          Live Preview
                        </div>
                        {isDedicatedMultiWeek ? (
                          <div className="mt-2 text-sm font-semibold text-gray-900">
                            {`Week ${previewWeekIndex + 1}`}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm font-semibold text-gray-900">
                            Main submit-ad preview
                          </div>
                        )}
                        <p className="mt-1 text-xs leading-5 text-gray-600">
                          {isDedicatedMultiWeek
                            ? "Switch weeks to review copy, media, and schedule overrides before you submit the full series."
                            : "Your mobile ad preview updates as you fill in the form."}
                        </p>
                      </div>
                      {isDedicatedMultiWeek ? (
                        <div className="mb-5 grid grid-cols-2 gap-2">
                          {Array.from({ length: previewWeekCount }).map((_, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => setPreviewWeekIndex(index)}
                              className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                                previewWeekIndex === index
                                  ? "border-gray-900 bg-gray-900 text-white"
                                  : "border-white bg-white/80 text-gray-700 hover:border-gray-300"
                              }`}
                            >
                              {`Week ${index + 1}`}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex-1 rounded-[28px] bg-white px-3 py-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
                        <AdPreview formData={previewData} />
                      </div>
                    </div>
                  </div>
                ) : null}
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

