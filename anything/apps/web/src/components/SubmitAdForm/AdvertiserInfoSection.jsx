import { US_PHONE_INPUT_MAX_LENGTH } from "@/lib/phone";

export function AdvertiserInfoSection({ formData, onChange }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">
        Advertiser Information
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Advertiser Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="advertiser_name"
            required
            value={formData.advertiser_name}
            onChange={(e) => onChange("advertiser_name", e.target.value)}
            placeholder="Enter advertiser name"
            className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
          />
        </div>

        <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Contact Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="contact_name"
            required
            value={formData.contact_name}
            onChange={(e) => onChange("contact_name", e.target.value)}
            placeholder="Enter contact name"
            className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
          />
        </div>

        <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            name="email"
            required
            value={formData.email}
            onChange={(e) => onChange("email", e.target.value)}
            placeholder="your@email.com"
            className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
          />
        </div>

        <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            name="phone_number"
            required
            value={formData.phone_number}
            onChange={(e) => onChange("phone_number", e.target.value)}
            inputMode="tel"
            autoComplete="tel-national"
            maxLength={US_PHONE_INPUT_MAX_LENGTH}
            pattern="[\d\s\(\)\-\+]+"
            title="Please enter a valid phone number (digits, spaces, dashes, and parentheses only)"
            placeholder="(123) 456-7890"
            className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
