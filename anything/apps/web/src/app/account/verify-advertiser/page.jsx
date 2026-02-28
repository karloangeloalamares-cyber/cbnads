"use client";

import { useEffect, useMemo, useState } from "react";

export default function VerifyAdvertiserPage() {
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Verifying your advertiser account...");
  const [email, setEmail] = useState("");

  const signInHref = useMemo(() => {
    const params = new URLSearchParams();
    if (status === "success") {
      params.set("verified", "1");
      params.set("forceLogin", "1");
      params.set("audience", "advertiser");
      params.set("callbackUrl", "/ads");
    }
    if (email) {
      params.set("email", email);
    }
    const query = params.toString();
    return query ? `/account/signin?${query}` : "/account/signin";
  }, [email, status]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      if (!token) {
        setStatus("error");
        setMessage("This verification link is missing a token.");
        return;
      }

      try {
        const response = await fetch("/api/public/submit-ad/verify-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to verify advertiser account.");
        }

        if (!cancelled) {
          setStatus("success");
          setEmail(data.email || "");
          setMessage("Your advertiser account is verified. You can sign in now.");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setMessage(error.message || "Failed to verify advertiser account.");
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-gray-200 bg-white p-10 shadow-sm">
        <img
          src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
          alt="CBN"
          className="h-14 w-auto mb-8"
        />

        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          {status === "success" ? "Account verified" : "Verify advertiser account"}
        </h1>

        <p className="text-gray-600 mb-8">{message}</p>

        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={signInHref}
            className="inline-flex items-center justify-center bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium"
          >
            Go to Sign In
          </a>

          {status !== "success" ? (
            <a
              href="/submit-ad"
              className="inline-flex items-center justify-center border border-gray-300 text-gray-900 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Back to Submit Ad
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
