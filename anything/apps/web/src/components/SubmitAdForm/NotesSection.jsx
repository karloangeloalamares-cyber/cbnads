export function NotesSection({ notes, onChange }) {
    return (
        <section className="space-y-4">
            <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wide mb-4">
                Additional Notes
            </h2>

            <label className="block">
                <span className="block text-xs font-semibold text-[#334155] mb-1.5">
                    Notes (Optional)
                </span>
                <textarea
                    name="notes"
                    placeholder="Any additional details or special requests..."
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm min-h-[100px] focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 placeholder:text-gray-400 transition-colors resize-y"
                    value={notes || ""}
                    onChange={onChange}
                />
            </label>
        </section>
    );
}
