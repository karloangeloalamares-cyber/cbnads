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
            We sent a verification link to <span className="text-gray-900">{email}</span>.
          </p>

          <p className="text-sm text-gray-500 mb-8">
            Verify the account first, then sign in as Advertiser.
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
        <a
          href="mailto:advertise@cbnads.com"
          className="text-gray-900 underline hover:text-gray-700"
        >
          advertise@cbnads.com
        </a>
      </div>
    </div>
  );
}
