import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { SectionShell } from "./section-shell";

export function ProductHowToUse({ product }: { product: Product }) {
  return (
    <SectionShell
      label="HOW TO USE"
      title="Three steps. One protocol."
      variant="paper"
      width="content"
    >
      <ol className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-0">
        {product.howToUse.map((step, index) => (
          <li
            key={step.step}
            className={`list-none md:px-10 ${
              index > 0 ? "md:border-l md:border-[var(--color-sage)]" : "md:pl-0"
            }`}
          >
            <AnimateIn delay={index * 0.08} className="flex flex-col gap-5">
              <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-brass)]">
                {String(step.step).padStart(2, "0")}
              </span>
              <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)] md:text-2xl">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-stone)] md:text-base">
                {step.description}
              </p>
            </AnimateIn>
          </li>
        ))}
      </ol>
    </SectionShell>
  );
}
