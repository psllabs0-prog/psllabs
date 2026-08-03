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
    <section className="relative overflow-hidden bg-paper px-6 pb-10 pt-16 md:px-16 md:pb-12 md:pt-20 lg:px-24 lg:pb-14 lg:pt-24">
      <div className="relative mx-auto max-w-[1440px]">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-20">
          <div className="order-1 flex w-full flex-col items-center gap-6 md:flex-row md:items-stretch md:justify-center lg:order-2 lg:justify-end lg:gap-8 xl:gap-10">
            <div className="relative flex h-48 w-auto max-w-[10.5rem] shrink-0 items-center justify-center md:h-auto md:max-w-[12rem] lg:max-w-[13.5rem]">
              <Image
                src={heroCopy.productImageSrc}
                alt={heroCopy.productImageAlt}
                width={420}
                height={560}
                priority
                className="h-full w-auto object-contain object-center"
                sizes="(max-width: 768px) 168px, 216px"
              />
            </div>

            <CertificatePanel
              headerLabel="Featured batch · Retatrutide"
              rows={batchReportToCertificateRows(retatrutideBlackTopReport)}
              className="w-full max-w-md md:min-w-0 md:flex-1 md:max-w-sm lg:max-w-md"
            />
          </div>

          <div className="order-2 flex flex-col justify-center gap-6 lg:order-1 lg:max-w-md lg:gap-8 xl:max-w-lg">
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
