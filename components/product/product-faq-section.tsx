import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { ProductFaq } from "./product-faq";
import { SectionShell } from "./section-shell";

export function ProductFaqSection({ product }: { product: Product }) {
  return (
    <SectionShell
      label="FAQ"
      title="Common questions."
      variant="ice"
      width="prose"
    >
      <AnimateIn>
        <ProductFaq faqs={product.faqs} />
      </AnimateIn>
    </SectionShell>
  );
}
