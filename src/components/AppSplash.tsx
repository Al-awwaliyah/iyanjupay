import React, { useMemo } from "react";

type SplashTheme = "light" | "dark";

const THEME_STORAGE_KEY = "iyanjupay-dashboard-theme";

const getSplashTheme = (): SplashTheme => {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (storedTheme === "dark") {
      return "dark";
    }

    if (storedTheme === "light" || storedTheme === "blue") {
      return "light";
    }
  } catch {
    // Ignore localStorage errors and use the light default.
  }

  // IyanjuPay defaults to light mode. The splash follows the
  // explicit in-app preference only and does not inherit the
  // device system theme on first launch.
  return "light";
};

const AppSplash = () => {
  const theme = useMemo(getSplashTheme, []);
  const isDark = theme === "dark";

  return (
    <div
      className={[
        "fixed inset-0 z-[99999]",
        "flex min-h-[100dvh]",
        "items-center justify-center",
        "overflow-hidden",
        "transition-colors duration-500",
        isDark ? "bg-[#061329]" : "bg-white",
      ].join(" ")}
    >
      {/* Primary ambient light */}
      <div
        className={[
          "pointer-events-none absolute",
          "left-1/2 top-1/2",
          "h-[460px] w-[460px]",
          "-translate-x-1/2 -translate-y-1/2",
          "rounded-full blur-[110px]",
          "animate-[splashAmbient_6s_ease-in-out_infinite]",
          isDark ? "bg-emerald-400/[0.07]" : "bg-emerald-400/[0.055]",
        ].join(" ")}
      />

      {/* Secondary emerald light */}
      <div
        className={[
          "pointer-events-none absolute",
          "left-1/2 top-[42%]",
          "h-[180px] w-[180px]",
          "-translate-x-1/2 -translate-y-1/2",
          "rounded-full blur-[75px]",
          "animate-[splashLight_5s_ease-in-out_infinite]",
          isDark ? "bg-emerald-300/[0.075]" : "bg-emerald-400/[0.07]",
        ].join(" ")}
      />

      {/* Very subtle atmospheric light */}
      <div
        className={[
          "pointer-events-none absolute",
          "left-1/2 top-1/2",
          "h-[70%] w-[120%]",
          "-translate-x-1/2 -translate-y-1/2",
          "opacity-50 blur-[40px]",
          "animate-[splashFlow_10s_ease-in-out_infinite]",
        ].join(" ")}
      >
        <div
          className={[
            "absolute left-[-20%] top-[48%]",
            "h-[35px] w-[140%]",
            "rotate-[-7deg]",
            "rounded-full",
            isDark
              ? "bg-gradient-to-r from-transparent via-emerald-400/[0.08] to-transparent"
              : "bg-gradient-to-r from-transparent via-emerald-500/[0.06] to-transparent",
          ].join(" ")}
        />
      </div>

      {/* Main brand */}
      <main className="relative z-10 flex w-full flex-col items-center justify-center px-8 text-center">
        {/* Rounded logo only — no surrounding border/ring */}
        <div
          className="
            relative
            flex items-center justify-center
            animate-[splashLogo_900ms_cubic-bezier(0.16,1,0.3,1)_both]
          "
        >
          {/* Soft glow behind the logo */}
          <div
            className={[
              "pointer-events-none absolute",
              "h-[145px] w-[145px]",
              "rounded-full blur-[38px]",
              "animate-[splashAura_4s_ease-in-out_infinite]",
              isDark
                ? "bg-emerald-400/[0.055]"
                : "bg-emerald-400/[0.045]",
            ].join(" ")}
          />

          {/* IyanjuPay rounded logo */}
          <img
            src="/icon-512.png"
            alt="IyanjuPay"
            className="
              relative
              h-[110px] w-[110px]
              rounded-[28px]
              object-contain
              select-none
              drop-shadow-[0_18px_35px_rgba(0,0,0,0.16)]
            "
            draggable={false}
          />

          {/* Very subtle premium light sweep */}
          <span
            className="
              pointer-events-none
              absolute
              left-[-35%]
              top-[-25%]
              h-[150%]
              w-[12px]
              rotate-[24deg]
              bg-gradient-to-b
              from-transparent
              via-white/50
              to-transparent
              blur-[4px]
              opacity-0
              animate-[splashSweep_1100ms_650ms_ease-out_both]
            "
          />
        </div>

        {/* Brand name */}
        <h1
          className={[
            "mt-8",
            "text-[2.7rem]",
            "font-extrabold",
            "leading-none",
            "tracking-[-0.055em]",
            "animate-[splashName_850ms_220ms_cubic-bezier(0.16,1,0.3,1)_both]",
            "sm:text-5xl",
            isDark ? "text-white" : "text-[#082A63]",
          ].join(" ")}
        >
          IyanjuPay
        </h1>

        {/* Tagline */}
        <p
          className={[
            "mt-4",
            "text-[0.72rem]",
            "font-medium",
            "uppercase",
            "tracking-[0.23em]",
            "animate-[splashTagline_850ms_380ms_cubic-bezier(0.16,1,0.3,1)_both]",
            "sm:text-xs",
            isDark ? "text-white/55" : "text-slate-500",
          ].join(" ")}
        >
          Simple. Secure. Seamless.
        </p>

        <div
          className={[
            "mt-6 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em]",
            "animate-[splashTagline_850ms_520ms_cubic-bezier(0.16,1,0.3,1)_both]",
            isDark ? "text-white/40" : "text-slate-400",
          ].join(" ")}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.45)]" />
          Secure fintech experience
        </div>
      </main>

      {/* Small brand accent */}
      <div
        className="
          pointer-events-none
          absolute bottom-10 left-1/2
          -translate-x-1/2
          animate-[splashAccent_850ms_550ms_ease-out_both]
        "
      >
        <div
          className="
            h-[2px] w-8
            rounded-full
            bg-emerald-500/70
            shadow-[0_0_14px_rgba(16,185,129,0.22)]
          "
        />
      </div>

      <style>{`
        @keyframes splashLogo {
          0% {
            opacity: 0;
            transform: translateY(14px) scale(0.84);
          }

          65% {
            opacity: 1;
            transform: translateY(-2px) scale(1.025);
          }

          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes splashName {
          0% {
            opacity: 0;
            transform: translateY(12px);
          }

          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes splashTagline {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }

          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes splashAccent {
          0% {
            opacity: 0;
            transform: translateX(-50%) scaleX(0);
          }

          100% {
            opacity: 1;
            transform: translateX(-50%) scaleX(1);
          }
        }

        @keyframes splashSweep {
          0% {
            left: -35%;
            opacity: 0;
          }

          18% {
            opacity: 0;
          }

          38% {
            opacity: 0.7;
          }

          65% {
            opacity: 0.3;
          }

          100% {
            left: 120%;
            opacity: 0;
          }
        }

        @keyframes splashAmbient {
          0%,
          100% {
            opacity: 0.55;
            transform: translate(-50%, -50%) scale(0.94);
          }

          50% {
            opacity: 0.9;
            transform: translate(-50%, -50%) scale(1.06);
          }
        }

        @keyframes splashLight {
          0%,
          100% {
            opacity: 0.55;
            transform: translate(-50%, -50%) scale(0.9);
          }

          50% {
            opacity: 0.9;
            transform: translate(-50%, -50%) scale(1.08);
          }
        }

        @keyframes splashFlow {
          0%,
          100% {
            transform:
              translate(-50%, -50%)
              rotate(-1deg)
              scale(1);
          }

          50% {
            transform:
              translate(-48%, -51%)
              rotate(2deg)
              scale(1.05);
          }
        }

        @keyframes splashAura {
          0%,
          100% {
            opacity: 0.45;
            transform: scale(0.94);
          }

          50% {
            opacity: 0.75;
            transform: scale(1.07);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 1ms !important;
            animation-delay: 0ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default AppSplash;
