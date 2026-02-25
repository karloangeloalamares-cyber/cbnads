"use client";

import useAuth from "@/utils/useAuth";

export default function LogoutPage() {
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut({
      callbackUrl: "/account/signin",
      redirect: true,
    });
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
        <h1 className="mb-8 text-center text-2xl font-semibold text-gray-900">
          Sign Out
        </h1>

        <button
          onClick={handleSignOut}
          className="w-full rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
