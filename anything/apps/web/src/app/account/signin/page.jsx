"use client";

import { useEffect, useState } from "react";
import {
  getSignedInUser,
  signIn,
  signOut,
} from "@/lib/localAuth";
import { ensureDb } from "@/lib/localDb";
import { appToast } from "@/lib/toast";

const getDefaultRedirectForUser = (user) => {
  const role = String(user?.role || "").trim().toLowerCase();
  return role === "advertiser" ? "/ads" : "/ads";
};

const resolveRedirectTarget = (user, params) => {
  const callbackUrl = String(params.get("callbackUrl") || "").trim();
  return callbackUrl || getDefaultRedirectForUser(user);
};

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!notice) {
      return;
    }

    appToast.success({
      title: "Account ready",
      description: notice,
    });
  }, [notice]);

  useEffect(() => {
    if (!error) {
      return;
    }

    appToast.error({
      title: "Unable to sign in",
      description: error,
    });
  }, [error]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const params = new URLSearchParams(window.location.search);
      const prefilledEmail = params.get("email");
      const verified = params.get("verified");
      const forceLogin =
        params.get("forceLogin") === "1" ||
        params.get("audience") === "advertiser" ||
        verified === "1";

      if (!cancelled && prefilledEmail) {
        setEmail(prefilledEmail);
      }
      if (!cancelled && verified === "1") {
        setNotice("Account verified. You can now sign in as Advertiser.");
      }

      if (forceLogin) {
        await signOut();
        return;
      }

      await ensureDb();

      const currentUser = getSignedInUser();
      if (!cancelled && currentUser) {
        window.location.href = resolveRedirectTarget(currentUser, params);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password) {
      setError("Please enter your email and password.");
      setLoading(false);
      return;
    }

    try {
      const result = await signIn({ email, password });
      if (!result.ok) {
        setError(result.error || "Incorrect email or password.");
        setLoading(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      await ensureDb();
      const currentUser = getSignedInUser() || result.user;
      window.location.replace(resolveRedirectTarget(currentUser, params));
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div
        className="hidden lg:flex lg:w-1/2 relative bg-cover bg-center"
        style={{
          backgroundImage:
            "url(https://ucarecdn.com/8d0941a2-8e3f-47fa-b87d-1904c04c4e0c/-/format/auto/)",
        }}
      >
        <div className="absolute inset-0 bg-black bg-opacity-40" />
        <div className="relative z-10 flex items-center justify-center w-full p-12">
          <div className="max-w-lg">
            <h1 className="text-5xl font-bold text-white leading-tight">
              GET YOUR
              <br />
              PRODUCT
              <br />
              SEEN
              <br />
              BY{" "}
              <span className="bg-black text-red-500 px-4 py-1 rounded-md inline-block">
                30,000+
              </span>
              <br />
              CUSTOMERS
              <br />
              DAILY!
            </h1>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <img
              src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
              alt="Logo"
              className="h-20 w-auto"
            />
          </div>

          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">Sign In</h2>
            <p className="text-gray-600 mt-2">Welcome back! Please sign in to continue.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition"
                placeholder="********"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
