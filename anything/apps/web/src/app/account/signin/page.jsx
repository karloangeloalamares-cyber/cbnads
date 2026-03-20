"use client";

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import {
  completeOAuthSignIn,
  getSignedInUser,
  signIn,
  signInWithGoogle,
  signOut,
} from "@/lib/localAuth";
import { invalidateDbCache } from "@/lib/localDb";
import { getSupabaseClient, hasSupabaseConfig, publicAppUrl } from "@/lib/supabase";
import { appToast } from "@/lib/toast";

const getDefaultRedirectForUser = (user) => {
  const role = String(user?.role || "").trim().toLowerCase();
  return role === "advertiser" ? "/ads?section=Dashboard" : "/ads?section=Dashboard";
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const requestPasswordResetEmail = async ({ email }) => {
  if (!hasSupabaseConfig) {
    throw new Error("Password reset is unavailable right now.");
  }

  const supabase = getSupabaseClient();
  const fallbackAppUrl = String(publicAppUrl || "").trim();
  const redirectBase =
    (typeof window !== "undefined" && window.location?.origin) || fallbackAppUrl;
  const redirectTo = `${redirectBase}/account/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo,
  });
  if (error) {
    throw new Error(error.message || "Unable to send password reset email.");
  }

  return { ok: true };
};

const resolveRedirectTarget = (user, params) => {
  const callbackUrl = String(params.get("callbackUrl") || "").trim();
  return callbackUrl || getDefaultRedirectForUser(user);
};

export default function SignInPage() {
  const navigate = useNavigate();
  const hasRedirectedRef = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Forgot-password state
  const [view, setView] = useState("signin"); // "signin" | "forgot"
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const redirectTo = (target) => {
    const destination = String(target || "").trim();
    if (!destination || hasRedirectedRef.current) {
      return;
    }

    const hasScheme = /^[a-z][a-z\d+\-.]*:\/\//i.test(destination);
    if (hasScheme) {
      try {
        const url = new URL(destination);
        if (url.origin === window.location.origin) {
          hasRedirectedRef.current = true;
          navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
          return;
        }
      } catch {
        // Fall back to hard navigation for malformed absolute URLs.
      }

      hasRedirectedRef.current = true;
      window.location.assign(destination);
      return;
    }

    hasRedirectedRef.current = true;
    navigate(destination, { replace: true });
  };

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
        setForgotEmail(prefilledEmail);
      }
      if (!cancelled && verified === "1") {
        setNotice("Account verified. You can now sign in as Advertiser.");
      }

      const wasReset = params.get("reset") === "1";
      if (!cancelled && wasReset) {
        appToast.success({
          title: "Password updated!",
          description: "You can now sign in with your new password.",
        });
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
          invalidateDbCache();
          redirectTo(resolveRedirectTarget(currentUser, params));
          return;
        }

        if (!cancelled && result.error) {
          setError(result.error);
        }
      }

      const currentUser = getSignedInUser();
      if (!cancelled && currentUser) {
        redirectTo(resolveRedirectTarget(currentUser, params));
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
      const currentUser = getSignedInUser() || result.user;
      invalidateDbCache();
      redirectTo(resolveRedirectTarget(currentUser, params));
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotError("");
    if (!forgotEmail) {
      setForgotError("Please enter your email address.");
      return;
    }
    setForgotLoading(true);
    try {
      await requestPasswordResetEmail({ email: forgotEmail });
      setForgotSent(true);
    } catch (err) {
      console.error("Forgot password error:", err);
      setForgotError(err instanceof Error ? err.message : "Unable to send reset email.");
    } finally {
      setForgotLoading(false);
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
    <div className="min-h-app-screen flex flex-col bg-white lg:flex-row">
      <div
        className="relative hidden bg-cover bg-center lg:flex lg:w-1/2"
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

      <div className="safe-top-pad safe-bottom-pad flex w-full items-center justify-center bg-white px-4 py-6 sm:px-6 lg:w-1/2 lg:p-8">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <img
              src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
              alt="Logo"
              className="h-20 w-auto"
            />
          </div>

          <div className="text-center mb-8">
            {view === "forgot" ? (
              <>
                <h2 className="text-3xl font-bold text-gray-900">Reset Password</h2>
                <p className="text-gray-600 mt-2">
                  Enter your email and we'll send you a reset link.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-bold text-gray-900">Sign In</h2>
                <p className="text-gray-600 mt-2">Welcome back! Please sign in to continue.</p>
              </>
            )}
          </div>

          {/* ── Forgot password view ── */}
          {view === "forgot" ? (
            <div className="space-y-5">
              {forgotSent ? (
                <div className="text-center space-y-4">
                  <div className="text-5xl">📬</div>
                  <h3 className="text-xl font-semibold text-gray-900">Check your inbox</h3>
                  <p className="text-gray-600 text-sm">
                    If <strong>{forgotEmail}</strong> is registered, we sent a password reset link.
                    Check your spam folder if you don't see it within a minute.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setView("signin");
                      setForgotSent(false);
                      setForgotError("");
                    }}
                    className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-5">
                  <div>
                    <label
                      htmlFor="forgot-email"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Email Address
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                      autoFocus
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition"
                      placeholder="you@example.com"
                    />
                  </div>

                  {forgotError && (
                    <p className="text-sm text-red-600 text-center">{forgotError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {forgotLoading ? "Sending…" : "Send Reset Link"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setView("signin");
                      setForgotError("");
                    }}
                    className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-2"
                  >
                    ← Back to Sign In
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* ── Sign-in view ── */
            <>
              {error && error.includes("couldn't find an active account") ? (
                <div className="space-y-6">
                  <div className="bg-amber-50 border-l-4 border-amber-400 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-amber-400" xmlns="http://www.000webhost.com/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-amber-800">Account Not Found</h3>
                        <div className="mt-2 text-sm text-amber-700">
                          <p>{error}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { window.location.href = "/submit-ad"; }}
                    className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition"
                  >
                    Apply as an Advertiser
                  </button>
                  <button
                    type="button"
                    onClick={() => { setError(""); setEmail(""); setPassword(""); }}
                    className="w-full bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 rounded-lg border border-gray-300 transition"
                  >
                    Sign in with a different account
                  </button>
                </div>
              ) : (
                <>
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
                      <div className="flex items-center justify-between mb-2">
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setForgotEmail(email);
                            setView("forgot");
                          }}
                          className="text-sm text-red-500 hover:text-red-600 font-medium"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          required
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-11 outline-none transition focus:border-transparent focus:ring-2 focus:ring-red-500"
                          placeholder="********"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((current) => !current)}
                          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-gray-400 transition hover:text-gray-600"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          aria-pressed={showPassword}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
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
                      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.2 0-5.8-2.7-5.8-6s2.6-6 5.8-6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.6 14.5 2.7 12 2.7 6.9 2.7 2.8 6.8 2.8 12s4.1 9.3 9.2 9.3c5.3 0 8.8-3.7 8.8-8.9 0-.6-.1-1.1-.1-1.5H12Z" />
                      <path fill="#34A853" d="M3.9 7.3 7.1 9.6c.9-1.8 2.7-3 4.9-3 1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.6 14.5 2.7 12 2.7c-3.5 0-6.6 2-8.1 4.6Z" />
                      <path fill="#4A90E2" d="M12 21.3c2.4 0 4.5-.8 6-2.3l-2.8-2.2c-.8.6-1.8 1.1-3.2 1.1-3.7 0-5.1-2.5-5.4-3.8l-3.1 2.4c1.5 2.7 4.4 4.8 8.5 4.8Z" />
                      <path fill="#FBBC05" d="M6.6 14.1c-.1-.4-.2-.9-.2-1.4s.1-1 .2-1.4L3.4 8.9C3 9.9 2.8 10.9 2.8 12s.2 2.1.6 3.1l3.2-2.5Z" />
                    </svg>
                    <span>{googleLoading ? "Redirecting to Google..." : "Sign in with Google"}</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
