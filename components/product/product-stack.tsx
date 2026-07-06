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
      variant="soft"
      width="content"
    >
      <AnimateIn>
        <p className="mb-8 max-w-[60ch] text-base leading-relaxed text-ash">
          {product.stackBlurb}
        </p>
      </AnimateIn>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {others.map((other, index) => (
          <AnimateIn key={other.handle} delay={index * 0.08}>
            <Link
              href={`/products/${other.handle}`}
              className="premium-card premium-card-hover group flex flex-col gap-4 p-6 md:p-7"
            >
              <p className="mono text-ash">{other.tag}</p>
              <h3 className="font-[family-name:var(--font-display)] text-2xl text-ink">
                {other.name}
              </h3>
              <p className="text-sm leading-relaxed text-ash">
                {other.shortDescription}
              </p>
              <p className="font-[family-name:var(--font-mono)] text-xs text-ash">
                {other.stackRole}
              </p>
              <span className="text-sm text-primary-blue underline underline-offset-4 transition-opacity duration-200 ease-out group-hover:opacity-70">
                Learn more →
              </span>
            </Link>
          </AnimateIn>
        ))}
      </div>
    </SectionShell>
  );
}
