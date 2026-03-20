import { Lock } from "lucide-react";

export default function HomePage() {
  return (
    <div className="relative isolate flex min-h-app-screen w-full flex-col overflow-hidden bg-slate-950">
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://ucarecdn.com/9281fa72-0274-41d4-a9b2-9f04d72418e6/-/format/auto/')",
          filter: "brightness(0.7)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.18)_0%,rgba(2,6,23,0.4)_36%,rgba(2,6,23,0.74)_100%)]"
      />

      <div className="relative z-10 flex w-full flex-1 flex-col">
        <header className="safe-top-pad safe-px flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 md:px-8">
          <div className="h-10 w-10 shrink-0 sm:h-16 sm:w-16">
            <img
              src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
              alt="Logo"
              className="h-full w-full object-contain"
            />
          </div>

          <a
            href="/account/signin"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-white/20 bg-black/25 px-3.5 text-[0.78rem] font-medium whitespace-nowrap text-white shadow-sm backdrop-blur-sm transition-all hover:border-white/35 hover:bg-black/35 sm:px-4 sm:text-sm"
            aria-label="Sign in"
          >
            <Lock size={16} className="shrink-0" />
            <span>Sign in</span>
          </a>
        </header>

        <main className="flex min-h-0 w-full flex-1 items-center px-5 pb-6 pt-2 sm:min-h-[calc(var(--app-viewport-height)-9rem)] sm:px-6 sm:pb-10 sm:pt-6 md:px-10 lg:px-24">
          <div className="w-full max-w-[22rem] sm:max-w-[24rem] md:max-w-[32rem] lg:max-w-3xl">
            <h1 className="mb-6 text-[2.6rem] font-bold leading-[0.92] tracking-[-0.02em] text-white sm:mb-10 sm:text-[3.25rem] sm:leading-[0.95] md:text-[4rem] lg:text-6xl">
              <span className="sm:hidden">GET YOUR PRODUCT SEEN</span>
              <span className="hidden sm:inline">
                GET YOUR
                <br />
                PRODUCT
                <br />
                SEEN
              </span>
              <br />
              <span className="inline-flex flex-wrap items-baseline gap-2.5 sm:gap-3">
                BY{" "}
                <span className="inline-block rounded-full bg-black/85 px-3 py-1.5 text-[#FF3333] shadow-[0_10px_30px_rgba(0,0,0,0.28)] sm:px-6 sm:py-2">
                  30,000+
                </span>
              </span>
              <br />
              <span className="sm:hidden">CUSTOMERS DAILY!</span>
              <span className="hidden sm:inline">
                CUSTOMERS
                <br />
                DAILY!
              </span>
            </h1>

            <a
              href="/submit-ad"
              className="inline-flex min-h-14 w-full items-center justify-center rounded-full border-2 border-white/40 bg-white/18 px-8 py-3 text-[0.95rem] font-semibold tracking-[0.02em] text-white shadow-lg backdrop-blur-sm transition-all hover:border-white/55 hover:bg-white/30 sm:min-h-12 sm:w-auto sm:text-base"
            >
              SUBMIT AN AD
            </a>
          </div>
        </main>

        <footer className="safe-px safe-bottom-pad flex w-full flex-col items-center justify-between gap-2 border-t border-white/10 bg-black/35 px-4 py-4 backdrop-blur-sm sm:gap-3 sm:px-6 sm:py-5 md:px-8">
          <p className="max-w-[18rem] text-center text-[0.7rem] leading-4 text-white/65 sm:max-w-none sm:text-left sm:text-xs">
            &copy; {new Date().getFullYear()} CBN Ads. All rights reserved.
          </p>
          <nav className="flex w-full flex-wrap items-center justify-center gap-1.5 text-[0.7rem] leading-4 text-white/75 sm:w-auto sm:justify-end sm:gap-3 sm:text-xs">
            <a
              href="/privacy"
              className="inline-flex min-h-9 items-center rounded-full px-2.5 transition-colors hover:text-white sm:min-h-10 sm:px-3"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              className="inline-flex min-h-9 items-center rounded-full px-2.5 transition-colors hover:text-white sm:min-h-10 sm:px-3"
            >
              Terms of Service
            </a>
            <a
              href="/submit-ad"
              className="inline-flex min-h-9 items-center rounded-full px-2.5 transition-colors hover:text-white sm:min-h-10 sm:px-3"
            >
              Advertise with Us
            </a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
