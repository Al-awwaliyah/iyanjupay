import React from "react";

const AppSplash = () => {
  return (
    <div className="fixed inset-0 z-[99999] isolate min-h-[100dvh] overflow-hidden bg-[#080638] text-white">
      {/* Deep indigo and violet atmosphere from the IyanjuPay reference. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_46%,rgba(102,20,218,0.72)_0%,rgba(55,13,139,0.38)_34%,transparent_65%),radial-gradient(ellipse_at_88%_80%,rgba(22,25,180,0.68)_0%,transparent_56%),linear-gradient(155deg,#08062f_0%,#10064c_52%,#09083c_100%)]" />
      <div className="pointer-events-none absolute -left-24 top-[28%] h-72 w-72 rounded-full bg-violet-600/20 blur-[90px]" />
      <div className="pointer-events-none absolute -right-24 bottom-[13%] h-80 w-80 rounded-full bg-blue-600/25 blur-[100px]" />


      {/* Brand lockup */}
      <main className="relative z-10 flex min-h-[100dvh] flex-col items-center">
        <div className="absolute left-1/2 top-[25%] flex w-full -translate-x-1/2 flex-col items-center px-6 text-center sm:top-[23%]">
          <div className="splash-mark-enter relative mb-5 flex h-[112px] w-[112px] items-center justify-center sm:h-[126px] sm:w-[126px]">
            <div className="absolute inset-0 rounded-full bg-violet-500/40 blur-[30px]" />
            <svg viewBox="0 0 120 120" className="relative h-full w-full drop-shadow-[0_12px_30px_rgba(0,0,0,.42)]" role="img" aria-label="IyanjuPay logo">
              <defs>
                <linearGradient id="iyanju-purple" x1="12" y1="10" x2="99" y2="106" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#8B16FF" />
                  <stop offset=".58" stopColor="#5900E8" />
                  <stop offset="1" stopColor="#2600A8" />
                </linearGradient>
              </defs>
              <circle cx="60" cy="60" r="55" fill="url(#iyanju-purple)" />
              <circle cx="81" cy="19" r="12" fill="#fff" />
              <path d="M68 37c-8 7-17 12-27 16-4 2-6 5-5 8 1 3 5 4 9 2l10-5-13 39c-1 4 2 7 6 6l12-3c3-1 5-3 6-6l17-51c2-6-8-10-15-6Z" fill="#fff" />
              <path d="M47 61c7-7 16-13 28-18" stroke="#17005D" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </div>

          <h1 className="splash-name-enter text-[2.55rem] font-extrabold leading-none tracking-[-0.055em] text-white sm:text-5xl">
            IyanjuPay
          </h1>
          <p className="splash-tag-enter mt-3 text-[15px] font-medium tracking-[-0.02em] text-white/90 sm:text-lg">
            Money, made effortless.
          </p>
        </div>

        {/* City skyline and water reflection */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[7.5%] h-[37%] overflow-hidden">
          <div className="absolute inset-x-0 bottom-[26%] h-[46%] bg-gradient-to-t from-fuchsia-500/25 via-purple-500/15 to-transparent blur-xl" />
          <svg viewBox="0 0 430 250" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <defs>
              <linearGradient id="splash-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#6D2ACB" stopOpacity="0" />
                <stop offset=".5" stopColor="#E45AAE" stopOpacity=".3" />
                <stop offset="1" stopColor="#F49BC4" stopOpacity=".08" />
              </linearGradient>
              <linearGradient id="splash-water" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#9B43D8" stopOpacity=".34" />
                <stop offset="1" stopColor="#07052D" stopOpacity=".95" />
              </linearGradient>
              <linearGradient id="splash-building" x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="#15143C" />
                <stop offset="1" stopColor="#03051B" />
              </linearGradient>
            </defs>
            <rect width="430" height="250" fill="url(#splash-sky)" />
            <circle cx="83" cy="101" r="25" fill="#FF9BCB" opacity=".12" />
            <path d="M0 139 20 129 37 136 54 119 70 132 88 114 106 132 124 122 142 135 162 110 180 131 199 116 219 135 239 120 260 136 280 112 300 131 320 117 342 134 362 111 382 130 404 115 430 128V175H0Z" fill="#17113E" opacity=".75" />
            {/* distant buildings */}
            <g fill="#080A27">
              <path d="M0 151h22v-32h8v32h14v-43h8v43h14v-25h12v25h18v-53h8v53h16v-37h11v37h16v-62h8v62h17v-34h11v34h17v-48h10v48h16v-28h14v28h15v-58h9v58h17v-38h13v38h16v-66h8v66h16v-39h14v39h16v-52h9v52h15v-30h16v30h13v-45h9v45h18v99H0Z" />
            </g>
            {/* signature towers */}
            <g fill="url(#splash-building)">
              <path d="M37 150h22v-48l11-13 11 13v48h10v100H37Z" />
              <path d="M118 150h27V75l4-22 4 22v75h12v100h-47Z" />
              <path d="M209 150h28V61l5-31 5 31v89h12v100h-50Z" />
              <path d="M319 150h25V84l5-17 5 17v66h12v100h-47Z" />
              <path d="M382 150h20v-44l8-12 8 12v44h12v100h-48Z" />
            </g>
            <g fill="#F8B5D6" opacity=".62">
              {Array.from({ length: 26 }).map((_, i) => <rect key={i} x={43 + (i % 5) * 5} y={115 + Math.floor(i / 5) * 10} width="1.8" height="3" rx=".6" />)}
              {Array.from({ length: 28 }).map((_, i) => <rect key={`b-${i}`} x={214 + (i % 4) * 5} y={58 + Math.floor(i / 4) * 12} width="2" height="3" rx=".6" />)}
              {Array.from({ length: 16 }).map((_, i) => <rect key={`c-${i}`} x={324 + (i % 4) * 5} y={91 + Math.floor(i / 4) * 11} width="2" height="3" rx=".6" />)}
            </g>
            <path d="M0 153H430V250H0Z" fill="url(#splash-water)" />
            <path d="M0 157c73 3 111-2 173 0s130 3 257-1" stroke="#F3A1D0" strokeOpacity=".65" strokeWidth="2" />
            <g stroke="#E69BD2" strokeOpacity=".24" strokeWidth="1.2">
              <path d="M18 171h120M42 179h78M190 169h175M225 179h120M12 193h160M260 192h144M72 211h98M216 216h177M28 231h135M245 237h140" />
            </g>
            <g fill="#F7B1D7" opacity=".38">
              <path d="M64 157h8l-4 30Z" /><path d="M231 157h8l-4 42Z" /><path d="M335 157h8l-4 35Z" />
            </g>
          </svg>
          <div className="absolute inset-x-0 bottom-0 h-[28%] bg-gradient-to-b from-transparent via-[#100744]/65 to-[#080638]" />
        </div>

        {/* Onboarding indicator shown on the splash reference */}
        <div className="absolute bottom-[max(34px,calc(env(safe-area-inset-bottom)+26px))] left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-[#10064c]/75 px-5 py-3 shadow-[0_8px_30px_rgba(0,0,0,.28)] backdrop-blur-md">
          <span className="h-2 w-5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,.7)]" />
          <span className="h-2 w-2 rounded-full bg-white/55" />
          <span className="h-2 w-2 rounded-full bg-white/55" />
        </div>
      </main>

      {/* Native-style home indicator */}
      <div className="pointer-events-none absolute bottom-[max(8px,env(safe-area-inset-bottom))] left-1/2 z-30 h-[4px] w-[108px] -translate-x-1/2 rounded-full bg-white/90" />

      <style>{`
        @keyframes splash-mark-in {
          from { opacity: 0; transform: translateY(14px) scale(.88); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes splash-name-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes splash-tag-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .splash-mark-enter { animation: splash-mark-in 850ms cubic-bezier(.16,1,.3,1) both; }
        .splash-name-enter { animation: splash-name-in 750ms 180ms cubic-bezier(.16,1,.3,1) both; }
        .splash-tag-enter { animation: splash-tag-in 750ms 320ms cubic-bezier(.16,1,.3,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .splash-mark-enter, .splash-name-enter, .splash-tag-enter { animation: none !important; }
        }
      `}</style>
    </div>
  );
};

export default AppSplash;
