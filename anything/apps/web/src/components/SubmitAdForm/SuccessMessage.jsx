export function SuccessMessage({ onReset }) {
  return (
    <div className="max-w-[680px] mx-auto h-full flex flex-col py-12">
      <div className="flex-1" />

      <div>
        <div className="mb-12">
          <img
            src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
            alt="CBN Unfiltered"
            className="h-12 w-auto mb-8"
          />

          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Congrats, your ad was submitted!
          </h1>

          <p className="text-lg text-gray-600 mb-8">
            Keep an eye out in your email to see updates regarding your ads approval
          </p>

          <button
            onClick={onReset}
            className="bg-black text-white px-8 py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium"
          >
            Submit another ad
          </button>
        </div>
      </div>

      <div className="flex-1" />

      <div className="text-sm text-gray-600">
        Feel free to email us at{" "}
        <a
          href="mailto:advertise@cbnads.com"
          className="text-gray-900 underline hover:text-gray-700"
        >
          advertise@cbnads.com
        </a>{" "}
        for any concerns or questions
      </div>
    </div>
  );
}