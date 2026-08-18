import React, { useEffect, useState } from "react";

interface AppSplashProps {
  children: React.ReactNode;
}

const AppSplash = ({ children }: AppSplashProps) => {
  const [showSplash, setShowSplash] = useState(true);


  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

    /* ================================================================
   SPLASH SCREEN
   ================================================================ */

const DashboardSplashScreen = () => {
  return (
    <div className="fixed inset-0 z-[9999] flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-purple-700 via-purple-600 to-blue-600">

      {/* Background decorations */}

      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-blue-300/10 blur-3xl" />

      <div className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5 blur-3xl" />

      {/* Main content */}

      <div className="relative z-10 flex w-full flex-col items-center px-6 text-center">

        {/* Logo */}

        <div className="relative mb-7 flex h-28 w-28 items-center justify-center rounded-[32px] bg-white shadow-2xl">

          {/* Glow */}

          <div className="absolute inset-0 animate-pulse rounded-[32px] bg-white/30 blur-xl" />

          {/* Actual IyanjuPay icon */}

          <img
            src="/icon-180.png"
            alt="IyanjuPay"
            className="relative z-10 h-20 w-20 object-contain"
          />

        </div>

        {/* Brand */}

        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          IyanjuPay
        </h1>

        <p className="mt-2 text-sm font-medium text-purple-100 sm:text-base">
          Simple. Secure. Seamless.
        </p>

        {/* Loading section */}

        <div className="mt-10 flex flex-col items-center">

          <div className="relative flex h-9 w-9 items-center justify-center">

            <Loader2 className="h-7 w-7 animate-spin text-white" />

          </div>

          <p className="mt-4 text-sm font-medium text-white/90">
            Loading your wallet...
          </p>

          <p className="mt-1 text-xs text-white/60">
            Please wait
          </p>

        </div>

        {/* Animated progress */}

        <div className="mt-7 h-1.5 w-48 overflow-hidden rounded-full bg-white/20 sm:w-56">

          <div
            className="h-full rounded-full bg-white"
            style={{
              animation:
                "dashboardSplashProgress 10s linear forwards",
            }}
          />

        </div>

        {/* Bottom text */}

        <p className="mt-12 text-xs text-white/50">
          Secure payments powered by IyanjuPay
        </p>

      </div>

      {/* Splash animation */}

       <style>
        {`
          @keyframes dashboardSplashProgress {
            from {
              width: 0%;
            }

            to {
              width: 100%;
            }
          }
        `}
      </style>
     
    </div>
  );
};

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
        <div className="flex flex-col items-center">
          <img
            src="/og-image.jpg"
            alt="IyanjuPay"
            className="h-24 w-24 object-contain animate-pulse"
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AppSplash;
