import { useEffect } from "react";
import { appToast } from "@/lib/toast";

export function CreateAdvertiserAccountStep({
  accountData,
  accountError,
  accountLoading,
  submittedData,
  onChange,
  onSubmit,
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
            disabled={accountLoading}
            className="w-full bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            {accountLoading ? "Creating account..." : "Create advertiser account"}
          </button>
        </div>
      </form>
    </div>
  );
}
