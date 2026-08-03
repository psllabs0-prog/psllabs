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
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-8 xl:gap-10">
          {/* Vial tucked against the certificate’s top-left corner */}
          <div className="order-1 w-full lg:order-2 lg:justify-self-end lg:max-w-[38rem] xl:max-w-[40rem]">
            <div className="relative w-full">
              <div className="relative z-10 mb-[-3.25rem] w-[14rem] max-w-[55%] sm:mb-[-3.75rem] sm:w-[16rem] md:absolute md:left-0 md:top-0 md:mb-0 md:w-[17.5rem] md:-translate-x-1 md:-translate-y-4 lg:w-[19rem] lg:-translate-x-2 lg:-translate-y-5 xl:w-[20rem]">
                <Image
                  src={heroCopy.productImageSrc}
                  alt={heroCopy.productImageAlt}
                  width={520}
                  height={700}
                  priority
                  className="h-auto w-full object-contain object-top"
                  sizes="(max-width: 768px) 256px, 320px"
                />
              </div>

              <CertificatePanel
                headerLabel="Featured batch · Retatrutide"
                rows={batchReportToCertificateRows(retatrutideBlackTopReport)}
                className="relative z-0 w-full md:ml-[8.75rem] md:w-[calc(100%-8.75rem)] lg:ml-[9.5rem] lg:w-[calc(100%-9.5rem)] xl:ml-[10rem] xl:w-[calc(100%-10rem)]"
              />
            </div>
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
