/** Conservative brand query classification for Search Console. */

export function getSeoBrandTerms(): string[] {
  const raw = process.env.SEO_BRAND_TERMS?.trim() || "psl labs,psllabs,psllabs.org";
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Brand if the query contains a configured brand term.
 * Never treat empty/missing queries or homepage-only rows as branded.
 */
export function isBrandSearchQuery(
  query: string | null | undefined,
  brandTerms: string[] = getSeoBrandTerms()
): boolean {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return false;
  return brandTerms.some((term) => term.length > 0 && q.includes(term));
}
