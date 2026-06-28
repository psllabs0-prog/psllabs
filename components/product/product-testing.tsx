import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { SectionShell } from "./section-shell";

export function ProductTesting({ product }: { product: Product }) {
  return (
    <SectionShell
      label="TESTING & QUALITY"
      variant="white"
      width="prose"
    >
      <AnimateIn>
        <p className="mb-10 text-base leading-relaxed text-[var(--color-ink)] md:text-[1.0625rem]">
          {product.testing.description}
        </p>
      </AnimateIn>

      <ul className="mb-10 flex flex-col gap-4">
        {product.testing.highlights.map((item, index) => (
          <li
            key={item}
            className="flex gap-4 text-sm leading-relaxed text-[var(--color-stone)] md:text-base"
          >
            <span
              className="shrink-0 font-[family-name:var(--font-mono)] text-xs text-petrol"
              aria-hidden
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            {item}
          </li>
        ))}
      </ul>

      <AnimateIn delay={0.2}>
        <button
          type="button"
          className="rounded-md border border-linen bg-paper px-6 py-3.5 text-sm font-medium text-petrol transition-opacity duration-200 ease-out hover:opacity-70"
        >
          Download COA (placeholder)
        </button>
      </AnimateIn>
    </SectionShell>
  );
}
