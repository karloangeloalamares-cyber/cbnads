"use client";

import { useEffect, useState } from "react";
import {
  completeOAuthSignIn,
  getSignedInUser,
  signIn,
  signInWithGoogle,
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
  const [googleLoading, setGoogleLoading] = useState(false);

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
      const oauthProvider = params.get("oauth");
      const isOauthCallback =
        oauthProvider === "google" ||
        params.has("code") ||
        params.has("error") ||
        params.has("error_description");
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

      if (forceLogin && !isOauthCallback) {
        await signOut();
        return;
      }

      if (isOauthCallback) {
        if (!cancelled) {
          setGoogleLoading(true);
        }

        const result = await completeOAuthSignIn();
        if (!cancelled) {
          setGoogleLoading(false);
        }

        if (result.ok) {
          const currentUser = getSignedInUser() || result.user;
          window.location.replace(resolveRedirectTarget(currentUser, params));
          return;
        }

        if (!cancelled && result.error) {
          setError(result.error);
        }
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

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);

    try {
      const params = new URLSearchParams(window.location.search);
      const result = await signInWithGoogle({
        callbackUrl: String(params.get("callbackUrl") || "").trim(),
      });

      if (!result.ok) {
        setError(result.error || "Unable to start Google sign-in.");
        setGoogleLoading(false);
      }
    } catch (err) {
      console.error("Google sign in error:", err);
      setError("Unable to start Google sign-in.");
      setGoogleLoading(false);
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
              disabled={loading || googleLoading}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wide text-gray-400">
              <span className="bg-white px-3">Or continue with</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading || googleLoading}
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
            <span>{googleLoading ? "Redirecting to Google..." : "Sign in with Google"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
