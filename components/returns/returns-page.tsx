import Link from "next/link";

import { AnimateIn } from "@/components/product/animate-in";
import { PillButton } from "@/components/ui/pill-button";
import { returnsPageContent } from "@/lib/content/returns";
import { cn } from "@/lib/utils";

const cardClass =
  "rounded-2xl border border-linen bg-lab-white p-6 shadow-[0_2px_16px_rgba(26,77,109,0.06)] md:p-8";

function renderWithEmail(text: string) {
  const parts = text.split(/(support@psllabs\.org)/g);
  return parts.map((part, index) =>
    part === "support@psllabs.org" ? (
      <Link
        key={index}
        href="mailto:support@psllabs.org"
        className="text-petrol underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-80"
      >
        support@psllabs.org
      </Link>
    ) : (
      part
    )
  );
}

export function ReturnsPage() {
  const content = returnsPageContent;

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-[960px] px-6 py-20 md:px-16 md:py-28 lg:px-24 lg:py-32">
        <div className="flex flex-col gap-16 md:gap-20 lg:gap-24">
          {/* Hero */}
          <header className="flex flex-col gap-6 md:gap-8">
            <AnimateIn>
              <p className="mono text-biotech-deep/80">{content.eyebrow}</p>
            </AnimateIn>
            <AnimateIn delay={0.06}>
              <h1 className="font-display text-display-lg font-bold text-ink">
                {content.title}
              </h1>
            </AnimateIn>
            <AnimateIn delay={0.1}>
              <span className="inline-flex w-fit rounded-pill border border-biotech-blue/20 bg-biotech-mist/50 px-4 py-1.5 font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider text-biotech-deep">
                {content.badge}
              </span>
            </AnimateIn>
            <AnimateIn delay={0.14}>
              <p className="max-w-2xl text-body-lg leading-relaxed text-ash">
                {content.subtitle}
              </p>
            </AnimateIn>
          </header>

          {/* Protection policy */}
          <AnimateIn delay={0.08}>
            <section className={cn(cardClass, "flex flex-col gap-4")}>
              <h2 className="font-display text-xl font-bold text-ink md:text-2xl">
                {content.protectionPolicy.title}
              </h2>
              <p className="text-base leading-[1.7] text-ash md:text-body-lg">
                {content.protectionPolicy.body}
              </p>
            </section>
          </AnimateIn>

          {/* How returns work */}
          <section className="flex flex-col gap-8 md:gap-10">
            <AnimateIn>
              <h2 className="font-display text-display-md font-bold text-ink">
                How Returns Work
              </h2>
            </AnimateIn>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
              {content.steps.map((step, index) => (
                <AnimateIn key={step.step} delay={0.06 + index * 0.05}>
                  <article className={cn(cardClass, "flex h-full flex-col gap-5")}>
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-biotech-pale bg-biotech-mist/60 font-[family-name:var(--font-mono)] text-sm text-biotech-deep">
                      {step.step}
                    </div>
                    <div className="flex flex-col gap-3">
                      <h3 className="font-display text-lg font-bold text-ink">
                        {step.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-ash md:text-base">
                        {renderWithEmail(step.body)}
                      </p>
                    </div>
                  </article>
                </AnimateIn>
              ))}
            </div>
          </section>

          {/* Eligible / Not eligible */}
          <section className="flex flex-col gap-8 md:gap-10">
            <AnimateIn>
              <h2 className="font-display text-display-md font-bold text-ink">
                Eligibility
              </h2>
            </AnimateIn>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
              <AnimateIn delay={0.06}>
                <article className={cn(cardClass, "flex flex-col gap-5")}>
                  <h3 className="font-display text-lg font-bold text-ink">
                    Eligible for Review
                  </h3>
                  <ul className="flex flex-col gap-3">
                    {content.eligible.map((item) => (
                      <li
                        key={item}
                        className="flex gap-3 text-sm leading-relaxed text-ash md:text-base"
                      >
                        <span
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-biotech-blue"
                          aria-hidden
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              </AnimateIn>
              <AnimateIn delay={0.1}>
                <article className={cn(cardClass, "flex flex-col gap-5")}>
                  <h3 className="font-display text-lg font-bold text-ink">
                    Not Eligible
                  </h3>
                  <ul className="flex flex-col gap-3">
                    {content.notEligible.map((item) => (
                      <li
                        key={item}
                        className="flex gap-3 text-sm leading-relaxed text-ash md:text-base"
                      >
                        <span
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-linen"
                          aria-hidden
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              </AnimateIn>
            </div>
          </section>

          {/* Timeline */}
          <section className="flex flex-col gap-8 md:gap-10">
            <AnimateIn>
              <h2 className="font-display text-display-md font-bold text-ink">
                Timeline
              </h2>
            </AnimateIn>
            <AnimateIn delay={0.06}>
              <div className={cn(cardClass, "divide-y divide-linen")}>
                {content.timeline.map((row) => (
                  <div
                    key={row.label}
                    className="flex flex-col gap-2 py-5 first:pt-0 last:pb-0 md:grid md:grid-cols-[minmax(9rem,28%)_1fr] md:gap-8 md:py-6"
                  >
                    <p className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider text-biotech-deep/80">
                      {row.label}
                    </p>
                    <p className="text-sm leading-relaxed text-ash md:text-base">
                      {renderWithEmail(row.body)}
                    </p>
                  </div>
                ))}
              </div>
            </AnimateIn>
          </section>

          {/* Disclaimer */}
          <AnimateIn delay={0.08}>
            <section className="rounded-2xl border border-linen bg-paper/60 p-6 md:p-8">
              <h2 className="font-display text-lg font-bold text-ink">
                Important Disclaimer
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ash md:text-base">
                {content.disclaimer}
              </p>
            </section>
          </AnimateIn>

          {/* CTA */}
          <AnimateIn delay={0.1}>
            <section
              className={cn(
                cardClass,
                "flex flex-col items-center gap-5 text-center md:gap-6"
              )}
            >
              <h2 className="font-display text-xl font-bold text-ink md:text-2xl">
                {content.cta.title}
              </h2>
              <PillButton href={content.cta.buttonHref}>
                {content.cta.buttonLabel}
              </PillButton>
              <p className="max-w-md text-sm leading-relaxed text-ash">
                {content.cta.note}
              </p>
            </section>
          </AnimateIn>
        </div>
      </div>
    </main>
  );
}
