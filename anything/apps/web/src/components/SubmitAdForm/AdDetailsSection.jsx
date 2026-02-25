export function AdDetailsSection({ formData, onChange, onAddMedia, onRemoveMedia, showAlert }) {
    return (
        <section className="space-y-6">
            <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wide mb-4">
                Ad Details
            </h2>

            <div className="space-y-4">
                <label className="block">
                    <span className="block text-xs font-semibold text-[#334155] mb-1.5 flex items-center gap-1">
                        Ad Name <span className="text-red-500">*</span>
                    </span>
                    <input
                        type="text"
                        name="ad_name"
                        placeholder="Enter ad name"
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 placeholder:text-gray-400 transition-colors"
                        value={formData?.ad_name || ""}
                        onChange={onChange}
                    />
                </label>

                <label className="block">
                    <span className="block text-xs font-semibold text-[#334155] mb-1.5">
                        Ad Text
                    </span>
                    <textarea
                        name="ad_text"
                        placeholder="Enter your ad copy here..."
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm min-h-[120px] focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 placeholder:text-gray-400 transition-colors resize-y"
                        value={formData?.ad_text || ""}
                        onChange={onChange}
                    />
                </label>

                <div className="block">
                    <span className="block text-xs font-semibold text-[#334155] mb-1.5">
                        Media (Images & Videos)
                    </span>
                    <button
                        type="button"
                        className="w-full border border-dashed border-gray-300 rounded-lg p-4 flex items-center justify-center gap-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors hover:border-gray-400"
                    >
                        <span className="text-gray-400 text-lg leading-none">+</span> Add images or videos
                    </button>
                    <p className="text-[11px] text-gray-400 mt-2">
                        Supports: Images (PNG, JPG, GIF) and Videos (MP4, MOV). Videos must be under 200 MB.
                    </p>
                </div>
            </div>
        </section>
    );
}
