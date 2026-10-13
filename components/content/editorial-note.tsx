import Link from "next/link";

import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";

/** A supplier byline, not a claim of laboratory or medical credentials. */
export function EditorialNote() {
  return (
    <aside aria-label="About the publisher" className="border-t border-linen pt-6 text-sm leading-relaxed text-ash">
      <h2 className="font-display text-lg font-bold text-ink">About the publisher</h2>
      <p className="mt-3">
        Published by PSL Labs, operated by {LEGAL_ENTITY_NAME}. These supplier-published guides explain
        our documentation and how to read laboratory records. PSL sells the materials discussed;
        this is not an independent product review or a claim of scientific or medical credentials.
      </p>
      <p className="mt-3">
        The issuing laboratory is the source of each report and its results. General references
        explain methods; they do not certify PSL products. For a correction or an unresolved
        batch question, include the page URL and report number when you contact us.
      </p>
      <p className="mt-3">These guides use AI-assisted editing with published report fields and cited references. Materials are for laboratory research only, not human or animal use.</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/about" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">How PSL Labs works</Link>
        <Link href="/contact" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Documentation questions or corrections</Link>
        <Link href="/disclaimer" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Research-use disclosures</Link>
      </div>
    </aside>
  );
}
