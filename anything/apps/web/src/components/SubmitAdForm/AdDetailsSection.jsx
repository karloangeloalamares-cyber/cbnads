import { MediaUploadSection } from "./MediaUploadSection";

export function AdDetailsSection({
  formData,
  onChange,
  onAddMedia,
  onRemoveMedia,
  showAlert,
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Ad Details</h3>

      <div className="mb-4">
        <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Ad Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.ad_name}
            onChange={(event) => onChange("ad_name", event.target.value)}
            placeholder="Enter ad name"
            className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
          />
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0 mb-4">
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Ad Text
        </label>
        <textarea
          value={formData.ad_text}
          onChange={(event) => onChange("ad_text", event.target.value)}
          rows={4}
          placeholder="Enter your ad copy here..."
          className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none resize-none"
        />
      </div>

      <MediaUploadSection
        media={formData.media}
        onAddMedia={onAddMedia}
        onRemoveMedia={onRemoveMedia}
        showAlert={showAlert}
      />
    </div>
  );
}