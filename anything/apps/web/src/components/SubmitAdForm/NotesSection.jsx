export function NotesSection({ notes, onChange }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">
        Additional Notes
      </h3>
      <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Notes (Optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => onChange("notes", e.target.value)}
          rows={3}
          placeholder="Any additional details or special requests..."
          className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none resize-none"
        />
      </div>
    </div>
  );
}
