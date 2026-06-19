import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { CitationEntry } from "./citation-entry";
import { SectionShell } from "./section-shell";

export function ProductResearch({ product }: { product: Product }) {
  return (
    <SectionShell
      label="RESEARCH"
      title="Selected references."
      variant="white"
      width="prose"
    >
      <AnimateIn>
        <ul>
          {product.citations.map((citation) => (
            <CitationEntry key={citation.title} citation={citation} />
          ))}
        </ul>
      </AnimateIn>
    </SectionShell>
  );
}
