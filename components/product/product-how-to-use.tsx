import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { SectionShell } from "./section-shell";

export function ProductHowToUse({ product }: { product: Product }) {
  return (
    <SectionShell
      label="DOCUMENTATION"
      title="Review before laboratory use."
      variant="white"
      width="content"
    >
      <ol className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-5">
        {product.howToUse.map((step, index) => (
          <li key={step.step} className="list-none">
            <AnimateIn delay={index * 0.08}>
              <div className="premium-card flex h-full flex-col gap-4 p-5 md:p-6">
                <span className="font-[family-name:var(--font-mono)] text-sm text-primary-blue">
                  {String(step.step).padStart(2, "0")}
                </span>
                <h3 className="font-[family-name:var(--font-display)] text-xl text-ink md:text-2xl">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-ash md:text-base">
                  {step.description}
                </p>
              </div>
            </AnimateIn>
          </li>
        ))}
      </ol>
    </SectionShell>
  );
}
