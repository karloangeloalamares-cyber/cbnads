// Get minimum date (today) - fixed to handle timezone correctly
const getMinDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateLong = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export function ScheduleSection({
  postType,
  formData,
  onChange,
  customDate,
  setCustomDate,
  onAddCustomDate,
  onRemoveCustomDate,
  onCheckAvailability,
  checkingAvailability,
  availabilityError,
  pastTimeError,
  fullyBookedDates,
}) {
  const hasBookedDates = fullyBookedDates && fullyBookedDates.length > 0;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Schedule</h3>
      <p className="text-xs text-gray-500 mb-4">
        All times are in Eastern Time (ET)
      </p>

      {postType === "One-Time Post" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Post Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                min={getMinDate()}
                value={formData.post_date_from}
                onChange={(e) => onChange("post_date_from", e.target.value)}
                onBlur={onCheckAvailability}
                className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
              />
            </div>
            <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Post Time (ET) <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                required
                value={formData.post_time}
                onChange={(e) => onChange("post_time", e.target.value)}
                onBlur={onCheckAvailability}
                className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
              />
              {checkingAvailability && (
                <p className="text-xs text-gray-500 mt-1">
                  Checking availability...
                </p>
              )}
              {pastTimeError && (
                <p className="text-xs text-red-500 mt-1">{pastTimeError}</p>
              )}
            </div>
          </div>
          {availabilityError && !hasBookedDates && (
            <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-lg mt-4">
              <div className="flex items-start gap-2">
                <span className="text-red-600 flex-shrink-0 mt-0.5 text-base">
                  ❌
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-900">
                    {availabilityError}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {postType === "Daily Run" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                min={getMinDate()}
                value={formData.post_date_from}
                onChange={(e) => onChange("post_date_from", e.target.value)}
                onBlur={onCheckAvailability}
                className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
              />
            </div>
            <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                min={formData.post_date_from || getMinDate()}
                value={formData.post_date_to}
                onChange={(e) => onChange("post_date_to", e.target.value)}
                onBlur={onCheckAvailability}
                className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
              />
            </div>
          </div>
          {checkingAvailability && (
            <p className="text-xs text-gray-500 mt-2">
              Checking availability...
            </p>
          )}
        </>
      )}

      {postType === "Custom Schedule" && (
        <div>
          <div className="grid grid-cols-[1fr_auto] gap-2 mb-3">
            <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Add Date
              </label>
              <input
                type="date"
                min={getMinDate()}
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                onAddCustomDate();
                // Trigger availability check after a short delay to let state update
                setTimeout(() => {
                  if (onCheckAvailability) onCheckAvailability();
                }, 100);
              }}
              className="self-end px-6 py-3 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              Add
            </button>
          </div>
          {formData.custom_dates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.custom_dates.map((date) => (
                <span
                  key={date}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-900 rounded-lg text-sm"
                >
                  {date}
                  <button
                    type="button"
                    onClick={() => onRemoveCustomDate(date)}
                    className="hover:text-gray-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {checkingAvailability && (
            <p className="text-xs text-gray-500 mt-2">
              Checking availability...
            </p>
          )}
        </div>
      )}

      {/* Blocking red error for fully booked dates (public form - no counts shown) */}
      {hasBookedDates && (
        <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-lg mt-4">
          <div className="flex items-start gap-2">
            <span className="text-red-600 flex-shrink-0 mt-0.5 text-base">
              ❌
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-900">
                The following dates are fully booked:
              </p>
              <ul className="mt-2 space-y-1">
                {fullyBookedDates.map((date) => (
                  <li key={date} className="text-sm text-red-700">
                    {formatDateLong(date)}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-red-700 mt-2">
                Please choose different dates.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
