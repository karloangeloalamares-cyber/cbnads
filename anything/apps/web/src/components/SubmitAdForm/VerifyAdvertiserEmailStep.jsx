import { useEffect } from "react";
import { appToast } from "@/lib/toast";

export function VerifyAdvertiserEmailStep({
  email,
  resendLoading,
  resendMessage,
  resendError,
  onResend,
  onGoToSignIn,
  onReset,
}) {
  useEffect(() => {
    if (!resendError) {
      return;
    }

    appToast.error({
      title: "Failed to resend verification email",
      description: resendError,
    });
  }, [resendError]);

  useEffect(() => {
    if (!resendMessage) {
      return;
    }

    appToast.success({
      title: "Verification email sent",
      description: resendMessage,
    });
  }, [resendMessage]);

  return (
    <div className="max-w-[680px] mx-auto h-full flex flex-col py-12">
      <div className="flex-1" />

      <div>
        <div className="mb-12">
          <img
            src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
            alt="CBN Unfiltered"
            className="h-12 w-auto mb-8"
          />

          <h1 className="text-4xl font-bold text-gray-900 mb-4">Check your email</h1>

          <p className="text-lg text-gray-600 mb-3">
            Check <span className="text-gray-900">{email}</span> for next steps.
          </p>

          <p className="text-sm text-gray-500 mb-8">
            If this account still needs verification, we&apos;ll email a link there. If
            it is already active, sign in as Advertiser instead.
          </p>

          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-8">
            If you do not see the email in a few minutes, check your Spam or Junk folder.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onGoToSignIn}
              className="bg-black text-white px-8 py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium"
            >
              Go to Sign In
            </button>

            <button
              type="button"
              onClick={onResend}
              disabled={resendLoading}
              className="border border-gray-300 text-gray-900 px-8 py-3 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendLoading ? "Sending..." : "Resend verification email"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
        <button
          type="button"
          onClick={onReset}
          className="text-gray-900 underline hover:text-gray-700"
        >
          Submit another ad
        </button>
        <span>or</span>
        <span>email us at</span>
        <a
          href="mailto:advertise@cbn.com"
          className="text-gray-900 underline hover:text-gray-700"
        >
          advertise@cbn.com
        </a>
      </div>
    </div>
  );
}
