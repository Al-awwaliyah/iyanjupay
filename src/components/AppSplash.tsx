import React, { useEffect } from "react";

const SPLASH_DURATION = 4_000;

const AppSplash = () => {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      // App.tsx controls when the splash screen is removed.
      // This timer simply keeps the splash duration aligned
      // with the configured 4-second duration.
    }, SPLASH_DURATION);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[99999] flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-purple-700 via-purple-600 to-blue-600">
      {/* Background decoration */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-blue-300/10 blur-3xl" />

      <div className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 -translate-y-1/2 rounded-full bg-purple-400/10 blur-3xl" />

      {/* Main content */}
      <div className="relative z-10 flex w-full max-w-md flex-col items-center px-6 text-center">

        {/* App Logo */}
        <div className="mb-7 flex h-28 w-28 items-center justify-center rounded-[32px] bg-white shadow-2xl">
          <img
            src="/icon-180.png"
            alt="IyanjuPay"
            className="h-24 w-24 rounded-[26px] object-contain"
            draggable={false}
          />
        </div>

        {/* App Name */}
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          IyanjuPay
        </h1>

        {/* Tagline */}
        <p className="mt-2 text-sm font-medium text-purple-100 sm:text-base">
          Simple. Secure. Seamless.
        </p>

        {/* Loading indicator */}
        <div className="mt-10 flex flex-col items-center">

          {/* Spinner */}
          <div className="relative h-9 w-9">
            <div className="absolute inset-0 rounded-full border-4 border-white/20" />

            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-white" />
          </div>

          {/* Loading text */}
          <p className="mt-5 text-sm font-semibold text-white">
            Loading IyanjuPay...
          </p>

          <p className="mt-1 text-xs text-white/70">
            Please wait
          </p>
        </div>

        {/* Bottom text */}
        <p className="mt-12 text-xs text-white/50">
          Secure payments powered by IyanjuPay
        </p>
      </div>
    </div>
  );
};

export default AppSplash;
