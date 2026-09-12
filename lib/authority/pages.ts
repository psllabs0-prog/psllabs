import { ANALYTICAL_GUIDES } from "@/lib/content/guides-data";

export type KnownSitePage = {
  path: string;
  title: string;
  kind: "guide" | "marketing" | "utility";
  keywords: string[];
};

/** Conservative inventory of known public routes for opportunity matching. */
export function getKnownSitePages(): KnownSitePage[] {
  const guides: KnownSitePage[] = ANALYTICAL_GUIDES.map((g) => ({
    path: `/guides/${g.slug}`,
    title: g.title,
    kind: "guide" as const,
    keywords: [
      g.slug.replace(/-/g, " "),
      g.shortTitle.toLowerCase(),
      ...g.title.toLowerCase().split(/\s+/).slice(0, 8),
    ],
  }));

  const staticPages: KnownSitePage[] = [
    {
      path: "/",
      title: "PSL Labs home",
      kind: "marketing",
      keywords: ["psl labs", "research peptides", "coa"],
    },
    {
      path: "/coa",
      title: "Certificates of Analysis",
      kind: "utility",
      keywords: ["coa", "certificate of analysis", "batch", "lab report"],
    },
    {
      path: "/guides",
      title: "Analytical guides",
      kind: "marketing",
      keywords: ["guides", "analytical", "testing", "purity"],
    },
    {
      path: "/faq",
      title: "FAQ",
      kind: "utility",
      keywords: ["faq", "questions"],
    },
    {
      path: "/about",
      title: "About",
      kind: "marketing",
      keywords: ["about", "psl labs"],
    },
    {
      path: "/disclaimer",
      title: "Disclaimer",
      kind: "utility",
      keywords: ["disclaimer", "research use only"],
    },
  ];

  return [...guides, ...staticPages];
}

export function findMatchingKnownPage(
  query: string,
  pagePath?: string | null
): KnownSitePage | null {
  const pages = getKnownSitePages();
  if (pagePath) {
    const normalized = pagePath.replace(/^https?:\/\/[^/]+/i, "");
    const hit = pages.find(
      (p) =>
        normalized === p.path ||
        normalized.endsWith(p.path) ||
        normalized.includes(p.path)
    );
    if (hit) return hit;
  }

  const q = query.toLowerCase();
  let best: KnownSitePage | null = null;
  let bestScore = 0;
  for (const p of pages) {
    let score = 0;
    for (const kw of p.keywords) {
      if (kw.length >= 4 && q.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 2 ? best : null;
}

/**
 * Conservative internal-link suggestions between known authoritative pages.
 * Recommendations only — never mutates production pages.
 */
export function recommendInternalLinks(sourcePath: string): Array<{
  from: string;
  to: string;
  reason: string;
}> {
  const pairs: Array<{ from: string; to: string; reason: string }> = [
    {
      from: "/guides/verify-peptide-coa",
      to: "/guides/batch-specific-vs-generic-coa",
      reason: "COA verification → batch-specific vs generic COA",
    },
    {
      from: "/guides/verify-peptide-laboratory-report",
      to: "/guides/batch-specific-vs-generic-coa",
      reason: "Lab report verification → lot traceability",
    },
    {
      from: "/guides/peptide-identity-vs-purity-vs-content",
      to: "/guides/peptide-purity-vs-content",
      reason: "Identity/purity/content triad → purity vs content depth",
    },
    {
      from: "/guides/peptide-purity-vs-content",
      to: "/guides/peptide-identity-vs-purity-vs-content",
      reason: "Purity vs content → identity foundations",
    },
    {
      from: "/guides/what-peptide-testing-can-establish",
      to: "/guides/verify-peptide-coa",
      reason: "Testing limitations → COA verification",
    },
    {
      from: "/guides/what-peptide-testing-can-establish",
      to: "/guides/verify-peptide-laboratory-report",
      reason: "Testing limitations → laboratory report verification",
    },
    {
      from: "/coa",
      to: "/guides/verify-peptide-coa",
      reason: "COA hub → verification checklist",
    },
    {
      from: "/guides/peptide-purity-percentages",
      to: "/guides/peptide-purity-vs-content",
      reason: "Purity percentages → purity vs content",
    },
  ];

  return pairs.filter(
    (p) =>
      p.from === sourcePath ||
      sourcePath.endsWith(p.from) ||
      p.to === sourcePath ||
      sourcePath.endsWith(p.to)
  );
}
