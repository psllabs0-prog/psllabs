import twitterText from "twitter-text";

import { products } from "@/lib/products";
import { X_LIMITS } from "@/lib/x-publishing/constants";
import { checkPostText } from "@/lib/x-publishing/content";
import { prepareDraft, type PreparedDraft } from "@/lib/x-publishing/admin-store";

import { X_DRAFT_AI_LABEL, X_DRAFT_LIMITS } from "./constants";
import { X_DRAFT_OMISSION_MARKER, type XDraftSource } from "./sources";

export type ExistingPost = { id: string; text: string; textHash: string };

export type CandidateVerdict = {
  /** 1-based position in the model output. */
  item: number;
  text: string | null;
  sourceIds: string[];
  blockReasons: string[];
  reviewWarnings: string[];
  purpose: string | null;
  excerpt: { sourceId: string; quote: string } | null;
  prepared: PreparedDraft | null;
};

export type ValidationResult = { parseError: string | null; candidateCount: number; verdicts: CandidateVerdict[] };

type Input = {
  modelOutput: string;
  stopReason: string | null;
  sources: readonly XDraftSource[];
  existing: ExistingPost[];
  batchId: string;
  packetVersion: string;
  model: string;
};

/**
 * Checks model output against the allowlisted evidence and the existing
 * content rules. These are heuristics: a matched excerpt shows only that the
 * quoted words appear in the cited source, and passing the checks does not
 * establish that a post is accurate or legally compliant — it only keeps
 * clearly unsupported or restricted text out of the queue and flags the rest
 * for the owner.
 */
export function validateCandidates(input: Input): ValidationResult {
  const parsed = parseOutput(input.modelOutput, input.stopReason);
  if (!parsed.ok) return { parseError: parsed.error, candidateCount: 0, verdicts: [] };

  const byId = new Map(input.sources.map((s) => [s.id, s]));
  const accepted: Array<{ item: number; text: string; textHash: string }> = [];
  const verdicts = parsed.candidates.map((raw, i) => {
    const item = i + 1;
    if (i >= X_DRAFT_LIMITS.maxCandidates) {
      return blocked(item, raw, [`over_limit: only the first ${X_DRAFT_LIMITS.maxCandidates} candidates are considered`]);
    }
    const v = checkCandidate(item, raw, byId, input, accepted);
    if (v.blockReasons.length === 0 && v.prepared) {
      accepted.push({ item, text: v.prepared.text, textHash: v.prepared.textHash });
    }
    return v;
  });
  return { parseError: null, candidateCount: parsed.candidates.length, verdicts };
}

function parseOutput(output: string, stopReason: string | null): { ok: true; candidates: unknown[] } | { ok: false; error: string } {
  const truncated = stopReason === "max_tokens" ? " The model stopped at its token limit, so the output is probably truncated." : "";
  const trimmed = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: `Model output contained no JSON object.${truncated}` };
  let value: unknown;
  try {
    value = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return { ok: false, error: `Model output was not valid JSON.${truncated}` };
  }
  const candidates = (value as { candidates?: unknown } | null)?.candidates;
  if (!Array.isArray(candidates)) return { ok: false, error: "Model output had no candidates array." };
  return { ok: true, candidates };
}

function blocked(item: number, raw: unknown, reasons: string[]): CandidateVerdict {
  const text = typeof (raw as { text?: unknown } | null)?.text === "string" ? String((raw as { text: string }).text).slice(0, 600) : null;
  return { item, text, sourceIds: [], blockReasons: reasons, reviewWarnings: [], purpose: null, excerpt: null, prepared: null };
}

/** Formatting-insensitive form used to confirm an excerpt is verbatim source text. */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[*`]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

const ENGAGEMENT_BAIT_RE =
  /\b(like|retweet|repost|share|follow|comment|reply|tag|bookmark|rt)\s+(this|if|below|us|a friend|someone|for|now)\b|\b(giveaway|smash that|drop a|who else|link in bio)\b|\b(thoughts|agree|am i right)\s*\?|\bdm\s+(us|me)\b/i;

const TESTIMONIAL_RE =
  /\btestimonials?\b|\b(customers?|clients?|buyers?|users?)\s+(say|said|love|loves|report|reported|tell|told|swear|rave|prefer|keep|trust|choose)\b|\b(most|many|all)\s+(of\s+)?(our\s+)?(customers|researchers|buyers|clients)\b|\b(five|5)[- ]stars?\b|\b(trusted|chosen|loved)\s+by\b|\bthousands\s+of\b|\bbest[- ]?sell(ing|er)\b|\bmost\s+popular\b|\beveryone\s+(is|uses|loves)\b/i;

const PROMOTION_RE = /\b(discount|promo(tion)?\s*code|coupon|sale|% off|limited time|act now|last chance|buy now|order now|shop now)\b/i;

/** Credentials and capabilities that must appear verbatim in the cited evidence to be mentioned. */
const RESTRICTED_TERMS: Array<{ code: string; re: RegExp }> = [
  { code: "credential", re: /\b(ISO\s*(\/\s*IEC\s*)?\d{3,5}|accredit\w*|certified|certification|GMP|cGMP|CLIA|licensed|PhD|board[- ]certified|peer[- ]reviewed|USP|pharmaceutical[- ]grade|FDA[- ](approved|registered|cleared|inspected))\b/ },
  { code: "credential", re: /\b(scientists?|chemists?|pharmacists?|doctors?|physicians?)\b/ },
  { code: "testing_capability", re: /\b(HPLC|UPLC|LC-?MS|GC-?MS|mass\s+spec\w*|NMR|endotoxins?|steril\w+|heavy\s+metals?|microbial|bacterial|residual\s+solvents?|amino\s+acid\s+analysis|TFA)\b/ },
];

const PSL_TESTING_CLAIM_RE = /\b(we|PSL)\s+(test|tests|tested|testing|certif\w*|verif(y|ies|ied)|analy[sz]e[sd]?)\b|\bin[- ]house\s+(testing|lab\w*)\b|\bour\s+(own\s+)?(lab|laboratory|scientists|chemists|testing)\b/i;

const LAB_NAMES = ["Janoshik"];
const PRODUCT_NAMES = Object.values(products).map((p) => p.name);

function wordPresent(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9])`).test(text);
}

const STOPWORDS = new Set(
  "the and for are but not you your with that this from have has was were will can its it's our their they them what which when where who how why all any each only into onto over than then there these those about also just more most other some such very a an of to in on at by or is as be".split(" ")
);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  );
}

export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" ? v.normalize("NFC").trim().slice(0, max) : null;
}

function checkCandidate(
  item: number,
  raw: unknown,
  byId: Map<string, XDraftSource>,
  input: Input,
  accepted: Array<{ item: number; text: string; textHash: string }>
): CandidateVerdict {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return blocked(item, raw, ["malformed: candidate is not an object"]);
  const c = raw as Record<string, unknown>;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (typeof c.text !== "string" || c.text.trim() === "") return blocked(item, raw, ["malformed: text is missing"]);

  const rawIds = Array.isArray(c.sourceIds) ? c.sourceIds : [];
  const sourceIds = [...new Set(rawIds.filter((x): x is string => typeof x === "string").map((x) => x.trim()))];
  if (sourceIds.length === 0 || rawIds.length !== sourceIds.length) reasons.push("malformed: sourceIds must be a non-empty list of distinct strings");
  if (sourceIds.length > X_DRAFT_LIMITS.maxSourceIdsPerCandidate) reasons.push(`too_many_sources: at most ${X_DRAFT_LIMITS.maxSourceIdsPerCandidate}`);
  const unknown = sourceIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) reasons.push(`unrecognized_source: ${unknown.slice(0, 3).map((u) => u.slice(0, 60)).join(", ")}`);
  const guidanceCited = sourceIds.filter((id) => byId.get(id)?.kind === "guidance");
  if (guidanceCited.length > 0) reasons.push(`guidance_not_evidence: ${guidanceCited.join(", ")} cannot be cited`);
  const evidence = sourceIds.map((id) => byId.get(id)).filter((s): s is XDraftSource => s?.kind === "evidence");
  if (evidence.length === 0) reasons.push("no_evidence_source: cite at least one allowlisted evidence source");

  const excerptRaw = c.excerpt as Record<string, unknown> | undefined;
  const exSource = str(excerptRaw?.sourceId, 100);
  const exQuote = str(excerptRaw?.quote, 2000);
  let excerpt: CandidateVerdict["excerpt"] = null;
  if (!exSource || !exQuote) {
    reasons.push("missing_excerpt: excerpt.sourceId and excerpt.quote are required");
  } else {
    excerpt = { sourceId: exSource, quote: exQuote.slice(0, X_DRAFT_LIMITS.maxExcerptChars) };
    const src = byId.get(exSource);
    if (!sourceIds.includes(exSource) || src?.kind !== "evidence") {
      reasons.push("excerpt_source_not_cited: excerpt must come from a cited evidence source");
    } else if (exQuote.length < X_DRAFT_LIMITS.minExcerptChars || exQuote.length > X_DRAFT_LIMITS.maxExcerptChars) {
      reasons.push(`excerpt_length: excerpt must be ${X_DRAFT_LIMITS.minExcerptChars}-${X_DRAFT_LIMITS.maxExcerptChars} characters`);
    } else if (exQuote.includes(X_DRAFT_OMISSION_MARKER) || exQuote.includes("[...]")) {
      reasons.push("excerpt_spans_omission: quote must not cross omitted source text");
    } else if (!normalizeForMatch(src.text).includes(normalizeForMatch(exQuote))) {
      reasons.push(`excerpt_not_found: quote is not verbatim text from ${exSource}`);
    }
  }

  const purpose = str(c.purpose, 400);
  if (!purpose || purpose.length < X_DRAFT_LIMITS.minPurposeChars) reasons.push("missing_purpose: state the reader question");
  const purposeText = purpose ? purpose.slice(0, X_DRAFT_LIMITS.maxPurposeChars) : null;

  const modelWarnings = (Array.isArray(c.warnings) ? c.warnings : [])
    .filter((w): w is string => typeof w === "string" && w.trim() !== "")
    .slice(0, X_DRAFT_LIMITS.maxModelWarnings)
    .map((w) => `model: ${w.trim().slice(0, X_DRAFT_LIMITS.maxModelWarningChars)}`);

  const prepared = prepareDraft(c.text, []);
  if (!prepared.ok) return { ...blocked(item, raw, [...reasons, `invalid_text: ${prepared.error}`]), sourceIds };
  const text = prepared.value.text;

  const check = checkPostText(text);
  for (const e of check.errors) reasons.push(`${e.code}: ${e.message}`);
  for (const w of check.warnings) warnings.push(w.code);

  const evidenceText = evidence.map((s) => s.text).join("\n");
  const evidenceNumbers = new Set(evidenceText.match(NUMBER_RE) ?? []);
  const unsupportedNumbers = [...new Set(text.replace(/https?:\/\/\S+/g, " ").match(NUMBER_RE) ?? [])].filter((n) => !evidenceNumbers.has(n));
  if (unsupportedNumbers.length > 0) reasons.push(`unsupported_number: ${unsupportedNumbers.slice(0, 5).join(", ")} not found in the cited evidence`);
  else if ((text.replace(/https?:\/\/\S+/g, " ").match(NUMBER_RE) ?? []).length > 0) warnings.push("contains_number: confirm every value against the cited source");

  const citedUrls = new Set(evidence.map((s) => s.url?.replace(/\/$/, "")).filter(Boolean));
  for (const link of check.links) {
    if (!citedUrls.has(link.replace(/\/$/, ""))) reasons.push(`link_not_cited_source: ${link.slice(0, 120)}`);
  }

  if (ENGAGEMENT_BAIT_RE.test(text)) reasons.push("engagement_bait: calls to like/repost/follow/comment/tag or similar are not allowed");
  if (TESTIMONIAL_RE.test(text)) reasons.push("testimonial_or_customer_claim: no testimonials or claims about customer behavior");
  if (PROMOTION_RE.test(text)) reasons.push("promotional_language: sales or discount language is not allowed in educational drafts");
  if (PSL_TESTING_CLAIM_RE.test(text)) reasons.push("unsupported_testing_claim: PSL publishes independent laboratory reports; it does not test or certify");
  const evidenceLower = normalizeForMatch(evidenceText).toLowerCase();
  for (const rule of RESTRICTED_TERMS) {
    for (const m of text.matchAll(new RegExp(rule.re.source, "gi"))) {
      if (!evidenceLower.includes(normalizeForMatch(m[0]).toLowerCase())) {
        reasons.push(`unsupported_${rule.code}: "${m[0]}" does not appear in the cited evidence`);
      }
    }
  }

  const hashtags = twitterText.extractHashtags(text);
  if (hashtags.length > 0) warnings.push(`hashtag: ${hashtags.slice(0, 3).join(", ")}`);
  const namedProducts = PRODUCT_NAMES.filter((name) => wordPresent(text, name));
  const unsupportedProducts = namedProducts.filter((name) => !wordPresent(evidenceText, name));
  if (unsupportedProducts.length > 0) {
    reasons.push(`unsupported_product_reference: ${unsupportedProducts.join(", ")} not named in the cited evidence`);
  } else if (namedProducts.length > 0) {
    warnings.push(`names_product_or_compound: ${namedProducts.join(", ")}`);
  }
  const namedLabs = LAB_NAMES.filter((name) => wordPresent(text, name));
  if (namedLabs.length > 0) warnings.push(`names_laboratory: ${namedLabs.join(", ")}`);

  const th = prepared.value.textHash;
  const exactExisting = input.existing.find((p) => p.textHash === th);
  if (exactExisting) reasons.push(`duplicate_existing: identical to queue ${exactExisting.id}`);
  const exactInBatch = accepted.find((a) => a.textHash === th);
  if (exactInBatch) reasons.push(`duplicate_in_batch: identical to item ${exactInBatch.item}`);
  if (!exactExisting && !exactInBatch) {
    const near = [
      ...input.existing.map((p) => ({ label: `queue ${p.id}`, text: p.text })),
      ...accepted.map((a) => ({ label: `item ${a.item}`, text: a.text })),
    ]
      .map((p) => ({ ...p, score: similarity(text, p.text) }))
      .filter((p) => p.score >= X_DRAFT_LIMITS.nearDuplicateThreshold)
      .sort((a, b) => b.score - a.score);
    if (near.length > 0) warnings.push(`near_duplicate: ${near.slice(0, 2).map((n) => `${n.label} (${Math.round(n.score * 100)}%)`).join(", ")}`);
  }

  const reviewWarnings = [...warnings, ...modelWarnings];
  if (reasons.length > 0) {
    return { item, text, sourceIds, blockReasons: reasons, reviewWarnings, purpose: purposeText, excerpt, prepared: null };
  }

  const refs = provenanceRefs({
    batchId: input.batchId,
    item,
    packetVersion: input.packetVersion,
    model: input.model,
    purpose: purposeText!,
    evidence,
    excerpt: excerpt!,
    reviewWarnings,
  });
  const withRefs = prepareDraft(text, refs);
  if (!withRefs.ok) return { item, text, sourceIds, blockReasons: [`invalid_refs: ${withRefs.error}`], reviewWarnings, purpose: purposeText, excerpt, prepared: null };
  return { item, text, sourceIds, blockReasons: [], reviewWarnings, purpose: purposeText, excerpt, prepared: withRefs.value };
}

function clip(value: string): string {
  const max = X_LIMITS.maxSourceRefLength;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Stored as the draft's source_refs (internal, shown in /admin-social, never posted). */
export function provenanceRefs(p: {
  batchId: string;
  item: number;
  packetVersion: string;
  model: string;
  purpose: string;
  evidence: XDraftSource[];
  excerpt: { sourceId: string; quote: string };
  reviewWarnings: string[];
}): string[] {
  return [
    clip(`${X_DRAFT_AI_LABEL} Batch ${p.batchId} item ${p.item}; packet ${p.packetVersion.slice(0, 12)}; model ${p.model}.`),
    clip(`Purpose: ${p.purpose}`),
    clip(`Sources: ${p.evidence.map((s) => (s.url ? `${s.id} (${s.url})` : `${s.id} (${s.origin})`)).join("; ")}`),
    clip(`Excerpt [${p.excerpt.sourceId}]: "${p.excerpt.quote}"`),
    clip(
      `Review warnings (automated heuristics, not a factual or legal review): ${
        p.reviewWarnings.length > 0 ? p.reviewWarnings.join("; ") : "none raised"
      }`
    ),
  ];
}
