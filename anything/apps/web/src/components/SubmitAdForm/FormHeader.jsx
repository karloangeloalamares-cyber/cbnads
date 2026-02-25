import { ArrowLeft } from "lucide-react";

export function FormHeader() {
    return (
        <div className="mb-8 pt-4">
            <div className="mb-6 flex items-center justify-between">
                <a
                    href="/"
                    className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors font-medium text-sm"
                >
                    <ArrowLeft size={16} />
                    Back to Home
                </a>
            </div>
            <div className="mb-6">
                <div className="w-12 h-12 text-[#FF3333]">
                    {/* Logo Placeholder */}
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                    </svg>
                </div>
            </div>
            <h1 className="text-[32px] font-bold text-[#0F172A] leading-tight text-left">
                Submit an Ad Request
            </h1>
            <p className="text-[#64748B] text-base mt-2 text-left">
                Fill out the form below to submit your advertising request for review.
            </p>
        </div>
    );
}
