/**
 * The complete allowlist of text the draft assistant may see. Nothing else in
 * the repository, ops-knowledge, old chats, customer messages, or order data
 * is ever read. Evidence sources may be cited by posts; guidance sources are
 * rules only and can never be cited. Changing this list or any listed file
 * requires regenerating `source-snapshot.ts` (`npm run x-drafts:snapshot`),
 * which shows the exact text change in review.
 */
export type XDraftSourceKind = "evidence" | "guidance";

export type XDraftSourceSelect =
  | { type: "mdx-article"; file: string }
  | { type: "guide-meta"; slug: string }
  | { type: "constant"; module: "lib/content/testing-scope.ts"; name: "TESTING_SCOPE_STATEMENT" }
  | { type: "md-sections"; file: string; headings: readonly string[] };

export type XDraftSourceSpec = {
  id: string;
  kind: XDraftSourceKind;
  /** Public page a post may link to; null when the source has no linkable page. */
  url: string | null;
  select: XDraftSourceSelect;
  /** Why this source is on the list (for the owner's review). */
  basis: string;
};

const SITE = "https://www.psllabs.org";

const PUBLISHED_ARTICLE = "Published PSL documentation-education article (content/science).";
const PUBLISHED_GUIDE = "Published PSL analytical guide; title and description only (guide bodies are page components, not included).";

export const X_DRAFT_SOURCE_ALLOWLIST: readonly XDraftSourceSpec[] = [
  {
    id: "science:how-to-read-a-coa",
    kind: "evidence",
    url: `${SITE}/science/how-to-read-a-coa`,
    select: { type: "mdx-article", file: "content/science/how-to-read-a-coa.mdx" },
    basis: PUBLISHED_ARTICLE,
  },
  {
    id: "science:third-party-testing-explained",
    kind: "evidence",
    url: `${SITE}/science/third-party-testing-explained`,
    select: { type: "mdx-article", file: "content/science/third-party-testing-explained.mdx" },
    basis: PUBLISHED_ARTICLE,
  },
  ...[
    "peptide-identity-vs-purity-vs-content",
    "verify-peptide-laboratory-report",
    "peptide-purity-vs-content",
    "batch-specific-vs-generic-coa",
    "what-peptide-testing-can-establish",
    "verify-peptide-coa",
    "peptide-purity-percentages",
  ].map(
    (slug): XDraftSourceSpec => ({
      id: `guide:${slug}`,
      kind: "evidence",
      url: `${SITE}/guides/${slug}`,
      select: { type: "guide-meta", slug },
      basis: PUBLISHED_GUIDE,
    })
  ),
  {
    id: "statement:testing-scope",
    kind: "evidence",
    url: null,
    select: { type: "constant", module: "lib/content/testing-scope.ts", name: "TESTING_SCOPE_STATEMENT" },
    basis: "Canonical public testing-scope statement (claims-rules: Testing-scope claim limit).",
  },
  {
    id: "guidance:claims-rules",
    kind: "guidance",
    url: null,
    select: {
      type: "md-sections",
      file: "ops-knowledge/compliance/claims-rules.md",
      headings: ["Research-use / FDA framing (live)", "Testing-scope claim limit (live)"],
    },
    basis: "Approved claims guidance, live sections only (the legacy structure/function list is excluded).",
  },
  {
    id: "guidance:prohibited-content",
    kind: "guidance",
    url: null,
    select: {
      type: "md-sections",
      file: "ops-knowledge/compliance/prohibited-content.md",
      headings: ["Never in public / agent / support replies (live)", "Unsafe marketing claims listed in `claims.md`"],
    },
    basis: "Approved prohibited-content guidance (public-output rules only).",
  },
];

export type XDraftSource = {
  id: string;
  kind: XDraftSourceKind;
  title: string;
  url: string | null;
  origin: string;
  text: string;
};
