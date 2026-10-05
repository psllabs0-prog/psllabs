import { WhyChooseCard } from "@/components/ui/why-choose-card";
import { HomeSection } from "@/components/ui/home-section";
import type { WhyChooseCardData } from "@/lib/home/homepage";

type WhyChooseSectionProps = {
  cards: WhyChooseCardData[];
};

export function WhyChooseSection({ cards }: WhyChooseSectionProps) {
  return (
    <HomeSection background="soft" size="default" className="pt-12 md:pt-16 lg:pt-20">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-10 max-w-2xl md:mb-12">
          <p className="mono text-accent">BUYING FROM PSL LABS</p>
          <h2 className="mt-3 font-display text-display-lg font-bold text-ink">
            Know what you’re ordering.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ash">
            Batch reports you can open, shipping details you can check, and support when you need it.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {cards.map((card) => (
            <WhyChooseCard key={card.title} {...card} />
          ))}
        </div>
      </div>
    </HomeSection>
  );
}
