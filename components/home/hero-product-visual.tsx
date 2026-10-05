import { HeroShowcaseSelector } from "@/components/home/hero-showcase-selector";
import { getHeroShowcaseProducts } from "@/lib/home/showcase";

export function HeroProductVisual() {
  return <HeroShowcaseSelector products={getHeroShowcaseProducts()} />;
}
