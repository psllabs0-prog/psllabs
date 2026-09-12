/**
 * Query-specific Search Console → search_demand themes.
 * Never infer themes from aggregate non-brand impressions.
 */

import type { CiTheme } from "./taxonomy";

export type SearchDemandTheme =
  | "coa_findability"
  | "analytical_education";

const COA_TERMS = [
  "coa",
  "certificate of analysis",
  "lab report",
  "laboratory report",
  "batch report",
  "batch verification",
  "lot verification",
  "verify report",
  "janoshik",
] as const;

const ANALYTICAL_TERMS = [
  "purity",
  "identity",
  "peptide content",
  "content",
  "assay",
  "hplc",
  "mass spectrometry",
  "analytical testing",
  "third party testing",
  "third-party testing",
] as const;

export function getCustomerIntelSearchMinImpressions(): number {
  const raw = process.env.CUSTOMER_INTEL_SEARCH_MIN_IMPRESSIONS?.trim();
  if (!raw) return 40;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 40;
}

function queryMatchesTerm(query: string, term: string): boolean {
  if (term.includes(" ")) return query.includes(term);
  // Short tokens: word-boundary match (avoid "coa" in "coating", etc.)
  const re = new RegExp(`(?:^|[^a-z0-9])${term}(?:[^a-z0-9]|$)`, "i");
  return re.test(query);
}

/** Map a single Search Console query to an allowed search-demand theme, or null. */
export function classifySearchDemandQuery(
  query: string | null | undefined
): SearchDemandTheme | null {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return null;

  for (const term of COA_TERMS) {
    if (queryMatchesTerm(q, term)) return "coa_findability";
  }
  for (const term of ANALYTICAL_TERMS) {
    if (queryMatchesTerm(q, term)) return "analytical_education";
  }
  return null;
}

export function searchDemandThemeToCiTheme(theme: SearchDemandTheme): CiTheme {
  return theme;
}

export type SearchQueryAgg = {
  query: string;
  isBrand: boolean;
  impressions: number;
  clicks: number;
};

/**
 * Aggregate impressions by search-demand theme from actual queries.
 * Branded queries excluded. Unrelated non-brand traffic ignored.
 */
export function aggregateSearchDemandByTheme(
  rows: SearchQueryAgg[]
): Array<{
  theme: SearchDemandTheme;
  impressions: number;
  clicks: number;
  matchingQueries: string[];
}> {
  const map = new Map<
    SearchDemandTheme,
    { impressions: number; clicks: number; matchingQueries: string[] }
  >();

  for (const row of rows) {
    if (row.isBrand) continue;
    const theme = classifySearchDemandQuery(row.query);
    if (!theme) continue;
    const cur = map.get(theme) ?? {
      impressions: 0,
      clicks: 0,
      matchingQueries: [],
    };
    cur.impressions += Number(row.impressions) || 0;
    cur.clicks += Number(row.clicks) || 0;
    if (
      cur.matchingQueries.length < 8 &&
      !cur.matchingQueries.includes(row.query)
    ) {
      cur.matchingQueries.push(row.query);
    }
    map.set(theme, cur);
  }

  return [...map.entries()].map(([theme, v]) => ({ theme, ...v }));
}
