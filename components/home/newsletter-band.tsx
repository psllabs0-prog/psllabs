import { HomeSection } from "@/components/ui/home-section";
import type { newsletterCopy } from "@/lib/home/homepage";

type NewsletterBandProps = {
  copy: typeof newsletterCopy;
};

export function NewsletterBand({ copy }: NewsletterBandProps) {
  return (
    <HomeSection background="warm" size="default">
      <div className="mx-auto flex max-w-[720px] flex-col items-center gap-8 text-center">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-display-md font-bold text-ink">
            {copy.heading}
          </h2>
          <p className="text-body-lg text-ash">{copy.description}</p>
        </div>

        <div
          className="flex w-full flex-col gap-3 sm:flex-row sm:items-center"
          role="group"
          aria-label="Newsletter signup"
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
            className="min-w-0 flex-1 rounded-pill border border-linen bg-lab-white px-5 py-3.5 text-sm text-ink placeholder:text-ash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol"
          />
          <button
            type="button"
            className="shrink-0 rounded-pill bg-ink px-6 py-3.5 text-sm font-medium text-lab-white transition-opacity duration-200 ease-out hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol"
          >
            {copy.buttonLabel}
          </button>
        </div>
      </div>
    </HomeSection>
  );
}
