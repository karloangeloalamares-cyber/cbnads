"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";
import { updatePassword } from "@/lib/localAuth";
import { appToast } from "@/lib/toast";

const Shell = ({ children }) => (
    <div className="min-h-screen flex">
        {/* Left hero panel */}
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
        {/* Right content panel */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
            <div className="w-full max-w-md">
                <div className="flex justify-center mb-8">
                    <img
                        src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
                        alt="Logo"
                        className="h-20 w-auto"
                    />
                </div>
                {children}
            </div>
        </div>
    </div>
);

export default function ResetPasswordPage() {
    const [view, setView] = useState("loading"); // loading | form | success | error
    const [errorMessage, setErrorMessage] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!hasSupabaseConfig) {
            setView("error");
            setErrorMessage("Auth is not configured.");
            return;
        }

        // Supabase embeds the recovery token in the URL hash (#access_token=...&type=recovery)
        // getSession() will exchange the token automatically if it's present in the hash.
        const supabase = getSupabaseClient();
        supabase.auth.getSession().then(({ data, error }) => {
            if (error || !data?.session) {
                setView("error");
                setErrorMessage(
                    "This reset link is invalid or has already been used. Please request a new one."
                );
                return;
            }
            setView("form");
        });
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage("");

        if (password.length < 8) {
            setErrorMessage("Password must be at least 8 characters.");
            return;
        }
        if (password !== confirm) {
            setErrorMessage("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            const result = await updatePassword({ newPassword: password });
            if (!result.ok) {
                setErrorMessage(result.error || "Failed to update password.");
                setLoading(false);
                return;
            }
            setView("success");
        } catch (err) {
            console.error("Reset password error:", err);
            setErrorMessage("Something went wrong. Please try again.");
            setLoading(false);
        }
    };

    useEffect(() => {
        if (view === "success") {
            const timer = setTimeout(() => {
                window.location.href = "/account/signin?reset=1";
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [view]);

    // ─── LAYOUTS ────────────────────────────────────────────────────────────────

    if (view === "loading") {
        return (
            <Shell>
                <div className="text-center text-gray-500">Verifying reset link…</div>
            </Shell>
        );
    }

    if (view === "success") {
        return (
            <Shell>
                <div className="text-center space-y-4">
                    <div className="text-5xl">✅</div>
                    <h2 className="text-2xl font-bold text-gray-900">Password updated!</h2>
                    <p className="text-gray-600">
                        Your password has been changed. Redirecting you to sign in…
                    </p>
                    <a
                        href="/account/signin"
                        className="inline-block mt-4 text-red-500 font-semibold underline hover:text-red-600"
                    >
                        Go to sign in
                    </a>
                </div>
            </Shell>
        );
    }

    if (view === "error") {
        return (
            <Shell>
                <div className="text-center space-y-4">
                    <div className="text-5xl">⚠️</div>
                    <h2 className="text-2xl font-bold text-gray-900">Link expired</h2>
                    <p className="text-gray-600">{errorMessage}</p>
                    <a
                        href="/account/signin"
                        className="inline-block mt-4 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-6 rounded-lg transition"
                    >
                        Back to Sign In
                    </a>
                </div>
            </Shell>
        );
    }

    // view === "form"
    return (
        <Shell>
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900">Set New Password</h2>
                <p className="text-gray-600 mt-2">Enter your new password below.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label
                        htmlFor="new-password"
                        className="block text-sm font-medium text-gray-700 mb-2"
                    >
                        New Password
                    </label>
                    <input
                        id="new-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition"
                        placeholder="Minimum 8 characters"
                    />
                    <p className="text-sm text-gray-500 mt-2">
                        Password must be at least 8 characters long, containing a mix of numbers, letters, and special characters.
                    </p>
                </div>

                <div>
                    <label
                        htmlFor="confirm-password"
                        className="block text-sm font-medium text-gray-700 mb-2"
                    >
                        Confirm Password
                    </label>
                    <input
                        id="confirm-password"
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition"
                        placeholder="Re-enter password"
                    />
                </div>

                {errorMessage && (
                    <p className="text-sm text-red-600 text-center">{errorMessage}</p>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? "Updating…" : "Set New Password"}
                </button>

                <p className="text-center text-sm text-gray-500">
                    <a href="/account/signin" className="text-red-500 hover:underline font-medium">
                        ← Back to Sign In
                    </a>
                </p>
            </form>
        </Shell>
    );
}
