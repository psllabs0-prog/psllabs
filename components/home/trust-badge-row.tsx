import { TrustBadge } from "@/components/ui/trust-badge";
import { HomeSection } from "@/components/ui/home-section";
import type { TrustBadgeData } from "@/lib/home/homepage";

type TrustBadgeRowProps = {
  badges: TrustBadgeData[];
};

export function TrustBadgeRow({ badges }: TrustBadgeRowProps) {
  return (
    <HomeSection background="paper" size="default">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
        {badges.map((badge) => (
          <TrustBadge key={badge.title} {...badge} />
        ))}
      </div>
    </HomeSection>
  );
}
