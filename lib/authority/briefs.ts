import {
  claimsNotToMake,
  claimsReviewBanner,
  type AuthorityRiskLevel,
} from "./guardrails";
import { findMatchingKnownPage, recommendInternalLinks } from "./pages";
import type { DetectedOpportunity } from "./detect";

export type ContentBriefJson = {
  searchPurpose: string;
  readerQuestion: string;
  mainThesis: string;
  evidenceRequired: string[];
  claimsThatMustNotBeMade: string[];
  detailedOutline: string[];
  suggestedFiguresTables: string[];
  faqs: string[];
  internalLinks: Array<{ path: string; reason: string }>;
  appropriateCta: string;
  counselBanner: string | null;
  notes: string[];
};

/**
 * Deterministic, evidence-backed brief — no external LLM.
 * Missing facts are labeled EVIDENCE REQUIRED BEFORE DRAFTING.
 */
export function generateDeterministicBrief(input: {
  opportunity: {
    type: string;
    primaryQuery: string;
    page: string;
    intent: string;
    riskLevel: AuthorityRiskLevel;
    evidence: Record<string, unknown>;
    existingPagePath?: string | null;
  };
}): {
  title: string;
  slugOrTargetPage: string;
  riskLevel: AuthorityRiskLevel;
  claimsReviewRequired: boolean;
  brief: ContentBriefJson;
} {
  const o = input.opportunity;
  const known =
    findMatchingKnownPage(o.primaryQuery, o.page) ??
    (o.existingPagePath
      ? findMatchingKnownPage("", o.existingPagePath)
      : null);
  const target =
    known?.path ??
    (o.page
      ? o.page.replace(/^https?:\/\/[^/]+/i, "")
      : `/guides/EVIDENCE-REQUIRED-${slugify(o.primaryQuery).slice(0, 40)}`);

  const linkRecs = recommendInternalLinks(target).map((l) => ({
    path: l.from === target || target.endsWith(l.from) ? l.to : l.from,
    reason: l.reason,
  }));

  const evidenceRequired = [
    "Confirm Search Console evidence window and query/page pairing before drafting",
    "Confirm any lab method or capability claims against current PSL documentation",
    "Confirm batch/COA examples are real and authorized for public use",
  ];
  if (!known) {
    evidenceRequired.push(
      "EVIDENCE REQUIRED BEFORE DRAFTING: no existing matching page — validate need vs update/expand strategy"
    );
  } else {
    evidenceRequired.push(
      `Prefer update/expand/optimize of existing page ${known.path} rather than duplicate creation`
    );
  }
  if (!(o.evidence.impressions || o.evidence.queries)) {
    evidenceRequired.push(
      "EVIDENCE REQUIRED BEFORE DRAFTING: attach Search Console impression/click/position evidence"
    );
  }

  const title = known
    ? `Optimize: ${known.title}`
    : `Brief: ${o.primaryQuery || o.type}`;

  const brief: ContentBriefJson = {
    searchPurpose: `Help researchers evaluate ${o.primaryQuery || "analytical documentation"} with verification-oriented clarity.`,
    readerQuestion:
      o.primaryQuery ||
      "EVIDENCE REQUIRED BEFORE DRAFTING: primary reader question not yet locked",
    mainThesis: known
      ? `Strengthen the existing authoritative page (${known.path}) for the observed query intent (${o.intent}).`
      : "EVIDENCE REQUIRED BEFORE DRAFTING: main thesis depends on confirmed page strategy and approved analytical positioning.",
    evidenceRequired,
    claimsThatMustNotBeMade: [...claimsNotToMake()],
    detailedOutline: known
      ? [
          "Audit current page against Search Console queries",
          "Clarify analytical definitions without expanding into human-use guidance",
          "Add verification steps / limitations where evidence supports",
          "Improve internal links to related authority pages",
          "Update FAQ only with documented facts",
        ]
      : [
          "EVIDENCE REQUIRED BEFORE DRAFTING: outline after opportunity approval and page inventory check",
          "Define analytical scope and verification steps",
          "State what testing can and cannot establish",
          "Add RUO framing without using it to justify risky claims",
        ],
    suggestedFiguresTables: [
      "Comparison table only if backed by documented definitions (identity / purity / content)",
      "Verification checklist only if consistent with existing COA guides",
      "EVIDENCE REQUIRED BEFORE DRAFTING: do not invent studies or lab capabilities",
    ],
    faqs: [
      "What does this result establish? (definitional)",
      "How do I verify the report against the lab source?",
      "EVIDENCE REQUIRED BEFORE DRAFTING: additional FAQs only from real support/search evidence",
    ],
    internalLinks: linkRecs,
    appropriateCta:
      "Point to COA/verification resources or analytical guides — never dosing/administration CTAs.",
    counselBanner: claimsReviewBanner(o.riskLevel),
    notes: [
      `Opportunity type: ${o.type}`,
      `Intent: ${o.intent}`,
      `Risk: ${o.riskLevel}`,
      "This brief does not publish content automatically.",
      "Do not fabricate studies, search volume, lab capabilities, or customer behavior.",
    ],
  };

  return {
    title,
    slugOrTargetPage: target,
    riskLevel: o.riskLevel,
    claimsReviewRequired: o.riskLevel !== "LOW",
    brief,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatBriefForExport(input: {
  title: string;
  slugOrTargetPage: string;
  riskLevel: string;
  claimsReviewRequired: boolean;
  brief: ContentBriefJson;
}): { json: string; text: string } {
  const json = JSON.stringify(input, null, 2);
  const b = input.brief;
  const text = [
    `TITLE: ${input.title}`,
    `TARGET: ${input.slugOrTargetPage}`,
    `RISK: ${input.riskLevel}`,
    `CLAIMS_REVIEW_REQUIRED: ${input.claimsReviewRequired}`,
    b.counselBanner ? `BANNER: ${b.counselBanner}` : null,
    "",
    "SEARCH PURPOSE",
    b.searchPurpose,
    "",
    "READER QUESTION",
    b.readerQuestion,
    "",
    "MAIN THESIS",
    b.mainThesis,
    "",
    "EVIDENCE REQUIRED",
    ...b.evidenceRequired.map((x) => `- ${x}`),
    "",
    "CLAIMS THAT MUST NOT BE MADE",
    ...b.claimsThatMustNotBeMade.map((x) => `- ${x}`),
    "",
    "OUTLINE",
    ...b.detailedOutline.map((x, i) => `${i + 1}. ${x}`),
    "",
    "FIGURES / TABLES",
    ...b.suggestedFiguresTables.map((x) => `- ${x}`),
    "",
    "FAQs",
    ...b.faqs.map((x) => `- ${x}`),
    "",
    "INTERNAL LINKS (recommendations only)",
    ...b.internalLinks.map((x) => `- ${x.path}: ${x.reason}`),
    "",
    "CTA",
    b.appropriateCta,
    "",
    "NOTES",
    ...b.notes.map((x) => `- ${x}`),
  ]
    .filter((line) => line != null)
    .join("\n");
  return { json, text };
}

export function briefFromDetected(op: DetectedOpportunity) {
  return generateDeterministicBrief({
    opportunity: {
      type: op.type,
      primaryQuery: op.primaryQuery,
      page: op.page,
      intent: op.intent,
      riskLevel: op.riskLevel,
      evidence: op.evidence,
      existingPagePath: op.existingPagePath,
    },
  });
}
