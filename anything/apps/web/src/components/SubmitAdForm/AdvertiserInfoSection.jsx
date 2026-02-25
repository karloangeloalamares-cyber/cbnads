export function AdvertiserInfoSection({ formData, onChange }) {
    return (
        <section className="space-y-4">
            <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wide">
                Advertiser Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                    <span className="block text-xs font-semibold text-[#334155] mb-1.5 flex items-center gap-1">
                        Advertiser Name <span className="text-red-500">*</span>
                    </span>
                    <input
                        type="text"
                        name="advertiser_name"
                        placeholder="Enter advertiser name"
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 placeholder:text-gray-400 transition-colors"
                        value={formData?.advertiser_name || ""}
                        onChange={onChange}
                    />
                </label>

                <label className="block">
                    <span className="block text-xs font-semibold text-[#334155] mb-1.5 flex items-center gap-1">
                        Contact Name <span className="text-red-500">*</span>
                    </span>
                    <input
                        type="text"
                        name="contact_name"
                        placeholder="Enter contact name"
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 placeholder:text-gray-400 transition-colors"
                        value={formData?.contact_name || ""}
                        onChange={onChange}
                    />
                </label>

                <label className="block">
                    <span className="block text-xs font-semibold text-[#334155] mb-1.5 flex items-center gap-1">
                        Email <span className="text-red-500">*</span>
                    </span>
                    <input
                        type="email"
                        name="email"
                        placeholder="your@email.com"
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 placeholder:text-gray-400 transition-colors"
                        value={formData?.email || ""}
                        onChange={onChange}
                    />
                </label>

                <label className="block">
                    <span className="block text-xs font-semibold text-[#334155] mb-1.5 flex items-center gap-1">
                        Phone Number <span className="text-red-500">*</span>
                    </span>
                    <input
                        type="tel"
                        name="phone_number"
                        placeholder="(123) 456-7890"
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 placeholder:text-gray-400 transition-colors"
                        value={formData?.phone_number || ""}
                        onChange={onChange}
                    />
                </label>
            </div>
        </section>
    );
}
