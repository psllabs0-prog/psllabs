import { HomeSection } from "@/components/ui/home-section";
import type { newsletterCopy } from "@/lib/home/homepage";

type NewsletterBandProps = {
  copy: typeof newsletterCopy;
};

export function NewsletterBand({ copy }: NewsletterBandProps) {
  return (
    <HomeSection background="pale-yellow" size="default">
      <div className="mx-auto flex max-w-[720px] flex-col items-center gap-8 text-center">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] font-bold leading-tight tracking-[-0.02em] text-near-black">
            {copy.heading}
          </h2>
          <p className="text-base leading-relaxed text-slate-muted md:text-lg">
            {copy.description}
          </p>
        </div>

        <div
          className="flex w-full flex-col gap-3 sm:flex-row sm:items-center"
          role="group"
          aria-label="Newsletter signup (placeholder)"
        >
          <label htmlFor="home-newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="home-newsletter-email"
            type="email"
            name="email"
            placeholder={copy.placeholder}
            autoComplete="email"
            className="min-w-0 flex-1 rounded-pill border border-near-black/10 bg-[var(--color-lab-white)] px-5 py-3.5 text-sm text-near-black placeholder:text-slate-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-near-black"
          />
          <button
            type="button"
            className="shrink-0 rounded-pill bg-near-black px-6 py-3.5 text-sm font-medium text-white transition-opacity duration-200 ease-out hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-near-black"
          >
            {copy.buttonLabel}
          </button>
        </div>

        <p className="text-xs text-slate-muted">{copy.disclaimer}</p>
      </div>
    </HomeSection>
  );
}
