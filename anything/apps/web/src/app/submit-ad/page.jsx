"use client";

import { useMemo, useState } from "react";
import { submitPendingAd } from "@/lib/localDb";

const initialForm = {
  advertiser_name: "",
  email: "",
  phone: "",
  business_name: "",
  ad_name: "",
  post_type: "one_time",
  post_date: "",
  post_time: "",
  notes: "",
};

export default function SubmitAdPage() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [successId, setSuccessId] = useState("");

  const canSubmit = useMemo(() => {
    return (
      form.advertiser_name.trim() &&
      form.email.trim() &&
      form.ad_name.trim() &&
      form.post_type &&
      form.post_date &&
      form.post_time
    );
  }, [form]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");

    if (!canSubmit) {
      setError("Please complete all required fields.");
      return;
    }

    const created = submitPendingAd(form);
    setSuccessId(created?.id || "submitted");
    setForm(initialForm);
  };

  if (successId) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-14">
        <div className="mx-auto max-w-xl rounded-2xl border border-green-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-green-700">Submission received</h1>
          <p className="mt-3 text-sm text-gray-600">
            Your ad request is saved locally and waiting for admin approval.
          </p>
          <p className="mt-2 text-xs text-gray-500">Reference: {successId}</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setSuccessId("")}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Submit Another
            </button>
            <a
              href="/"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Submit an Ad</h1>
          <p className="mt-2 text-sm text-gray-600">
            This version stores submissions in browser localStorage until Supabase is wired in.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-gray-200 p-6">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Advertiser Name" name="advertiser_name" value={form.advertiser_name} onChange={handleChange} required />
            <Input label="Email" name="email" type="email" value={form.email} onChange={handleChange} required />
            <Input label="Phone" name="phone" value={form.phone} onChange={handleChange} />
            <Input label="Business Name" name="business_name" value={form.business_name} onChange={handleChange} />
            <Input label="Ad Name" name="ad_name" value={form.ad_name} onChange={handleChange} required />

            <label className="text-sm font-medium text-gray-700">
              Post Type
              <select
                name="post_type"
                value={form.post_type}
                onChange={handleChange}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
              >
                <option value="one_time">One-time</option>
                <option value="daily">Daily</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <Input label="Post Date" name="post_date" type="date" value={form.post_date} onChange={handleChange} required />
            <Input label="Post Time" name="post_time" type="time" value={form.post_time} onChange={handleChange} required />
          </div>

          <label className="block text-sm font-medium text-gray-700">
            Notes
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              className="mt-1 block min-h-28 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
              placeholder="Add any scheduling notes, campaign goals, or creative instructions."
            />
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Submit Ad Request
          </button>
        </form>
      </div>
    </div>
  );
}

function Input({ label, name, value, onChange, required, type = "text" }) {
  return (
    <label className="text-sm font-medium text-gray-700">
      {label}
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
      />
    </label>
  );
}
