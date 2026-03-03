import { useEffect } from "react";
import { appToast } from "@/lib/toast";

export function CreateAdvertiserAccountStep({
  accountData,
  accountError,
  accountLoading,
  googleLoading,
  submittedData,
  onChange,
  onSubmit,
  onGoogleSignUp,
}) {
  useEffect(() => {
    if (!accountError) {
      return;
    }

    appToast.error({
      title: "Unable to create account",
      description: accountError,
    });
  }, [accountError]);

  const isAnyLoading = accountLoading || googleLoading;

  return (
    <div className="max-w-[680px] mx-auto">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
            <img
              src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
              alt="CBN Unfiltered Logo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Create your advertiser account
        </h1>
        <p className="text-gray-600 text-sm">
          Your ad request is in. Set your password so you can sign in as an advertiser
          and track future submissions.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-6">
        <div className="text-sm font-semibold text-gray-900 mb-1">Submitted ad</div>
        <div className="text-sm text-gray-600">
          {submittedData?.ad_name || "Untitled ad"} for{" "}
          {submittedData?.advertiser_name || "your business"}
        </div>
      </div>

      {/* Google Sign-Up Button */}
      <div className="mb-6">
        <button
          type="button"
          onClick={onGoogleSignUp}
          disabled={isAnyLoading}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.2 0-5.8-2.7-5.8-6s2.6-6 5.8-6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.6 14.5 2.7 12 2.7 6.9 2.7 2.8 6.8 2.8 12s4.1 9.3 9.2 9.3c5.3 0 8.8-3.7 8.8-8.9 0-.6-.1-1.1-.1-1.5H12Z"
            />
            <path
              fill="#34A853"
              d="M3.9 7.3 7.1 9.6c.9-1.8 2.7-3 4.9-3 1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.6 14.5 2.7 12 2.7c-3.5 0-6.6 2-8.1 4.6Z"
            />
            <path
              fill="#4A90E2"
              d="M12 21.3c2.4 0 4.5-.8 6-2.3l-2.8-2.2c-.8.6-1.8 1.1-3.2 1.1-3.7 0-5.1-2.5-5.4-3.8l-3.1 2.4c1.5 2.7 4.4 4.8 8.5 4.8Z"
            />
            <path
              fill="#FBBC05"
              d="M6.6 14.1c-.1-.4-.2-.9-.2-1.4s.1-1 .2-1.4L3.4 8.9C3 9.9 2.8 10.9 2.8 12s.2 2.1.6 3.1l3.2-2.5Z"
            />
          </svg>
          <span>
            {googleLoading ? "Connecting to Google..." : "Continue with Google"}
          </span>
        </button>
      </div>

      {/* Divider */}
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wide text-gray-400">
          <span className="bg-white px-3">Or create with email</span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-8">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Account Details</h3>

          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={accountData.email}
                onChange={(event) => onChange("email", event.target.value)}
                placeholder="your@email.com"
                className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-2">
                This will be your advertiser login email.
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={accountData.password}
                onChange={(event) => onChange("password", event.target.value)}
                placeholder="Create a password"
                className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
              />
            </div>

            <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Verify Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={accountData.confirmPassword}
                onChange={(event) => onChange("confirmPassword", event.target.value)}
                placeholder="Re-enter your password"
                className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t">
          <button
            type="submit"
            disabled={isAnyLoading}
            className="w-full bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            {accountLoading ? "Creating account..." : "Create advertiser account"}
          </button>
        </div>
      </form>
    </div>
  );
}
