import { WhyChooseCard } from "@/components/ui/why-choose-card";
import { HomeSection } from "@/components/ui/home-section";
import type { WhyChooseCardData } from "@/lib/home/homepage";

type WhyChooseSectionProps = {
  cards: WhyChooseCardData[];
};

export function WhyChooseSection({ cards }: WhyChooseSectionProps) {
  return (
    <HomeSection background="soft" size="editorial">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-10 max-w-2xl md:mb-12">
          <p className="mono text-ash">WHY PSL LABS</p>
          <h2 className="font-display text-display-lg font-bold text-ink">
            Quality you can verify—not just trust.
          </h2>
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
