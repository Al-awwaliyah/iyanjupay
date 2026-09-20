import React from "react";

const AppSplash = () => {
  return (
    <div
      className="
        fixed inset-0 z-[99999]
        flex min-h-screen
        items-center justify-center
        overflow-hidden
        bg-[#071A3D]
      "
    >
      {/* Primary atmospheric gradient */}
      <div
        className="
          pointer-events-none
          absolute inset-0
          bg-[radial-gradient(circle_at_50%_38%,rgba(22,163,74,0.28),transparent_42%)]
        "
      />

      {/* Secondary blue glow */}
      <div
        className="
          pointer-events-none
          absolute -right-32 -top-32
          h-[28rem] w-[28rem]
          rounded-full
          bg-blue-500/10
          blur-3xl
        "
      />

      {/* Green glow */}
      <div
        className="
          pointer-events-none
          absolute -bottom-40 -left-40
          h-[30rem] w-[30rem]
          rounded-full
          bg-green-500/10
          blur-3xl
        "
      />

      {/* Subtle center glow */}
      <div
        className="
          pointer-events-none
          absolute left-1/2 top-1/2
          h-72 w-72
          -translate-x-1/2
          -translate-y-1/2
          rounded-full
          bg-emerald-400/5
          blur-3xl
        "
      />

      {/* Main splash content */}
      <div
        className="
          relative z-10
          flex w-full max-w-md
          flex-col items-center
          px-8 text-center
        "
      >
        {/* Brand logo */}
        <div
          className="
            mb-8
            flex items-center justify-center
            animate-[splashLogo_900ms_ease-out]
          "
        >
          <img
            src="/icon-180.png"
            alt="IyanjuPay"
            className="
              h-28 w-28
              rounded-[30px]
              object-contain
              drop-shadow-[0_20px_45px_rgba(0,0,0,0.30)]
            "
            draggable={false}
          />
        </div>

        {/* App name */}
        <h1
          className="
            text-[2.65rem]
            font-extrabold
            tracking-[-0.04em]
            text-white
            sm:text-5xl
            animate-[splashText_900ms_ease-out]
          "
        >
          IyanjuPay
        </h1>

        {/* Tagline */}
        <p
          className="
            mt-3
            text-sm
            font-medium
            tracking-wide
            text-white/70
            sm:text-base
            animate-[splashText_1100ms_ease-out]
          "
        >
          Simple. Secure. Seamless.
        </p>
      </div>

      {/* Minimal brand accent */}
      <div
        className="
          pointer-events-none
          absolute bottom-10 left-1/2
          h-1 w-10
          -translate-x-1/2
          rounded-full
          bg-emerald-400/70
          animate-[splashAccent_1200ms_ease-out]
        "
      />

      <style>{`
        @keyframes splashLogo {
          0% {
            opacity: 0;
            transform: scale(0.88) translateY(8px);
          }

          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes splashText {
          0% {
            opacity: 0;
            transform: translateY(10px);
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
            opacity: 0.7;
            transform: translateX(-50%) scaleX(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 1ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default AppSplash;
