export function PostTypeSection({ selectedType, onChange }) {
    const options = [
        {
            id: "one-time",
            title: "One-time post",
            description: "Single date, single posting event.",
        },
        {
            id: "daily",
            title: "Daily Run",
            description: "Posts daily between start and end dates.",
        },
        {
            id: "custom",
            title: "Custom Schedule",
            description: "Select specific non-consecutive dates.",
        },
    ];

    // For the stub, default to 'one-time' if none selected
    const currentSelection = selectedType || "one-time";

    const handleSelect = (id) => {
        // Call the onChange handler mimicking an event object
        if (onChange) {
            onChange({ target: { name: "post_type", value: id } });
        }
    };

    return (
        <section className="space-y-4">
            <h2 className="text-sm font-bold text-[#0F172A] tracking-wide mb-4">
                Post type
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {options.map((opt) => {
                    const isSelected = currentSelection === opt.id;
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleSelect(opt.id)}
                            className={`flex items-start justify-between w-full h-full p-4 rounded-xl border text-left transition-all ${isSelected
                                    ? "border-black border-[2px] shadow-sm bg-gray-50/50"
                                    : "border-gray-200 hover:border-gray-300 bg-white"
                                }`}
                        >
                            <div>
                                <span className={`block text-sm font-bold mb-1 ${isSelected ? "text-black" : "text-[#0F172A]"}`}>
                                    {opt.title}
                                </span>
                                <span className="block text-xs text-gray-400 font-medium leading-relaxed">
                                    {opt.description}
                                </span>
                            </div>
                            <div
                                className={`w-5 h-5 rounded-full border-[2px] mt-0.5 flex items-center justify-center flex-shrink-0 ml-4 ${isSelected ? "border-black" : "border-gray-300"
                                    }`}
                            >
                                {isSelected && <div className="w-2.5 h-2.5 bg-black rounded-full" />}
                            </div>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
