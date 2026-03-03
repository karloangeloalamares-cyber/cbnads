import { useState } from "react";
import { appToast } from "@/lib/toast";

const initialAccountData = (email = "") => ({
    email,
    password: "",
    confirmPassword: "",
});

const normalizeGoogleCallbackError = (value) => {
    const message = decodeURIComponent(String(value || "").trim());

    if (/Database error saving new user/i.test(message)) {
        return "Use the same Google email as your ad submission email, or restart the submission and update the email before continuing with Google.";
    }

    return message || "Google sign-in failed.";
};

export function useAccountSetup() {
    const [accountData, setAccountData] = useState(initialAccountData());
    const [accountError, setAccountError] = useState(null);
    const [accountLoading, setAccountLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendError, setResendError] = useState(null);
    const [resendMessage, setResendMessage] = useState(null);

    const handleAccountChange = (field, value) => {
        setAccountData((prev) => ({ ...prev, [field]: value }));
        setAccountError(null);
        setResendError(null);
        setResendMessage(null);
    };

    const submitAccountSetup = async (event, { pendingAdId, submittedData, onSuccess }) => {
        event.preventDefault();
        setAccountError(null);
        setResendError(null);
        setResendMessage(null);

        if (!submittedData) {
            setAccountError("Your submission could not be found. Please submit the ad again.");
            return;
        }

        if (!accountData.email || !accountData.password || !accountData.confirmPassword) {
            setAccountError("Please complete all account fields.");
            return;
        }

        if (accountData.password.length < 8) {
            setAccountError("Password must be at least 8 characters.");
            return;
        }

        if (accountData.password !== accountData.confirmPassword) {
            setAccountError("Passwords do not match.");
            return;
        }

        setAccountLoading(true);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            let response;
            try {
                response = await fetch("/api/public/submit-ad/account", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        pendingAdId,
                        advertiserName: submittedData.advertiser_name,
                        contactName: submittedData.contact_name,
                        phoneNumber: submittedData.phone_number,
                        email: accountData.email,
                        password: accountData.password,
                        confirmPassword: accountData.confirmPassword,
                    }),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timeoutId);
            }

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to create advertiser account.");
            }

            setAccountData((prev) => ({
                ...initialAccountData(data.email || prev.email),
            }));
            onSuccess?.();
        } catch (err) {
            console.error("Error creating advertiser account:", err);
            const message =
                err.name === "AbortError"
                    ? "The request timed out. Please check your connection and try again."
                    : err.message || "Failed to create advertiser account.";
            setAccountError(message);
        } finally {
            setAccountLoading(false);
        }
    };

    /**
     * Start the Google OAuth flow. The pendingAdId and submitted data are
     * persisted in sessionStorage so we can restore them after the redirect.
     */
    const startGoogleSignUp = async ({ pendingAdId, submittedData }) => {
        setAccountError(null);
        setGoogleLoading(true);

        try {
            // Persist the ad submission context so we can restore it after OAuth redirect
            sessionStorage.setItem(
                "googleAdLink",
                JSON.stringify({ pendingAdId, submittedData }),
            );

            // Call Supabase OAuth directly (NOT signInWithGoogle which redirects to
            // /account/signin and runs finalizeSupabaseSignIn that rejects new users)
            const { getSupabaseClient, publicAppUrl } = await import("@/lib/supabase");
            const supabase = getSupabaseClient();

            const baseUrl = String(publicAppUrl || "").trim() || window.location.origin;
            const redirectUrl = new URL("/submit-ad", baseUrl);
            redirectUrl.searchParams.set("googleLink", "1");
            redirectUrl.searchParams.set("oauth", "google");

            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: redirectUrl.toString(),
                    queryParams: {
                        access_type: "offline",
                        prompt: "select_account",
                        login_hint: String(submittedData?.email || "").trim(),
                    },
                },
            });

            if (error) {
                setAccountError(error.message || "Unable to start Google sign-in.");
                setGoogleLoading(false);
            }
            // If ok, browser is redirected to Google — no further action needed
        } catch (err) {
            console.error("Google sign-up error:", err);
            setAccountError("Unable to start Google sign-in.");
            setGoogleLoading(false);
        }
    };

    /**
     * Complete Google OAuth after the redirect. Exchanges the code for a session,
     * then calls the API endpoint to link the Google user to the pending ad.
     */
    const completeGoogleSignUp = async ({ onSuccess, onSignIn }) => {
        setGoogleLoading(true);
        setAccountError(null);

        try {
            // Restore ad context from sessionStorage
            const raw = sessionStorage.getItem("googleAdLink");
            if (!raw) {
                setAccountError("Could not restore your ad submission. Please try again.");
                setGoogleLoading(false);
                return;
            }

            const { pendingAdId, submittedData } = JSON.parse(raw);
            if (!pendingAdId || !submittedData) {
                setAccountError("Missing ad submission data. Please submit the ad again.");
                setGoogleLoading(false);
                return;
            }

            // Exchange the OAuth code for a Supabase session
            const { getSupabaseClient } = await import("@/lib/supabase");
            const supabase = getSupabaseClient();
            const url = new URL(window.location.href);
            const callbackError =
                url.searchParams.get("error_description") || url.searchParams.get("error");
            const code = url.searchParams.get("code");

            if (callbackError) {
                setAccountError(normalizeGoogleCallbackError(callbackError));
                setGoogleLoading(false);
                return;
            }

            if (code) {
                // exchangeCodeForSession may fail if Supabase's detectSessionInUrl
                // already exchanged it automatically on client init — fall through
                // and verify via getSession() regardless.
                const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
                if (codeError) {
                    console.warn("[completeGoogleSignUp] exchangeCodeForSession:", codeError.message);
                }
            }

            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession();

            if (sessionError || !session?.access_token) {
                setAccountError("Google sign-in did not return a valid session. Please try again.");
                setGoogleLoading(false);
                return;
            }

            // Call the API to link the Google user to the pending ad
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            let response;
            try {
                response = await fetch("/api/public/submit-ad/google-account", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        pendingAdId,
                        advertiserName: submittedData.advertiser_name,
                        contactName: submittedData.contact_name,
                        phoneNumber: submittedData.phone_number,
                    }),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timeoutId);
            }

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to link Google account.");
            }

            // Refresh the session so the client JWT reflects the updated role
            // (admin.updateUserById on the server doesn't invalidate the cached token)
            await supabase.auth.refreshSession();

            // Clean up sessionStorage and URL
            sessionStorage.removeItem("googleAdLink");
            const cleanUrl = `${url.pathname}`;
            window.history.replaceState({}, "", cleanUrl);

            // Google emails are pre-verified — user can go straight to sign-in
            setAccountData((prev) => ({
                ...initialAccountData(data.email || session.user?.email || prev.email),
            }));

            appToast.success({
                title: "Account created",
                description: "Your advertiser account has been created with Google. You can now sign in.",
            });

            onSuccess?.();
            onSignIn?.({ email: data.email || session.user?.email || "" });
        } catch (err) {
            console.error("Error completing Google sign-up:", err);
            const message =
                err.name === "AbortError"
                    ? "The request timed out. Please check your connection and try again."
                    : err.message || "Failed to complete Google sign-up.";
            setAccountError(message);
            appToast.error({ title: "Sign-up failed", description: message });
        } finally {
            setGoogleLoading(false);
        }
    };

    const resendVerification = async ({ email }) => {
        setResendLoading(true);
        setResendError(null);
        setResendMessage(null);

        try {
            const response = await fetch("/api/public/submit-ad/resend-verification", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to resend verification email.");
            }

            setResendMessage(`Verification email sent to ${data.email}.`);
        } catch (err) {
            console.error("Error resending verification email:", err);
            setResendError(err.message || "Failed to resend verification email.");
        } finally {
            setResendLoading(false);
        }
    };

    const goToSignIn = ({ email }) => {
        const params = new URLSearchParams();
        if (email) {
            params.set("email", email);
        }
        params.set("forceLogin", "1");
        params.set("audience", "advertiser");
        params.set("callbackUrl", "/ads");
        window.location.href = `/account/signin?${params.toString()}`;
    };

    const resetAccount = () => {
        setAccountData(initialAccountData());
        setAccountError(null);
        setGoogleLoading(false);
        setResendError(null);
        setResendMessage(null);
    };

    const initAccount = (email) => {
        setAccountData(initialAccountData(email));
        setResendError(null);
        setResendMessage(null);
    };

    return {
        accountData,
        accountError,
        accountLoading,
        googleLoading,
        resendLoading,
        resendError,
        resendMessage,
        handleAccountChange,
        submitAccountSetup,
        startGoogleSignUp,
        completeGoogleSignUp,
        resendVerification,
        goToSignIn,
        resetAccount,
        initAccount,
    };
}
