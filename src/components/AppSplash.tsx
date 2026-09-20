import React from "react";

const AppSplash = () => {
  return (
    <div
      className="
        fixed inset-0 z-[99999]
        flex min-h-[100dvh]
        items-center justify-center
        overflow-hidden
        bg-[#061633]
      "
    >
      {/* ============================================================
          ATMOSPHERIC BACKGROUND
      ============================================================ */}

      {/* Emerald light source */}
      <div
        className="
          pointer-events-none
          absolute left-1/2 top-[38%]
          h-[26rem] w-[26rem]
          -translate-x-1/2
          -translate-y-1/2
          rounded-full
          bg-emerald-500/[0.13]
          blur-[110px]
          animate-[splashGlow_4s_ease-in-out_infinite]
        "
      />

      {/* Blue light source */}
      <div
        className="
          pointer-events-none
          absolute -right-32 -top-32
          h-[30rem] w-[30rem]
          rounded-full
          bg-blue-500/[0.10]
          blur-[120px]
        "
      />

      {/* Lower green light */}
      <div
        className="
          pointer-events-none
          absolute -bottom-40 -left-40
          h-[30rem] w-[30rem]
          rounded-full
          bg-emerald-400/[0.08]
          blur-[120px]
        "
      />

      {/* ============================================================
          SUBTLE FINTECH GRID
      ============================================================ */}

      <div
        className="
          pointer-events-none
          absolute inset-0
          opacity-[0.035]
          [background-image:linear-gradient(rgba(255,255,255,1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,1)_1px,transparent_1px)]
          [background-size:48px_48px]
        "
      />

      {/* Soft vignette */}
      <div
        className="
          pointer-events-none
          absolute inset-0
          bg-[radial-gradient(circle_at_center,transparent_25%,rgba(2,8,23,0.42)_100%)]
        "
      />

      {/* ============================================================
          BRAND
      ============================================================ */}

      <main
        className="
          relative z-10
          flex w-full
          flex-col
          items-center
          justify-center
          px-8
          text-center
        "
      >
        {/* Logo */}
        <div
          className="
            relative
            flex items-center justify-center
            animate-[splashLogo_900ms_cubic-bezier(0.22,1,0.36,1)]
          "
        >
          {/* Logo aura */}
          <div
            className="
              pointer-events-none
              absolute
              h-36 w-36
              rounded-full
              bg-emerald-400/[0.12]
              blur-2xl
              animate-[splashAura_3.5s_ease-in-out_infinite]
            "
          />

          {/* Logo */}
          <img
            src="/icon-180.png"
            alt="IyanjuPay"
            className="
              relative
              h-[108px] w-[108px]
              object-contain
              drop-shadow-[0_24px_50px_rgba(0,0,0,0.38)]
              select-none
            "
            draggable={false}
          />
        </div>

        {/* Brand name */}
        <h1
          className="
            mt-8
            text-[2.7rem]
            font-extrabold
            leading-none
            tracking-[-0.055em]
            text-white
            animate-[splashName_950ms_120ms_cubic-bezier(0.22,1,0.36,1)_both]
            sm:text-5xl
          "
        >
          IyanjuPay
        </h1>

        {/* Tagline */}
        <p
          className="
            mt-4
            text-[0.82rem]
            font-medium
            tracking-[0.16em]
            text-white/65
            animate-[splashTagline_1000ms_260ms_cubic-bezier(0.22,1,0.36,1)_both]
            sm:text-sm
          "
        >
          SIMPLE. SECURE. SEAMLESS.
        </p>
      </main>

      {/* ============================================================
          BOTTOM BRAND ACCENT
      ============================================================ */}

      <div
        className="
          pointer-events-none
          absolute bottom-10 left-1/2
          flex -translate-x-1/2
          flex-col items-center
          gap-3
        "
      >
        <div
          className="
            h-[3px] w-9
            rounded-full
            bg-emerald-400/80
            shadow-[0_0_18px_rgba(52,211,153,0.35)]
            animate-[splashAccent_1100ms_450ms_ease-out_both]
          "
        />
      </div>

      {/* ============================================================
          ANIMATION
      ============================================================ */}

      <style>{`
        @keyframes splashLogo {
          0% {
            opacity: 0;
            transform: scale(0.78) translateY(18px);
          }

          65% {
            opacity: 1;
            transform: scale(1.035) translateY(-2px);
          }

          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes splashName {
          0% {
            opacity: 0;
            transform: translateY(16px);
          }

          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes splashTagline {
          0% {
            opacity: 0;
            transform: translateY(12px);
          }

          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes splashAccent {
          0% {
            opacity: 0;
            transform: scaleX(0);
          }

          100% {
            opacity: 1;
            transform: scaleX(1);
          }
        }

        @keyframes splashGlow {
          0%,
          100% {
            opacity: 0.65;
            transform: translate(-50%, -50%) scale(0.95);
          }

          50% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.08);
          }
        }

        @keyframes splashAura {
          0%,
          100% {
            opacity: 0.55;
            transform: scale(0.92);
          }

          50% {
            opacity: 0.9;
            transform: scale(1.08);
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
