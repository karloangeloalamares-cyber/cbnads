"use client";

import { useEffect, useState } from "react";
import { DEFAULT_ADMIN_CREDENTIALS, getSignedInUser, signIn } from "@/lib/localAuth";
import { ensureDb } from "@/lib/localDb";

export default function SignInPage() {
  const [email, setEmail] = useState(DEFAULT_ADMIN_CREDENTIALS.email);
  const [password, setPassword] = useState(DEFAULT_ADMIN_CREDENTIALS.password);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    ensureDb();
    if (getSignedInUser()) {
      window.location.href = "/ads";
    }
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const result = signIn({ email, password });
    if (!result.ok) {
      setError(result.error || "Sign in failed.");
      setLoading(false);
      return;
    }

    window.location.href = "/ads";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <img
            src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
            alt="Logo"
            className="mx-auto mb-4 h-16 w-auto"
          />
          <h1 className="text-2xl font-bold text-gray-900">Admin Sign In</h1>
          <p className="mt-2 text-sm text-gray-600">Local mode with browser storage only.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <p className="font-semibold text-gray-700">Default local credentials:</p>
          <p>Email: {DEFAULT_ADMIN_CREDENTIALS.email}</p>
          <p>Password: {DEFAULT_ADMIN_CREDENTIALS.password}</p>
        </div>
      </div>
    </div>
  );
}
