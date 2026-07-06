import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { SectionShell } from "./section-shell";

const TESTING_STATEMENT =
  "Every batch is verified by an independent third-party laboratory before release. Full panel details appear on the lot-specific COA.";

export function ProductTesting({ product: _product }: { product: Product }) {
  return (
    <SectionShell
      label="TESTING & QUALITY"
      variant="white"
      width="prose"
    >
      <AnimateIn>
        <div className="rounded-2xl border border-linen bg-lab-white p-6 shadow-[0_2px_16px_rgba(26,77,109,0.06)] md:p-8">
          <p className="text-base leading-[1.7] text-ash md:text-body-lg">
            {TESTING_STATEMENT}
          </p>
        </div>
      </AnimateIn>
    </SectionShell>
  );
}
