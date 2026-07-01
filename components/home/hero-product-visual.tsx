import Image from "next/image";

import { heroCopy } from "@/lib/home/homepage";

export function HeroProductVisual() {
  return (
    <div className="relative mx-auto flex w-full max-w-[620px] items-center justify-center lg:mx-0 lg:ml-auto lg:max-w-none">
      {/* Ambient lighting */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-biotech-blue/20 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute right-0 top-8 h-48 w-48 rounded-full bg-biotech-light/80 blur-2xl"
      />

      <div className="relative aspect-square w-full max-w-[520px]">
        {/* COA document — blurred backdrop */}
        <div
          aria-hidden
          className="absolute left-[4%] top-[18%] z-0 w-[58%] -rotate-6 rounded-xl border border-white/60 bg-gradient-to-br from-white/90 to-biotech-mist/90 p-5 shadow-[0_24px_60px_rgba(26,77,109,0.12)] backdrop-blur-md"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="h-2 w-16 rounded-full bg-biotech-blue/30" />
            <div className="mono text-[0.55rem] text-biotech-deep/70">COA</div>
          </div>
          <div className="space-y-2">
            <div className="h-1.5 w-full rounded-full bg-biotech-blue/15" />
            <div className="h-1.5 w-[85%] rounded-full bg-biotech-blue/10" />
            <div className="h-1.5 w-[70%] rounded-full bg-biotech-blue/10" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="h-8 rounded-md bg-biotech-pale/80" />
              <div className="h-8 rounded-md bg-biotech-pale/60" />
            </div>
            <div className="h-1.5 w-[55%] rounded-full bg-biotech-blue/10" />
          </div>
        </div>

        {/* Secondary certificate layer */}
        <div
          aria-hidden
          className="absolute bottom-[12%] right-[6%] z-0 h-32 w-40 rotate-3 rounded-lg border border-white/50 bg-white/40 blur-[2px] backdrop-blur-sm"
        />

        {/* Product stage */}
        <div className="absolute inset-0 z-10 flex items-end justify-center pb-4 pl-8 md:pl-12">
          <div className="animate-float relative w-[58%] max-w-[300px]">
            <div
              aria-hidden
              className="absolute -inset-6 rounded-full bg-gradient-to-t from-biotech-blue/25 via-transparent to-transparent blur-2xl"
            />
            <Image
              src={heroCopy.productImageSrc}
              alt={heroCopy.productImageAlt}
              width={600}
              height={900}
              priority
              className="relative z-10 h-auto w-full drop-shadow-[0_32px_48px_rgba(26,77,109,0.28)]"
              sizes="(max-width: 768px) 70vw, 300px"
            />
          </div>
        </div>

        {/* Foreground surface reflection */}
        <div
          aria-hidden
          className="absolute bottom-0 left-1/2 z-0 h-24 w-[72%] -translate-x-1/2 rounded-[100%] bg-gradient-to-r from-transparent via-biotech-blue/10 to-transparent blur-xl"
        />
      </div>
    </div>
  );
}
