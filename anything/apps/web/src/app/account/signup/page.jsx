"use client";

export default function SignUpPage() {
  return (
    <div className="min-h-app-screen safe-top-pad safe-bottom-pad flex items-center justify-center bg-gray-50 px-4 py-6 sm:p-8">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mb-6">
          <img
            src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
            alt="Logo"
            className="h-16 w-auto mx-auto"
          />
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-4">
          Sign Up Disabled
        </h1>

        <p className="text-gray-600 mb-6">
          Public sign-ups are not available. Please contact your administrator
          to request an account.
        </p>

        <a
          href="/account/signin"
          className="inline-block bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-6 rounded-lg transition"
        >
          Back to Sign In
        </a>
      </div>
    </div>
  );
}
