"use client";

export default function SubmitAdSuccessPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-gray-200 bg-white p-10 shadow-sm">
        <img
          src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
          alt="CBN"
          className="h-14 w-auto mb-8"
        />

        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Account Created
        </h1>

        <p className="text-gray-600 mb-8">
          Thank you for submitting your ad request. Your advertiser account has
          been created and your ad is under review. We'll be in touch soon.
        </p>

        <a
          href="/ads"
          className="inline-flex items-center justify-center bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium"
        >
          View Dashboard
        </a>
      </div>
    </div>
  );
}

export function HydrateFallback() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="animate-pulse text-gray-400 text-sm">Loading…</div>
    </div>
  );
}
