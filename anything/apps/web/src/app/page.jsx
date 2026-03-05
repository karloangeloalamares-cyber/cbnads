import { Lock } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen relative flex flex-col">
      {/* Background Image */}
      <div
        className="fixed inset-0 bg-cover bg-center -z-10"
        style={{
          backgroundImage:
            "url('https://ucarecdn.com/9281fa72-0274-41d4-a9b2-9f04d72418e6/-/format/auto/')",
          filter: "brightness(0.7)",
        }}
      ></div>

      {/* Content Overlay */}
      <div className="relative z-10 flex flex-col flex-1">
        {/* Header */}
        <header className="flex items-center justify-between px-8 py-6">
          {/* Logo */}
          <div className="w-16 h-16">
            <img
              src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
              alt="Logo"
              className="w-full h-full object-contain"
            />
          </div>

          {/* Admin Login */}
          <a
            href="/account/signin"
            className="flex items-center gap-2 text-white hover:text-gray-200 transition-colors"
          >
            <Lock size={18} />
            <span className="text-sm font-medium">Sign in</span>
          </a>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center px-8 md:px-16 lg:px-24 min-h-[calc(100vh-160px)]">
          <div className="max-w-3xl">
            {/* Heading */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-12">
              GET YOUR
              <br />
              PRODUCT
              <br />
              SEEN
              <br />
              <span className="inline-flex items-baseline gap-3">
                BY{" "}
                <span className="inline-block bg-black text-[#FF3333] px-6 py-2 rounded-full">
                  30,000+
                </span>
              </span>
              <br />
              CUSTOMERS
              <br />
              DAILY!
            </h1>

            {/* CTA Button */}
            <a href="/submit-ad">
              <button className="px-8 py-3 bg-white/20 backdrop-blur-sm text-white text-base font-semibold rounded-full border-2 border-white/30 hover:bg-white/30 hover:border-white/50 transition-all shadow-lg">
                SUBMIT AN AD
              </button>
            </a>
          </div>
        </main>

        {/* Footer - Issue #20 */}
        <footer className="px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 bg-black/30 backdrop-blur-sm">
          <p className="text-xs text-white/60">
            &copy; {new Date().getFullYear()} CBN Ads. All rights reserved.
          </p>
          <nav className="flex items-center gap-5 text-xs text-white/70">
            <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="/submit-ad" className="hover:text-white transition-colors">Advertise with Us</a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
