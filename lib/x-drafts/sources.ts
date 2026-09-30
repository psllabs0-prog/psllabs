/**
 * The complete allowlist of text the draft assistant may see. Nothing else in
 * the repository, ops-knowledge, old chats, customer messages, or order data
 * is ever read. Evidence sources may be cited by posts; guidance sources are
 * rules only and can never be cited. Changing this list or any listed file
 * requires regenerating `source-snapshot.ts` (`npm run x-drafts:snapshot`),
 * which shows the exact text change in review.
 */
export type XDraftSourceKind = "evidence" | "guidance";

/**
 * A verbatim passage from an article body. `heading` is the `## ` section it
 * must appear in (null = the introduction before the first section). The
 * builder refuses any passage that is not found word-for-word in that section.
 */
export type XDraftPassage = { heading: string | null; text: string };

export type XDraftSourceSelect =
  | { type: "mdx-passages"; file: string; passages: readonly XDraftPassage[] }
  | { type: "constant"; module: "lib/content/testing-scope.ts"; name: "TESTING_SCOPE_STATEMENT" }
  | { type: "md-sections"; file: string; headings: readonly string[] };

/** Marks omitted article text between (or after) selected passages. */
export const X_DRAFT_OMISSION_MARKER = "[…]";

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

const PUBLISHED_PASSAGES =
  "Selected verbatim documentation-workflow passages from a published PSL article (content/science): locating the report, " +
  "checking identifiers, opening the original document, laboratory verification where available, reading only what the " +
  "report documents, and tested-sample scope. Historical batch names, task numbers, numerical examples, and " +
  "compound-specific passages are excluded.";

export const X_DRAFT_SOURCE_ALLOWLIST: readonly XDraftSourceSpec[] = [
  {
    id: "science:how-to-read-a-coa",
    kind: "evidence",
    url: `${SITE}/science/how-to-read-a-coa`,
    select: {
      type: "mdx-passages",
      file: "content/science/how-to-read-a-coa.mdx",
      passages: [
        {
          heading: null,
          text:
            "A Certificate of Analysis (COA) is an original laboratory report for a **specific sample and batch**. " +
            "It is not a marketing summary. Results apply only to the tested sample identified in that report.",
        },
        {
          heading: "Locate the lot number",
          text: [
            "1. Find the lot or batch identifier on your vial label or packaging.",
            "2. On psllabs.org, open the product page for your material or go to **COA / Batch Lookup** (`/coa`).",
            "3. Match your label identifier to a published report. If no report is listed for your lot, contact support@psllabs.org with your lot number.",
          ].join("\n"),
        },
        {
          heading: "Open the original report",
          text: [
            "Published PSL reports are linked from:",
            "",
            "- The product page under **Testing & Quality**",
            "- **COA / Batch Lookup** (`/coa`)",
            "- The **Testing** section when a report is available",
            "",
            "Open the linked image or PDF—the **original laboratory report**, not a retyped summary.",
          ].join("\n"),
        },
        { heading: "Read the fields on the report", text: "Review only the fields that appear on **your** report." },
        {
          heading: "Read the fields on the report",
          text: "Do not assume a field is present unless it appears on the original report you are reviewing.",
        },
        {
          heading: "Scope of results",
          text: [
            "Laboratory results apply **only** to the tested sample and batch named in that report. They do not apply to other lots, future batches, or materials you have not received.",
            "",
            "Testing scope and results are shown on each original laboratory report. PSL does not add tests or results beyond what the laboratory documented on that report.",
          ].join("\n"),
        },
      ],
    },
    basis: PUBLISHED_PASSAGES,
  },
  {
    id: "science:third-party-testing-explained",
    kind: "evidence",
    url: `${SITE}/science/third-party-testing-explained`,
    select: {
      type: "mdx-passages",
      file: "content/science/third-party-testing-explained.mdx",
      passages: [
        {
          heading: null,
          text:
            "Published PSL batch documentation is the **original third-party laboratory report** for a specific " +
            "sample—not a pass/fail badge or in-house summary.",
        },
        {
          heading: "What “original report” means",
          text: [
            "- Issued by a laboratory independent of PSL",
            "- Tied to a named batch, task number, and sample",
            "- Shown as the laboratory's document (image or PDF), linked from PSL pages",
            "",
            "In-house or supplier-only paperwork is not the same as a published third-party report.",
          ].join("\n"),
        },
        {
          heading: "Find your report on PSL",
          text: [
            "1. Note the lot or batch on your vial label.",
            "2. Visit the product page or **COA / Batch Lookup** (`/coa`).",
            "3. Search by task number or batch name when lookup is available.",
            "4. Open the linked report and confirm the batch and task number match your label.",
            "",
            "If no report is published for your lot, contact support@psllabs.org.",
          ].join("\n"),
        },
        {
          heading: "Verify with the testing laboratory",
          text: [
            "When the report includes a verification URL or key (Janoshik reports include a verification key on the document):",
            "",
            "1. Open the original report from PSL.",
            "2. Follow the laboratory's verification instructions on that report.",
            "3. Enter the key exactly as printed on the **original** document.",
            "",
            "Verification confirms the report file matches the laboratory's records. It does not extend results to other lots.",
          ].join("\n"),
        },
        {
          heading: "What to record",
          text:
            "Testing scope and results are shown on each original laboratory report. Review the report itself for " +
            "the complete scope of testing performed.",
        },
        {
          heading: "Results apply only to the tested batch",
          text:
            "A report documents one tested sample. It does not describe other lots, future production, or materials " +
            "not identified in that report.",
        },
      ],
    },
    basis: PUBLISHED_PASSAGES,
  },
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
