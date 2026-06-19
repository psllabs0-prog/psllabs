import type { Product } from "@/lib/products";

import { MobileStickyCart } from "./mobile-sticky-cart";
import { ProductDisclaimer } from "./product-disclaimer";
import { ProductFaqSection } from "./product-faq-section";
import { ProductHero } from "./product-hero";
import { ProductHowToUse } from "./product-how-to-use";
import { ProductIngredients } from "./product-ingredients";
import { ProductResearch } from "./product-research";
import { ProductStack } from "./product-stack";
import { ProductTesting } from "./product-testing";
import { ProductWhy } from "./product-why";

type ProductTemplateProps = {
  product: Product;
  otherProducts: Product[];
};

export function ProductTemplate({
  product,
  otherProducts,
}: ProductTemplateProps) {
  return (
    <main className="bg-[var(--color-paper)] pb-28 lg:pb-0">
      <ProductHero product={product} />
      <ProductWhy product={product} />
      <ProductIngredients product={product} />
      <ProductStack product={product} others={otherProducts} />
      <ProductTesting product={product} />
      <ProductHowToUse product={product} />
      <ProductResearch product={product} />
      <ProductFaqSection product={product} />
      <ProductDisclaimer />
      <MobileStickyCart
        productHandle={product.handle}
        price={product.price}
        productName={product.name}
      />
    </main>
  );
}
