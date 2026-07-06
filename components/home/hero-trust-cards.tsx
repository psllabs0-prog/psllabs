import { LabIllustration } from "@/components/illustrations/lab-illustrations";
import type { HeroTrustCardData } from "@/lib/home/homepage";

type HeroTrustCardsProps = {
  cards: HeroTrustCardData[];
};

export function HeroTrustCards({ cards }: HeroTrustCardsProps) {
  return (
    <div className="mx-auto grid w-full max-w-[960px] grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="premium-card premium-card-hover flex items-center gap-4 px-5 py-3.5 md:py-4"
        >
          <div
            className="size-11 shrink-0 overflow-hidden rounded-lg border border-linen bg-soft-blue/60"
            aria-hidden
          >
            <LabIllustration id={card.illustration} />
          </div>
          <p className="font-display text-sm font-bold leading-snug tracking-[-0.02em] text-ink md:text-base">
            {card.title}
          </p>
        </div>
      ))}
    </div>
  );
}
