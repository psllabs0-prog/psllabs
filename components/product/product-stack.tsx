import Link from "next/link";

import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { SectionShell } from "./section-shell";

export function ProductStack({
  product,
  others,
}: {
  product: Product;
  others: Product[];
}) {
  return (
    <SectionShell
      label="RELATED MATERIALS"
      variant="paper"
      width="content"
    >
      <AnimateIn>
        <p className="mb-12 max-w-[60ch] text-base leading-relaxed text-[var(--color-stone)]">
          {product.stackBlurb}
        </p>
      </AnimateIn>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {others.map((other, index) => (
          <AnimateIn key={other.handle} delay={index * 0.08}>
            <Link
              href={`/products/${other.handle}`}
              className="group flex flex-col gap-5 border border-[var(--color-sage)] bg-[var(--color-lab-white)] p-8 transition-transform duration-200 ease-out hover:-translate-y-1 md:p-10"
            >
              <p className="mono text-[var(--color-stone)]">{other.tag}</p>
              <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
                {other.name}
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-stone)]">
                {other.shortDescription}
              </p>
              <p className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-stone)]">
                {other.stackRole}
              </p>
              <span className="text-sm text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out group-hover:opacity-70">
                Learn more →
              </span>
            </Link>
          </AnimateIn>
        ))}
      </div>
    </SectionShell>
  );
}
