import type { ProductCitation } from "@/lib/products";

export function CitationEntry({ citation }: { citation: ProductCitation }) {
  const detail = [citation.volume, citation.pages].filter(Boolean).join(": ");

  return (
    <li className="border-b border-[var(--color-sage)] py-6 last:border-b-0">
      <p className="text-[0.95rem] leading-relaxed text-[var(--color-ink)] md:text-base">
        <span className="font-medium">{citation.authors}</span> {citation.title}.{" "}
        <em>{citation.journal}</em>
        {detail ? `. ${detail}` : ""}. ({citation.year}).
      </p>
    </li>
  );
}
