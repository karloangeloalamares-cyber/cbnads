"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ArrowLeft } from "lucide-react";
import { appToast } from "@/lib/toast";
import {
  formatUSPhoneNumber,
  isCompleteUSPhoneNumber,
  US_PHONE_INPUT_MAX_LENGTH,
} from "@/lib/phone";

export default function NewAdvertiserForm({ onCancel, onSuccess }) {
  const [formData, setFormData] = useState({
    advertiser_name: "",
    contact_name: "",
    email: "",
    phone_number: "",
    status: "active",
  });

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!error) {
      return;
    }

    appToast.error({
      title: "Unable to create advertiser",
      description: error,
    });
  }, [error]);

  const handleSubmit = async (type) => {
    if (type === "cancel") {
      onCancel();
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (formData.phone_number && !isCompleteUSPhoneNumber(formData.phone_number)) {
        throw new Error("Phone number must be a complete US number.");
      }

      const response = await fetch("/api/advertisers/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          email: formData.email || null,
          phone_number: formData.phone_number || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create advertiser: ${response.status}`);
      }

      const data = await response.json();
      console.log("Created advertiser:", data);
      appToast.success({
        title: "Advertiser created",
        description: `${formData.advertiser_name} is ready to use.`,
      });
      onSuccess();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to create advertiser. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-[#FAFAFA]">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between relative">
          {/* Back button */}
          <button
            onClick={onCancel}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>

          {/* Title */}
          <h1 className="text-sm font-medium text-gray-900 absolute left-1/2 -translate-x-1/2">
            New Advertiser
          </h1>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSubmit("cancel")}
              className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSubmit("save")}
              disabled={loading}
              className="px-5 py-2 text-sm font-medium text-white bg-black rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Advertiser"}
            </button>
          </div>
        </div>
      </div>

      {/* Main Form */}
      <div className="max-w-[700px] mx-auto py-12 px-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-8">
          Add a new advertiser
        </h2>

        {/* Basic Information */}
        <div className="mb-10">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Basic Information
          </h3>

          {/* Advertiser Name */}
          <div className="border border-gray-300 rounded-lg bg-white px-4 pt-3 pb-2.5 mb-4">
            <label className="block text-xs font-semibold text-gray-900 mb-0.5">
              Advertiser Name *
            </label>
            <input
              type="text"
              value={formData.advertiser_name}
              onChange={(e) =>
                setFormData({ ...formData, advertiser_name: e.target.value })
              }
              placeholder="Enter advertiser business name"
              className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
              required
            />
          </div>

          {/* Contact Name */}
          <div className="border border-gray-300 rounded-lg bg-white px-4 pt-3 pb-2.5 mb-4">
            <label className="block text-xs font-semibold text-gray-900 mb-0.5">
              Contact Name *
            </label>
            <input
              type="text"
              value={formData.contact_name}
              onChange={(e) =>
                setFormData({ ...formData, contact_name: e.target.value })
              }
              placeholder="Enter primary contact name"
              className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
              required
            />
          </div>

          {/* Email */}
          <div className="border border-gray-300 rounded-lg bg-white px-4 pt-3 pb-2.5 mb-4">
            <label className="block text-xs font-semibold text-gray-900 mb-0.5">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="contact@example.com"
              className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
            />
          </div>

          {/* Phone Number */}
          <div className="border border-gray-300 rounded-lg bg-white px-4 pt-3 pb-2.5">
            <label className="block text-xs font-semibold text-gray-900 mb-0.5">
              Phone Number
            </label>
            <input
              type="tel"
              value={formData.phone_number}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  phone_number: formatUSPhoneNumber(e.target.value),
                })
              }
              inputMode="tel"
              autoComplete="tel-national"
              maxLength={US_PHONE_INPUT_MAX_LENGTH}
              placeholder="(123) 456-7890"
              className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
            />
          </div>
        </div>

        {/* Account Details */}
        <div className="mb-10">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Account Details
          </h3>

          {/* Account Status */}
          <div className="relative border border-gray-300 rounded-lg bg-white px-4 pt-3 pb-2.5">
            <label className="block text-xs font-semibold text-gray-900 mb-0.5">
              Account Status
            </label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value })
              }
              className="w-full text-sm text-gray-900 bg-transparent focus:outline-none appearance-none pr-6"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <ChevronDown
              size={16}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
