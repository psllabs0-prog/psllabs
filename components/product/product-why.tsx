import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { SectionShell } from "./section-shell";

export function ProductWhy({ product }: { product: Product }) {
  return (
    <SectionShell label="WHY THIS EXISTS" width="prose" variant="white">
      <AnimateIn>
        <div className="premium-card p-6 md:p-7">
          <p className="font-[family-name:var(--font-display)] text-[clamp(1.375rem,2.5vw,1.75rem)] leading-[1.6] text-ink">
            {product.whyThisExists}
          </p>
        </div>
      </AnimateIn>
    </SectionShell>
  );
}
