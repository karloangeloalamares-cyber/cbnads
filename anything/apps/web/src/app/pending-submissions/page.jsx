"use client";

import { useEffect } from "react";

export default function PendingSubmissionsPage() {
  useEffect(() => {
    window.location.href = "/ads?section=pending";
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-600">Opening pending submissions...</p>
    </div>
  );
}
