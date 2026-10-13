import { getHeroShowcaseProducts } from "@/lib/home/showcase";
import { getProductRender } from "@/lib/products/renders";
import { HeroVialStage } from "./hero-vial-stage";

export function HeroProductVisual() {
  return <HeroVialStage products={getHeroShowcaseProducts().map(product => ({ ...product, render: getProductRender(product.handle) }))} />;
}
