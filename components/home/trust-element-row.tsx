import { TrustElement } from "@/components/ui/trust-element";
import { HomeSection } from "@/components/ui/home-section";
import type { TrustElementData } from "@/lib/home/homepage";

type TrustElementRowProps = {
  items: TrustElementData[];
};

export function TrustElementRow({ items }: TrustElementRowProps) {
  return (
    <HomeSection background="paper" size="default">
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-8 md:grid-cols-4 md:gap-6">
        {items.map((item) => (
          <TrustElement key={item.label} icon={item.icon} label={item.label} />
        ))}
      </div>
    </HomeSection>
  );
}
