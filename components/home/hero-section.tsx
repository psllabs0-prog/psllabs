import Image from "next/image";

import { PillButton } from "@/components/ui/pill-button";
import { CertificatePanel } from "@/components/ui/certificate-panel";
import {
  batchReportToCertificateRows,
  retatrutideBlackTopReport,
} from "@/lib/batch-reports";
import { heroCopy } from "@/lib/home/homepage";

export function HeroSection() {
  return (
    <section className="relative bg-paper px-6 pb-8 pt-16 md:px-16 md:pb-10 md:pt-20 lg:px-24 lg:pb-12 lg:pt-24">
      <div className="relative mx-auto max-w-[1440px]">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-10 xl:gap-14">
          {/* Vial left of panel — no overlap */}
          <div className="order-1 flex w-full flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-center sm:gap-4 lg:order-2 lg:justify-end lg:gap-5">
            <div className="relative w-[13rem] shrink-0 sm:w-[14.5rem] lg:w-[16rem] xl:w-[17rem]">
              <Image
                src={heroCopy.productImageSrc}
                alt={heroCopy.productImageAlt}
                width={520}
                height={700}
                priority
                className="h-auto w-full object-contain"
                sizes="(max-width: 640px) 208px, 272px"
              />
            </div>

            <CertificatePanel
              headerLabel="Featured batch · Retatrutide"
              rows={batchReportToCertificateRows(retatrutideBlackTopReport)}
              className="w-full max-w-md sm:min-w-0 sm:flex-1 sm:max-w-sm lg:max-w-md"
            />
          </div>

          <div className="order-2 flex flex-col justify-center gap-6 lg:order-1 lg:max-w-xl lg:gap-8">
            <div className="flex flex-col gap-4 md:gap-5">
              <p className="mono text-accent">{heroCopy.eyebrow}</p>
              <h1 className="font-display text-display-lg font-bold text-ink md:text-display-xl">
                {heroCopy.headline}
              </h1>
              <p className="text-base leading-relaxed text-ash md:text-body-lg">
                {heroCopy.subheadline}
              </p>
            </div>

            <PillButton href={heroCopy.ctaHref} className="w-full sm:w-fit">
              {heroCopy.ctaLabel}
            </PillButton>
          </div>
        </div>
      </div>
    </section>
  );
}
