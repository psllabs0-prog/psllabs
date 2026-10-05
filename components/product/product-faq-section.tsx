import type { Product } from "@/lib/products";

import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { ProductFaq } from "./product-faq";
import { SectionShell } from "./section-shell";

export function ProductFaqSection({ product }: { product: Product }) {
  return (
    <SectionShell
      label="FAQ"
      title="Questions before you order?"
      variant="ice"
      width="prose"
    >
      <ScrollReveal>
        <ProductFaq faqs={product.faqs} />
      </ScrollReveal>
    </SectionShell>
  );
}
