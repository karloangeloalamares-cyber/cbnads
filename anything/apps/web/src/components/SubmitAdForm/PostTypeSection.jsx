const basePostTypes = [
  {
    value: "One-Time Post",
    title: "One-time post",
    description: "Single date, single posting event.",
  },
  {
    value: "Daily Run",
    title: "Daily Run",
    description: "Posts daily between start and end dates.",
  },
  {
    value: "Custom Schedule",
    title: "Custom Schedule",
    description: "Select specific non-consecutive dates.",
  },
];

const multiWeekPostType = {
  value: "Multi-week booking (TBD)",
  title: "Multi-week booking (TBD)",
  description: "Book multiple weeks now; schedule the exact day later.",
};

export function PostTypeSection({ selectedType, onChange, includeMultiWeek = true }) {
  const postTypes = includeMultiWeek ? [...basePostTypes, multiWeekPostType] : basePostTypes;
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Post type</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {postTypes.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => onChange("post_type", type.value)}
            className={`px-3 py-2 border rounded-xl text-left transition-all bg-white ${selectedType === type.value
              ? "border-gray-900 ring-2 ring-gray-900 ring-offset-0 shadow-sm"
              : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
              }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-3">
                <span className="text-sm font-semibold text-gray-900 block">
                  {type.title}
                </span>
                <p className="text-xs text-gray-500 leading-snug">
                  {type.description}
                </p>
              </div>
              <div
                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center mt-0.5 transition-all ${selectedType === type.value
                  ? "border-gray-900 bg-gray-900"
                  : "border-gray-300"
                  }`}
              >
                {selectedType === type.value && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
