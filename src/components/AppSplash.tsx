import React from "react";

const AppSplash = () => {
  return (
    <div
      className="
        fixed inset-0 z-[99999]
        flex min-h-[100dvh]
        items-center justify-center
        overflow-hidden
        bg-[#050D1C]
      "
    >
      {/* ============================================================
          PREMIUM CINEMATIC BACKGROUND
      ============================================================ */}

      {/* Very subtle ambient emerald light */}
      <div
        className="
          pointer-events-none
          absolute left-1/2 top-1/2
          h-[520px] w-[520px]
          -translate-x-1/2
          -translate-y-1/2
          rounded-full
          bg-emerald-400/[0.045]
          blur-[130px]
          animate-[ambientPulse_7s_ease-in-out_infinite]
        "
      />

      {/* ============================================================
          FLOWING LIGHT RIBBON — PRIMARY MOTION
      ============================================================ */}

      <div
        className="
          pointer-events-none
          absolute left-1/2 top-1/2
          h-[115%] w-[170%]
          -translate-x-1/2
          -translate-y-1/2
          opacity-[0.30]
          blur-[38px]
          animate-[ribbonDrift_9s_ease-in-out_infinite]
        "
      >
        <div
          className="
            absolute left-[-20%] top-[43%]
            h-[90px] w-[140%]
            -rotate-[12deg]
            rounded-full
            bg-[linear-gradient(90deg,transparent_0%,rgba(16,185,129,0.02)_15%,rgba(16,185,129,0.20)_42%,rgba(52,211,153,0.30)_50%,rgba(16,185,129,0.12)_60%,transparent_86%)]
          "
        />
      </div>

      {/* Secondary flowing ribbon */}
      <div
        className="
          pointer-events-none
          absolute left-1/2 top-1/2
          h-[110%] w-[150%]
          -translate-x-1/2
          -translate-y-1/2
          opacity-[0.18]
          blur-[26px]
          animate-[ribbonDriftReverse_12s_ease-in-out_infinite]
        "
      >
        <div
          className="
            absolute left-[-15%] top-[52%]
            h-[55px] w-[130%]
            rotate-[9deg]
            rounded-full
            bg-[linear-gradient(90deg,transparent_5%,rgba(59,130,246,0.02)_20%,rgba(16,185,129,0.20)_48%,rgba(96,165,250,0.13)_58%,transparent_90%)]
          "
        />
      </div>

      {/* ============================================================
          FINE LIGHT ORBIT
      ============================================================ */}

      <div
        className="
          pointer-events-none
          absolute left-1/2 top-1/2
          h-[310px] w-[310px]
          -translate-x-1/2
          -translate-y-1/2
          rounded-full
          border
          border-emerald-300/[0.045]
          animate-[orbitRotate_18s_linear_infinite]
        "
      />

      <div
        className="
          pointer-events-none
          absolute left-1/2 top-1/2
          h-[430px] w-[430px]
          -translate-x-1/2
          -translate-y-1/2
          rounded-full
          border
          border-white/[0.018]
          animate-[orbitRotateReverse_24s_linear_infinite]
        "
      />

      {/* ============================================================
          VIGNETTE
      ============================================================ */}

      <div
        className="
          pointer-events-none
          absolute inset-0
          bg-[radial-gradient(circle_at_center,transparent_15%,rgba(3,8,20,0.18)_55%,rgba(1,4,12,0.78)_100%)]
        "
      />

      {/* ============================================================
          BRAND CONTENT
      ============================================================ */}

      <main
        className="
          relative z-20
          flex w-full
          flex-col
          items-center
          justify-center
          px-8
          text-center
        "
      >
        {/* ==========================================================
            LOGO
        ========================================================== */}

        <div
          className="
            relative
            flex items-center justify-center
            animate-[logoReveal_950ms_cubic-bezier(0.16,1,0.3,1)_both]
          "
        >
          {/* Controlled logo aura */}
          <div
            className="
              pointer-events-none
              absolute
              h-[145px] w-[145px]
              rounded-full
              bg-emerald-400/[0.055]
              blur-[38px]
              animate-[logoAura_4s_ease-in-out_infinite]
            "
          />

          <img
            src="/icon-180.png"
            alt="IyanjuPay"
            className="
              relative
              h-[112px] w-[112px]
              object-contain
              select-none
              drop-shadow-[0_22px_45px_rgba(0,0,0,0.42)]
            "
            draggable={false}
          />

          {/* ========================================================
              SINGLE LIGHT SWEEP
          ======================================================== */}

          <span
            className="
              pointer-events-none
              absolute
              left-[-35%]
              top-[-25%]
              h-[150%]
              w-[16px]
              rotate-[25deg]
              bg-gradient-to-b
              from-transparent
              via-white/45
              to-transparent
              blur-[5px]
              opacity-0
              animate-[logoSweep_1200ms_700ms_ease-out_both]
            "
          />
        </div>

        {/* ==========================================================
            BRAND NAME
        ========================================================== */}

        <h1
          className="
            mt-8
            text-[2.75rem]
            font-extrabold
            leading-none
            tracking-[-0.055em]
            text-white
            animate-[nameReveal_900ms_250ms_cubic-bezier(0.16,1,0.3,1)_both]
            sm:text-5xl
          "
        >
          IyanjuPay
        </h1>

        {/* ==========================================================
            TAGLINE
        ========================================================== */}

        <p
          className="
            mt-4
            text-[0.72rem]
            font-medium
            uppercase
            tracking-[0.24em]
            text-white/55
            animate-[taglineReveal_900ms_430ms_cubic-bezier(0.16,1,0.3,1)_both]
            sm:text-xs
          "
        >
          Simple. Secure. Seamless.
        </p>
      </main>

      {/* ============================================================
          MINIMAL BRAND DETAIL
      ============================================================ */}

      <div
        className="
          pointer-events-none
          absolute bottom-10 left-1/2
          -translate-x-1/2
          animate-[accentReveal_900ms_650ms_ease-out_both]
        "
      >
        <div
          className="
            h-[2px] w-8
            rounded-full
            bg-emerald-400/65
            shadow-[0_0_14px_rgba(52,211,153,0.25)]
          "
        />
      </div>

      {/* ============================================================
          MOTION SYSTEM
      ============================================================ */}

      <style>{`
        @keyframes logoReveal {
          0% {
            opacity: 0;
            transform: translateY(16px) scale(0.82);
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

        @keyframes nameReveal {
          0% {
            opacity: 0;
            transform: translateY(13px);
          }

          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes taglineReveal {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }

          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes accentReveal {
          0% {
            opacity: 0;
            transform: translateX(-50%) scaleX(0);
          }

          100% {
            opacity: 1;
            transform: translateX(-50%) scaleX(1);
          }
        }

        @keyframes logoSweep {
          0% {
            left: -35%;
            opacity: 0;
          }

          15% {
            opacity: 0;
          }

          35% {
            opacity: 0.8;
          }

          65% {
            opacity: 0.45;
          }

          100% {
            left: 120%;
            opacity: 0;
          }
        }

        @keyframes logoAura {
          0%,
          100% {
            opacity: 0.45;
            transform: scale(0.92);
          }

          50% {
            opacity: 0.75;
            transform: scale(1.08);
          }
        }

        @keyframes ambientPulse {
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

        @keyframes ribbonDrift {
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
              scale(1.06);
          }
        }

        @keyframes ribbonDriftReverse {
          0%,
          100% {
            transform:
              translate(-50%, -50%)
              rotate(1deg)
              scale(1.04);
          }

          50% {
            transform:
              translate(-52%, -49%)
              rotate(-2deg)
              scale(0.96);
          }
        }

        @keyframes orbitRotate {
          from {
            transform:
              translate(-50%, -50%)
              rotate(0deg);
          }

          to {
            transform:
              translate(-50%, -50%)
              rotate(360deg);
          }
        }

        @keyframes orbitRotateReverse {
          from {
            transform:
              translate(-50%, -50%)
              rotate(360deg);
          }

          to {
            transform:
              translate(-50%, -50%)
              rotate(0deg);
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
