export function FormHeader() {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
          <img
            src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
            alt="CBN Unfiltered Logo"
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">Submit an Ad Request</h1>
      <p className="text-gray-600 text-sm">
        Fill out the form below to submit your advertising request for review.
      </p>
    </div>
  );
}