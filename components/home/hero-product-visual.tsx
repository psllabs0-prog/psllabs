import Image from "next/image";

import { heroCopy } from "@/lib/home/homepage";

export function HeroProductVisual() {
  return (
    <div className="relative mx-auto flex w-full max-w-[480px] items-center justify-center lg:max-w-none">
      {/* Soft blue gradient stage */}
      <div
        aria-hidden
        className="absolute inset-x-4 top-[8%] bottom-[12%] rounded-[2rem] bg-gradient-to-b from-biotech-pale via-biotech-mist to-biotech-light/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
      />
      <div
        aria-hidden
        className="absolute left-1/2 top-[20%] h-[280px] w-[280px] -translate-x-1/2 rounded-full bg-biotech-blue/20 blur-3xl md:h-[340px] md:w-[340px]"
      />

      <div className="relative aspect-[4/5] w-full max-w-[400px] md:max-w-[440px]">
        {/* Subtle COA accent — reduced visual weight */}
        <div
          aria-hidden
          className="absolute left-[6%] top-[14%] z-0 w-[48%] -rotate-6 rounded-lg border border-white/50 bg-white/60 p-4 opacity-70 shadow-[0_16px_40px_rgba(26,77,109,0.08)] backdrop-blur-sm"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="h-1.5 w-12 rounded-full bg-biotech-blue/25" />
            <span className="rounded border border-biotech-blue/20 bg-biotech-pale/80 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[0.5rem] uppercase tracking-wider text-biotech-deep/70">
              COA
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="h-1 w-full rounded-full bg-biotech-blue/10" />
            <div className="h-1 w-[80%] rounded-full bg-biotech-blue/10" />
            <div className="h-1 w-[60%] rounded-full bg-biotech-blue/10" />
          </div>
        </div>

        {/* Vial — centered higher */}
        <div className="absolute inset-x-0 top-[6%] z-10 flex justify-center md:top-[4%]">
          <div className="animate-float relative w-[62%] max-w-[260px] md:max-w-[280px]">
            <div
              aria-hidden
              className="absolute -inset-8 rounded-full bg-gradient-to-b from-biotech-light/40 via-biotech-blue/15 to-transparent blur-2xl"
            />
            <Image
              src={heroCopy.productImageSrc}
              alt={heroCopy.productImageAlt}
              width={600}
              height={900}
              priority
              className="relative z-10 h-auto w-full drop-shadow-[0_28px_44px_rgba(26,77,109,0.26)]"
              sizes="(max-width: 768px) 65vw, 280px"
            />
          </div>
        </div>

        {/* Surface glow */}
        <div
          aria-hidden
          className="absolute bottom-[8%] left-1/2 z-0 h-16 w-[65%] -translate-x-1/2 rounded-[100%] bg-gradient-to-r from-transparent via-biotech-blue/12 to-transparent blur-xl"
        />
      </div>
    </div>
  );
}
