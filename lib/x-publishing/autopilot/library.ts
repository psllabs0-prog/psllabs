/**
 * PROPOSED documentation-post library for the standing-policy autopilot.
 *
 * Every entry is the complete public wording. Nothing here is rewritten,
 * extended, or generated at publish time; the server posts `text` exactly.
 * Each entry cites evidence from the draft assistant's narrowed source
 * snapshot (lib/x-drafts/source-snapshot.ts) with a verbatim excerpt, and
 * states the limitation it preserves. An allowlisted source is not by itself
 * an allowed public sentence: only the wording below is.
 *
 * Changing an entry, adding one, or changing a cited source changes that
 * entry's hash; the entry is then ineligible for automatic publication until
 * the owner reviews and authorizes the new library version in /admin-social.
 *
 * `acceptedWarnings` records a narrowly accepted content-check warning for
 * this exact wording (code + justification). It is empty for every entry in
 * this version.
 */
export type XAutopilotTemplate = {
  id: string;
  text: string;
  sourceIds: readonly string[];
  excerpt: { sourceId: string; quote: string };
  purpose: string;
  context: string;
  acceptedWarnings: ReadonlyArray<{ code: string; justification: string }>;
};

const COA = "science:how-to-read-a-coa";
const THIRD = "science:third-party-testing-explained";
const SCOPE = "statement:testing-scope";

export const X_AUTOPILOT_LIBRARY_ID = "psl-x-documentation-library";

export const X_AUTOPILOT_LIBRARY: readonly XAutopilotTemplate[] = [
  {
    id: "doc-01-what-a-coa-is",
    text:
      "A Certificate of Analysis (COA) is an original laboratory report for a specific sample and batch. It is not a marketing summary, and it speaks only for the tested sample it identifies. https://www.psllabs.org/science/how-to-read-a-coa",
    sourceIds: [COA],
    excerpt: {
      sourceId: COA,
      quote: "A Certificate of Analysis (COA) is an original laboratory report for a specific sample and batch. It is not a marketing summary.",
    },
    purpose: "What is a COA, and what does it cover?",
    context: "Keeps the source's limit: the report applies only to the tested sample it identifies.",
    acceptedWarnings: [],
  },
  {
    id: "doc-02-start-with-the-label",
    text:
      "Documentation starts at the vial: find the lot or batch identifier on the label or packaging before opening any report. That identifier is what you match to a published report.",
    sourceIds: [COA],
    excerpt: { sourceId: COA, quote: "Find the lot or batch identifier on your vial label or packaging." },
    purpose: "Where does checking documentation begin?",
    context: "Procedural only; makes no statement about any particular lot.",
    acceptedWarnings: [],
  },
  {
    id: "doc-03-no-report-listed",
    text:
      "If no report is listed for the lot on your label, do not substitute a report for a different lot. Contact PSL support with your lot number instead.",
    sourceIds: [COA],
    excerpt: {
      sourceId: COA,
      quote: "Match your label identifier to a published report. If no report is listed for your lot, contact support@psllabs.org with your lot number.",
    },
    purpose: "What should a reader do when no report is listed for their lot?",
    context: "Preserves that a report documents one lot; no claim that every lot has a report.",
    acceptedWarnings: [],
  },
  {
    id: "doc-04-where-reports-are-linked",
    text:
      "Where PSL reports are linked: the product page under Testing & Quality, the COA / Batch Lookup page, and the Testing section when a report is available.",
    sourceIds: [COA],
    excerpt: { sourceId: COA, quote: "The Testing section when a report is available" },
    purpose: "Where on the PSL site are laboratory reports linked?",
    context: "Keeps 'when a report is available'; does not imply every item has one.",
    acceptedWarnings: [],
  },
  {
    id: "doc-05-open-the-original",
    text:
      "Open the linked image or PDF itself. The document to read is the original laboratory report, not a retyped summary of it.",
    sourceIds: [COA],
    excerpt: { sourceId: COA, quote: "Open the linked image or PDF—the original laboratory report, not a retyped summary." },
    purpose: "Which document should a reader rely on?",
    context: "Directs readers to the laboratory's own document rather than any summary.",
    acceptedWarnings: [],
  },
  {
    id: "doc-06-only-listed-fields",
    text:
      "Read only the fields that actually appear on your report. If a field is not on the original document, do not assume it was documented.",
    sourceIds: [COA],
    excerpt: { sourceId: COA, quote: "Do not assume a field is present unless it appears on the original report you are reviewing." },
    purpose: "How should a reader treat fields that are missing from a report?",
    context: "Limits reading to what the laboratory documented.",
    acceptedWarnings: [],
  },
  {
    id: "doc-07-scope-of-a-report",
    text:
      "Laboratory findings apply only to the tested sample and batch named in the report. They do not carry over to other lots, future batches, or material you have not received.",
    sourceIds: [COA],
    excerpt: {
      sourceId: COA,
      quote: "They do not apply to other lots, future batches, or materials you have not received.",
    },
    purpose: "Does one report describe other lots?",
    context: "States the source's scope limit directly.",
    acceptedWarnings: [],
  },
  {
    id: "doc-08-nothing-added",
    text:
      "PSL does not add tests beyond what the laboratory documented. The scope of testing is whatever appears on each original laboratory report, and nothing more.",
    sourceIds: [COA],
    excerpt: { sourceId: COA, quote: "PSL does not add tests or results beyond what the laboratory documented on that report." },
    purpose: "Does PSL add anything to the laboratory's report?",
    context: "No testing capability is claimed; scope is the laboratory's report.",
    acceptedWarnings: [],
  },
  {
    id: "doc-09-not-a-badge",
    text:
      "Published PSL batch documentation is the original third-party laboratory report for a specific sample. Not a pass/fail badge, and not an in-house summary. https://www.psllabs.org/science/third-party-testing-explained",
    sourceIds: [THIRD],
    excerpt: {
      sourceId: THIRD,
      quote: "Published PSL batch documentation is the original third-party laboratory report for a specific sample—not a pass/fail badge or in-house summary.",
    },
    purpose: "What form does PSL batch documentation take?",
    context: "Describes the document type only; no statement about any batch's findings.",
    acceptedWarnings: [],
  },
  {
    id: "doc-10-what-original-means",
    text:
      "What makes a report original: it is issued by a laboratory independent of PSL, tied to a named batch, task number, and sample, and shown as the laboratory's own document.",
    sourceIds: [THIRD],
    excerpt: { sourceId: THIRD, quote: "Issued by a laboratory independent of PSL" },
    purpose: "What does 'original report' mean?",
    context: "Uses the source's own three criteria without adding credentials.",
    acceptedWarnings: [],
  },
  {
    id: "doc-11-supplier-paperwork",
    text:
      "Supplier-only or in-house paperwork is not the same as a published third-party laboratory report. When reviewing documentation, check which of the two you are looking at.",
    sourceIds: [THIRD],
    excerpt: { sourceId: THIRD, quote: "In-house or supplier-only paperwork is not the same as a published third-party report." },
    purpose: "Is supplier paperwork equivalent to a third-party report?",
    context: "Distinguishes document types; makes no claim about any supplier.",
    acceptedWarnings: [],
  },
  {
    id: "doc-12-confirm-batch-and-task",
    text:
      "Before relying on a report, confirm that the batch and the task number printed on it match the label on your vial. A mismatch means it documents a different sample.",
    sourceIds: [THIRD],
    excerpt: { sourceId: THIRD, quote: "Open the linked report and confirm the batch and task number match your label." },
    purpose: "How does a reader confirm a report belongs to their vial?",
    context: "Preserves that a report documents one identified sample.",
    acceptedWarnings: [],
  },
  {
    id: "doc-13-search-by-task-number",
    text:
      "When lookup is available, a report can be searched by task number or batch name. Search tools only help you find the document; reading the original is still the step that counts.",
    sourceIds: [THIRD],
    excerpt: { sourceId: THIRD, quote: "Search by task number or batch name when lookup is available." },
    purpose: "How can a reader search for a report?",
    context: "Keeps 'when lookup is available'.",
    acceptedWarnings: [],
  },
  {
    id: "doc-14-verification-key",
    text:
      "Some original reports carry a laboratory verification URL or key. To use one, open the original report from PSL and follow the laboratory's own instructions printed on it.",
    sourceIds: [THIRD],
    excerpt: { sourceId: THIRD, quote: "When the report includes a verification URL or key" },
    purpose: "What is a laboratory verification key and how is it used?",
    context: "Keeps 'when the report includes' (not every report has one); names no laboratory.",
    acceptedWarnings: [],
  },
  {
    id: "doc-15-enter-key-exactly",
    text:
      "Enter a verification key exactly as printed on the original document. Copying it from a retyped version is not the same as checking the laboratory's own file.",
    sourceIds: [THIRD],
    excerpt: { sourceId: THIRD, quote: "Enter the key exactly as printed on the original document." },
    purpose: "How should a verification key be entered?",
    context: "Procedural; points back to the original document.",
    acceptedWarnings: [],
  },
  {
    id: "doc-16-what-verification-shows",
    text:
      "What laboratory verification shows: the report file matches the laboratory's records. What it does not do: extend a report's findings to other lots.",
    sourceIds: [THIRD],
    excerpt: {
      sourceId: THIRD,
      quote: "Verification confirms the report file matches the laboratory's records. It does not extend results to other lots.",
    },
    purpose: "What does verification with the laboratory establish?",
    context: "States both what verification establishes and its limit.",
    acceptedWarnings: [],
  },
  {
    id: "doc-17-testing-scope-statement",
    text: "A simple rule for reading any laboratory report: the report only covers the tests shown on the original laboratory file.",
    sourceIds: [SCOPE],
    excerpt: { sourceId: SCOPE, quote: "The report only covers the tests shown on the original laboratory file." },
    purpose: "What does a report cover?",
    context: "The canonical testing-scope statement, quoted.",
    acceptedWarnings: [],
  },
  {
    id: "doc-18-complete-scope",
    text:
      "For the complete scope of testing performed on a sample, review the original report itself. A listing or summary elsewhere is not the full picture.",
    sourceIds: [THIRD],
    excerpt: { sourceId: THIRD, quote: "Review the report itself for the complete scope of testing performed." },
    purpose: "Where is the complete scope of testing shown?",
    context: "Directs readers to the report for scope.",
    acceptedWarnings: [],
  },
  {
    id: "doc-19-image-or-pdf",
    text:
      "Original reports appear as the laboratory's document, an image or PDF linked from PSL pages. If what you are reading was retyped, go back to the linked original.",
    sourceIds: [THIRD],
    excerpt: { sourceId: THIRD, quote: "Shown as the laboratory's document (image or PDF), linked from PSL pages" },
    purpose: "What does an original report look like on PSL pages?",
    context: "Describes format only.",
    acceptedWarnings: [],
  },
  {
    id: "doc-20-checklist",
    text:
      "A short documentation checklist: the identifier on your label, a matching published report, the original laboratory document, and only the fields that appear on it.",
    sourceIds: [COA],
    excerpt: { sourceId: COA, quote: "Review only the fields that appear on your report." },
    purpose: "What are the documentation steps in brief?",
    context: "Summarizes the published workflow without adding steps.",
    acceptedWarnings: [],
  },
  {
    id: "doc-21-one-sample",
    text:
      "One report, one tested sample. A laboratory report says nothing about future production or about material that it does not identify.",
    sourceIds: [THIRD],
    excerpt: {
      sourceId: THIRD,
      quote: "A report documents one tested sample. It does not describe other lots, future production, or materials not identified in that report.",
    },
    purpose: "Can a report describe production that has not happened yet?",
    context: "States the source's scope limit.",
    acceptedWarnings: [],
  },
  {
    id: "doc-22-not-a-marketing-summary",
    text:
      "A COA should be read as the laboratory wrote it. Marketing copy, product descriptions, and summaries are not substitutes for the original laboratory report.",
    sourceIds: [COA],
    excerpt: { sourceId: COA, quote: "It is not a marketing summary." },
    purpose: "How does a COA differ from marketing copy?",
    context: "Contrasts document types; no product is mentioned.",
    acceptedWarnings: [],
  },
];
