import type { Product } from "@/lib/products";
import type { ProductAvailability } from "@/lib/inventory/availability";

import { MobileStickyCart } from "./mobile-sticky-cart";
import { ProductDisclaimer } from "./product-disclaimer";
import { ProductFaqSection } from "./product-faq-section";
import { ProductHero } from "./product-hero";
import { ProductHowToUse } from "./product-how-to-use";
import { ProductIngredients } from "./product-ingredients";
import { ProductQuantityProvider } from "./product-quantity-provider";
import { ProductResearch } from "./product-research";
import { ProductStack } from "./product-stack";
import { ProductTesting } from "./product-testing";
import { ProductWhy } from "./product-why";

type ProductTemplateProps = {
  product: Product;
  otherProducts: Product[];
  availability: ProductAvailability;
};

export function ProductTemplate({
  product,
  otherProducts,
  availability,
}: ProductTemplateProps) {
  return (
    <ProductQuantityProvider unitPrice={product.price}>
      <main className="bg-[var(--color-paper)] pb-28 lg:pb-0">
        <ProductHero product={product} availability={availability} />
        <ProductTesting product={product} />
        <ProductIngredients product={product} />
        <ProductFaqSection product={product} />
        <ProductWhy product={product} />
        <ProductHowToUse product={product} />
        <ProductResearch product={product} />
        <ProductStack product={product} others={otherProducts} />
        {product.researchDisclaimer ? (
          <ProductDisclaimer>{product.researchDisclaimer}</ProductDisclaimer>
        ) : (
          <ProductDisclaimer />
        )}
        <MobileStickyCart
          productHandle={product.handle}
          productName={product.name}
          stockStatus={availability.status}
          availability={availability}
        />
      </main>
    </ProductQuantityProvider>
  );
}
