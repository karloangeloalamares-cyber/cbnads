import { Calendar, Clock } from "lucide-react";

export function ScheduleSection({ postType, formData, onChange, customDate, setCustomDate, onAddCustomDate, onRemoveCustomDate, onCheckAvailability, checkingAvailability, availabilityError, pastTimeError, fullyBookedDates }) {
    return (
        <section className="space-y-4">
            <div className="mb-4">
                <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wide">
                    Schedule
                </h2>
                <p className="text-xs text-gray-400 mt-1 font-medium">
                    All times are in Eastern Time (ET)
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                    <span className="block text-xs font-semibold text-[#334155] mb-1.5 flex items-center gap-1">
                        Post Date <span className="text-red-500">*</span>
                    </span>
                    <div className="relative">
                        <input
                            type="date"
                            name="post_date"
                            className="w-full border border-gray-200 rounded-lg p-3 pr-10 text-sm focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 text-[#0F172A] transition-colors appearance-none"
                            value={formData?.post_date || ""}
                            onChange={onChange}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <Calendar size={16} />
                        </div>
                    </div>
                </label>

                <label className="block">
                    <span className="block text-xs font-semibold text-[#334155] mb-1.5 flex items-center gap-1">
                        Post Time (ET) <span className="text-red-500">*</span>
                    </span>
                    <div className="relative">
                        <input
                            type="time"
                            name="post_time"
                            className="w-full border border-gray-200 rounded-lg p-3 pr-10 text-sm focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 text-[#0F172A] transition-colors appearance-none"
                            value={formData?.post_time || ""}
                            onChange={onChange}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <Clock size={16} />
                        </div>
                    </div>
                </label>
            </div>
        </section>
    );
}
