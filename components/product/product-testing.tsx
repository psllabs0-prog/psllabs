import Link from "next/link";

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
        <p className="mb-10 text-base leading-relaxed text-ink md:text-body-lg">
          {product.testing.description}
        </p>
      </AnimateIn>

      <ul className="mb-10 flex flex-col gap-4">
        {product.testing.highlights.map((item, index) => (
          <li
            key={item}
            className="flex gap-4 text-sm leading-relaxed text-ash md:text-base"
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
        <Link
          href="/testing"
          className="inline-flex rounded-pill border border-linen bg-paper px-6 py-3.5 text-sm font-medium text-petrol transition-colors duration-200 ease-out hover:bg-biotech-mist/40"
        >
          View testing standards
        </Link>
      </AnimateIn>
    </SectionShell>
  );
}
