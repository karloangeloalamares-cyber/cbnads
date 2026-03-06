import { US_PHONE_INPUT_MAX_LENGTH } from "@/lib/phone";

const containerClass = (readOnly) =>
  `border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0 ${readOnly ? "bg-gray-50" : "hover:border-gray-300"}`;

const inputClass = (readOnly) =>
  `w-full text-sm bg-transparent focus:outline-none ${readOnly ? "cursor-not-allowed text-gray-500" : "text-gray-900 placeholder:text-gray-400"}`;

export function AdvertiserInfoSection({
  formData,
  onChange,
  readOnlyFields = [],
  helperText = "",
}) {
  const readOnlySet = new Set(
    Array.isArray(readOnlyFields) ? readOnlyFields.map((field) => String(field || "")) : [],
  );

  const isReadOnly = (field) => readOnlySet.has(field);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">
        Advertiser Information
      </h3>
      {helperText ? <p className="mb-4 text-xs text-gray-500">{helperText}</p> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={containerClass(isReadOnly("advertiser_name"))}>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Advertiser Name <span className="text-red-500">*</span>
            {isReadOnly("advertiser_name") ? (
              <span className="ml-2 text-[11px] font-medium text-gray-400">Linked account</span>
            ) : null}
          </label>
          <input
            type="text"
            name="advertiser_name"
            required
            value={formData.advertiser_name}
            readOnly={isReadOnly("advertiser_name")}
            aria-readonly={isReadOnly("advertiser_name")}
            onChange={(e) => {
              if (!isReadOnly("advertiser_name")) {
                onChange("advertiser_name", e.target.value);
              }
            }}
            placeholder="Enter advertiser name"
            className={inputClass(isReadOnly("advertiser_name"))}
          />
        </div>

        <div className={containerClass(isReadOnly("contact_name"))}>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Contact Name <span className="text-red-500">*</span>
            {isReadOnly("contact_name") ? (
              <span className="ml-2 text-[11px] font-medium text-gray-400">Linked account</span>
            ) : null}
          </label>
          <input
            type="text"
            name="contact_name"
            required
            value={formData.contact_name}
            readOnly={isReadOnly("contact_name")}
            aria-readonly={isReadOnly("contact_name")}
            onChange={(e) => {
              if (!isReadOnly("contact_name")) {
                onChange("contact_name", e.target.value);
              }
            }}
            placeholder="Enter contact name"
            className={inputClass(isReadOnly("contact_name"))}
          />
        </div>

        <div className={containerClass(isReadOnly("email"))}>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Email <span className="text-red-500">*</span>
            {isReadOnly("email") ? (
              <span className="ml-2 text-[11px] font-medium text-gray-400">Linked account</span>
            ) : null}
          </label>
          <input
            type="email"
            name="email"
            required
            value={formData.email}
            readOnly={isReadOnly("email")}
            aria-readonly={isReadOnly("email")}
            onChange={(e) => {
              if (!isReadOnly("email")) {
                onChange("email", e.target.value);
              }
            }}
            placeholder="your@email.com"
            className={inputClass(isReadOnly("email"))}
          />
        </div>

        <div className={containerClass(isReadOnly("phone_number"))}>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Phone Number <span className="text-red-500">*</span>
            {isReadOnly("phone_number") ? (
              <span className="ml-2 text-[11px] font-medium text-gray-400">Linked account</span>
            ) : null}
          </label>
          <input
            type="tel"
            name="phone_number"
            required
            value={formData.phone_number}
            readOnly={isReadOnly("phone_number")}
            aria-readonly={isReadOnly("phone_number")}
            onChange={(e) => {
              if (!isReadOnly("phone_number")) {
                onChange("phone_number", e.target.value);
              }
            }}
            inputMode="tel"
            autoComplete="tel-national"
            maxLength={US_PHONE_INPUT_MAX_LENGTH}
            pattern="[\d\s\(\)\-\+]+"
            title="Please enter a valid phone number (digits, spaces, dashes, and parentheses only)"
            placeholder="(123) 456-7890"
            className={inputClass(isReadOnly("phone_number"))}
          />
        </div>
      </div>
    </div>
  );
}
