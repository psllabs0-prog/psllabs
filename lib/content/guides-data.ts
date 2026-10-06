export type GuideCategory =
  | "analytical-foundations"
  | "verification-traceability"
  | "handling-stability";

export type GuideMeta = {
  slug: string;
  title: string;
  seoTitle?: string;
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
    seoTitle: "Peptide Identity, Purity and Content Explained",
    title:
      "Peptide Identity vs Purity vs Content: What Each Analytical Result Actually Tells You",
    shortTitle: "Identity vs Purity vs Content",
    description:
      "Identity, purity, and content answer three different questions. Learn what each result means and how to read them together on a lab report.",
    category: "analytical-foundations",
    categoryLabel: "Foundations",
    readTime: "9 min read",
    publishedDate: "2026-09-08",
    modifiedDate: "2026-10-05",
    order: 1,
    featured: true,
  },
  {
    slug: "verify-peptide-laboratory-report",
    seoTitle: "Verify a Peptide Lab Report: Batch Checklist",
    title:
      "How to Verify a Peptide Lab Report: A Practical Batch Checklist",
    shortTitle: "Verify a Laboratory Report",
    description:
      "Check a report with the issuing lab, match the batch to your order, and save a useful research record. Includes a published Tesamorelin report example.",
    category: "verification-traceability",
    categoryLabel: "Verification & Traceability",
    readTime: "8 min read",
    publishedDate: "2026-09-08",
    modifiedDate: "2026-10-05",
    order: 2,
    featured: true,
  },
  {
    slug: "peptide-purity-vs-content",
    title:
      "What Does 99% Peptide Purity Mean? Purity vs Amount",
    shortTitle: "What 99% Purity Means",
    description:
      "Read purity, milligrams, and concentration as separate results, with published GHK-Cu, Tesamorelin, and solution report examples.",
    category: "analytical-foundations",
    categoryLabel: "Foundations",
    readTime: "8 min read",
    publishedDate: "2026-09-08",
    modifiedDate: "2026-10-05",
    order: 3,
    featured: true,
  },
  {
    slug: "batch-specific-vs-generic-coa",
    seoTitle: "Batch-Specific COAs and Lot Traceability",
    title:
      "Batch-Specific COAs vs Generic COAs: Why Lot Traceability Matters",
    shortTitle: "Batch-Specific vs Generic COAs",
    description:
      "How a real batch lab report differs from a generic spec sheet, and why the lot number links your vial to the test data.",
    category: "verification-traceability",
    categoryLabel: "Verification & Traceability",
    readTime: "7 min read",
    publishedDate: "2026-09-08",
    modifiedDate: "2026-10-06",
    order: 4,
    featured: true,
  },
  {
    slug: "what-peptide-testing-can-establish",
    seoTitle: "What Peptide Testing Can and Cannot Establish",
    title:
      "What Peptide Analytical Testing Can and Cannot Establish",
    shortTitle: "What Testing Can and Cannot Establish",
    description:
      "What standard lab tests can show, what needs a separate test, and what a chemical report alone cannot prove.",
    category: "analytical-foundations",
    categoryLabel: "Foundations",
    readTime: "10 min read",
    publishedDate: "2026-09-08",
    modifiedDate: "2026-10-06",
    order: 5,
    featured: true,
  },
  {
    slug: "verify-peptide-coa",
    seoTitle: "Peptide COA Checklist: Fields and Warning Signs",
    title: "How to Verify a Peptide Certificate of Analysis",
    shortTitle: "COA Verification Checklist",
    description:
      "Check the fields on a peptide COA: laboratory, lot number, methods, reported results and verification details. Know which gaps need clarification.",
    category: "verification-traceability",
    categoryLabel: "Verification & Traceability",
    readTime: "7 min read",
    publishedDate: "2026-07-29",
    modifiedDate: "2026-10-05",
    order: 6,
  },
  {
    slug: "peptide-purity-percentages",
    seoTitle: "HPLC Purity Percentages: Reading a Chromatogram",
    title: "Peptide Purity Percentages: What Do They Actually Mean?",
    shortTitle: "Purity Percentages Explained",
    description:
      "Read HPLC peak area percentages, chromatograms and method limits. Learn what the remaining signal represents and why purity is not a milligram amount.",
    category: "analytical-foundations",
    categoryLabel: "Foundations",
    readTime: "6 min read",
    publishedDate: "2026-07-29",
    modifiedDate: "2026-10-05",
    order: 7,
  },
  {
    slug: "peptide-storage-stability",
    title: "Lyophilized Peptide Storage and Stability Guide",
    shortTitle: "Storage & Stability",
    description:
      "Review temperature, moisture, light and handling considerations for freeze-dried laboratory peptides. Check supplier-specific storage and stability records.",
    category: "handling-stability",
    categoryLabel: "Handling & Stability",
    readTime: "6 min read",
    publishedDate: "2026-07-29",
    modifiedDate: "2026-10-05",
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
