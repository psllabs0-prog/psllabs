export type GuideCategory =
  | "analytical-foundations"
  | "verification-traceability"
  | "handling-stability";

export type GuideMeta = {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  category: GuideCategory;
  categoryLabel: string;
  readTime: string;
  publishedDate: string;
  modifiedDate: string;
  order: number;
  featured?: boolean;
};

export const ANALYTICAL_GUIDES: GuideMeta[] = [
  {
    slug: "peptide-identity-vs-purity-vs-content",
    title:
      "Peptide Identity vs Purity vs Content: What Each Analytical Result Actually Tells You",
    shortTitle: "Identity vs Purity vs Content",
    description:
      "Identity, purity, and content answer different questions. Learn what each lab result means and how to read them together on a peptide COA.",
    category: "analytical-foundations",
    categoryLabel: "Foundations",
    readTime: "9 min read",
    publishedDate: "2026-09-08",
    modifiedDate: "2026-09-08",
    order: 1,
    featured: true,
  },
  {
    slug: "verify-peptide-laboratory-report",
    title:
      "How to Verify a Peptide Laboratory Report: Batch, Report ID, Test Method & Traceability",
    shortTitle: "Verify a Laboratory Report",
    description:
      "A practical walkthrough for checking task IDs, matching batches, confirming methods, and verifying a peptide lab report on the issuer's site.",
    category: "verification-traceability",
    categoryLabel: "Verification & Traceability",
    readTime: "8 min read",
    publishedDate: "2026-09-08",
    modifiedDate: "2026-09-08",
    order: 2,
    featured: true,
  },
  {
    slug: "peptide-purity-vs-content",
    title:
      "What Does 99% Peptide Purity Actually Mean? HPLC Purity vs Peptide Content",
    shortTitle: "What 99% Purity Means",
    description:
      "What an HPLC '99%' figure actually measures, why the method changes the number, and how purity differs from net peptide content.",
    category: "analytical-foundations",
    categoryLabel: "Foundations",
    readTime: "8 min read",
    publishedDate: "2026-09-08",
    modifiedDate: "2026-09-08",
    order: 3,
    featured: true,
  },
  {
    slug: "batch-specific-vs-generic-coa",
    title:
      "Batch-Specific COAs vs Generic COAs: Why Lot Traceability Matters",
    shortTitle: "Batch-Specific vs Generic COAs",
    description:
      "How batch-specific lab reports differ from generic spec sheets, and why lot numbers are the link between your vial and the data.",
    category: "verification-traceability",
    categoryLabel: "Verification & Traceability",
    readTime: "7 min read",
    publishedDate: "2026-09-08",
    modifiedDate: "2026-09-08",
    order: 4,
    featured: true,
  },
  {
    slug: "what-peptide-testing-can-establish",
    title:
      "What Peptide Analytical Testing Can and Cannot Establish",
    shortTitle: "What Testing Can and Cannot Establish",
    description:
      "What HPLC, mass spectrometry, and mass assays can establish, what needs separate tests, and what chemical paperwork cannot prove.",
    category: "analytical-foundations",
    categoryLabel: "Foundations",
    readTime: "10 min read",
    publishedDate: "2026-09-08",
    modifiedDate: "2026-09-08",
    order: 5,
    featured: true,
  },
  {
    slug: "verify-peptide-coa",
    title: "How to Verify a Peptide Certificate of Analysis",
    shortTitle: "COA Verification Checklist",
    description:
      "A practical checklist for reading third-party laboratory reports, spotting unreliable documents, and confirming results directly with the testing lab.",
    category: "verification-traceability",
    categoryLabel: "Verification & Traceability",
    readTime: "7 min read",
    publishedDate: "2026-07-29",
    modifiedDate: "2026-08-02",
    order: 6,
  },
  {
    slug: "peptide-purity-percentages",
    title: "Peptide Purity Percentages: What Do They Actually Mean?",
    shortTitle: "Purity Percentages Explained",
    description:
      "How to read an HPLC purity number on a research peptide COA: what it counts, what it leaves out, and why small differences matter.",
    category: "analytical-foundations",
    categoryLabel: "Foundations",
    readTime: "6 min read",
    publishedDate: "2026-07-29",
    modifiedDate: "2026-08-02",
    order: 7,
  },
  {
    slug: "peptide-storage-stability",
    title: "Peptide Storage & Stability Guide",
    shortTitle: "Storage & Stability",
    description:
      "How to store lyophilized and reconstituted research peptides to help protect sample integrity.",
    category: "handling-stability",
    categoryLabel: "Handling & Stability",
    readTime: "6 min read",
    publishedDate: "2026-07-29",
    modifiedDate: "2026-08-02",
    order: 8,
  },
];

export function getGuideBySlug(slug: string): GuideMeta | undefined {
  return ANALYTICAL_GUIDES.find((g) => g.slug === slug);
}

export function getRelatedGuides(
  currentSlug: string,
  limit = 3
): GuideMeta[] {
  // Return other guides, prioritizing same category, then others
  const current = getGuideBySlug(currentSlug);
  const others = ANALYTICAL_GUIDES.filter((g) => g.slug !== currentSlug);

  if (!current) return others.slice(0, limit);

  const sameCategory = others.filter((g) => g.category === current.category);
  const differentCategory = others.filter(
    (g) => g.category !== current.category
  );

  return [...sameCategory, ...differentCategory].slice(0, limit);
}
