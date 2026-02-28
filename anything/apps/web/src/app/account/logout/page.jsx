"use client";

import { useEffect } from "react";
import { signOut } from "@/lib/localAuth";

export default function LogoutPage() {
  useEffect(() => {
    const run = async () => {
      await signOut();
      window.location.href = "/account/signin";
    };

    void run();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-600">Signing you out...</p>
    </div>
  );
}
