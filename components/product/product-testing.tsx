import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { SectionShell } from "./section-shell";

const TESTING_STATEMENT =
  "Every batch is verified by an independent third-party laboratory before release. Full panel details appear on the lot-specific COA.";

export function ProductTesting({ product: _product }: { product: Product }) {
  return (
    <SectionShell
      label="TESTING & QUALITY"
      variant="soft"
      width="prose"
    >
      <AnimateIn>
        <div className="premium-card p-6 md:p-7">
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="badge-verified">Third-party tested</span>
            <span className="badge-accent">COA published</span>
          </div>
          <p className="text-base leading-[1.7] text-ash md:text-body-lg">
            {TESTING_STATEMENT}
          </p>
        </div>
      </AnimateIn>
    </SectionShell>
  );
}
