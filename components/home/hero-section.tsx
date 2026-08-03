import { PillButton } from "@/components/ui/pill-button";
import { CertificatePanel } from "@/components/ui/certificate-panel";
import { HeroTrustCards } from "@/components/home/hero-trust-cards";
import {
  batchReportToCertificateRows,
  retatrutideBlackTopReport,
} from "@/lib/batch-reports";
import { heroCopy, heroTrustCards } from "@/lib/home/homepage";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-paper px-6 pb-12 pt-16 md:px-16 md:pb-16 md:pt-20 lg:px-24 lg:pb-20 lg:pt-24">
      <div className="relative mx-auto flex max-w-[1440px] flex-col gap-10 md:gap-12 lg:gap-14">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-20">
          <div className="order-1 flex w-full justify-center lg:order-2 lg:justify-end">
            <CertificatePanel
              headerLabel="Featured batch · Retatrutide"
              rows={batchReportToCertificateRows(retatrutideBlackTopReport)}
              className="w-full max-w-md lg:max-w-lg"
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

        <HeroTrustCards cards={heroTrustCards} />
      </div>
    </section>
  );
}
