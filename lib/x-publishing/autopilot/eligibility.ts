import { X_DRAFT_SOURCE_SNAPSHOT } from "@/lib/x-drafts/source-snapshot";
import type { XDraftSource } from "@/lib/x-drafts/sources";
import { similarity, validateCandidates } from "@/lib/x-drafts/validate";

import { X_ACCOUNT_ID } from "../constants";
import { checkPostText, X_CONTENT_POLICY_VERSION } from "../content";
import { canonicalJson, sha256Hex, textHash } from "../hash";

import { X_AUTOPILOT_LIBRARY, X_AUTOPILOT_LIBRARY_ID, type XAutopilotTemplate } from "./library";
import { X_AUTOPILOT_POLICY, X_AUTOPILOT_POLICY_HASH } from "./policy";

/** Wording that implies a statement about current stock or a specific new batch. */
const CURRENT_BATCH_RE =
  /\b(current|latest|newest|new|today'?s|recent|fresh)\s+(batch|batches|lot|lots|stock|production|run|report|reports|coa|coas)\b|\bin[- ]stock\b|\bjust\s+(tested|arrived|landed|released)\b|\brestock\w*\b|\bback\s+in\b/i;

export type XTemplateReview = {
  id: string;
  text: string;
  textHash: string;
  /** Covers the wording, citations, excerpt, context, exceptions, cited source text, and content-policy version. */
  hash: string;
  sources: Array<{ id: string; hash: string }>;
  warnings: string[];
  problems: string[];
  eligible: boolean;
  template: XAutopilotTemplate;
};

export type XLibraryReview = {
  libraryId: string;
  /** Changes whenever the policy or any template hash changes. */
  version: string;
  policyHash: string;
  templates: XTemplateReview[];
  eligibleCount: number;
};

function sourceHashes(t: XAutopilotTemplate, sources: readonly XDraftSource[]) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return t.sourceIds.map((id) => ({ id, hash: byId.has(id) ? sha256Hex(byId.get(id)!.text) : "missing" }));
}

export function templateHash(t: XAutopilotTemplate, sources: readonly XDraftSource[] = X_DRAFT_SOURCE_SNAPSHOT): string {
  return sha256Hex(
    canonicalJson({
      v: 1,
      contentPolicy: X_CONTENT_POLICY_VERSION,
      id: t.id,
      text: t.text,
      sourceIds: [...t.sourceIds],
      excerpt: t.excerpt,
      purpose: t.purpose,
      context: t.context,
      acceptedWarnings: t.acceptedWarnings.map((w) => ({ code: w.code, justification: w.justification })),
      sources: sourceHashes(t, sources),
    })
  );
}

/**
 * The same checks the owner's approval and the draft assistant apply, run on
 * the exact library wording. A template is eligible only if every raised
 * warning is a documented exception for that exact template (and every
 * documented exception is still raised). These are heuristics, not a factual
 * or legal review; the owner's review of the library is the authorization.
 */
export function reviewTemplate(t: XAutopilotTemplate, sources: readonly XDraftSource[] = X_DRAFT_SOURCE_SNAPSHOT): XTemplateReview {
  const problems: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(t.id)) problems.push("invalid_id");

  const check = checkPostText(t.text);
  for (const e of check.errors) problems.push(`${e.code}: ${e.message}`);

  const verdict = validateCandidates({
    modelOutput: JSON.stringify({
      candidates: [{ text: t.text, sourceIds: t.sourceIds, excerpt: t.excerpt, purpose: t.purpose }],
    }),
    stopReason: "stop",
    sources,
    existing: [],
    batchId: "autopilot-library-review",
    packetVersion: X_AUTOPILOT_LIBRARY_ID,
    model: "none",
  }).verdicts[0];
  if (!verdict) problems.push("validation_failed: no verdict");
  else {
    for (const r of verdict.blockReasons) if (!problems.includes(r)) problems.push(r);
    if (verdict.text !== null && verdict.text !== t.text) problems.push("not_normalized: stored wording must equal its normalized form");
  }
  const warnings = [...new Set([...check.warnings.map((w) => w.code), ...(verdict?.reviewWarnings ?? [])])];

  if (CURRENT_BATCH_RE.test(t.text)) problems.push("current_batch_claim: documentation posts may not describe current or new stock");

  const accepted = new Set(t.acceptedWarnings.map((w) => w.code));
  for (const w of warnings) if (!accepted.has(w)) problems.push(`unaccepted_warning: ${w}`);
  for (const w of t.acceptedWarnings) {
    if (!warnings.includes(w.code)) problems.push(`stale_exception: ${w.code} is documented but no longer raised`);
    if (w.justification.trim().length < 20) problems.push(`exception_without_justification: ${w.code}`);
  }

  return {
    id: t.id,
    text: t.text,
    textHash: textHash(X_ACCOUNT_ID, t.text),
    hash: templateHash(t, sources),
    sources: sourceHashes(t, sources),
    warnings,
    problems,
    eligible: problems.length === 0,
    template: t,
  };
}

export function reviewLibrary(
  library: readonly XAutopilotTemplate[] = X_AUTOPILOT_LIBRARY,
  sources: readonly XDraftSource[] = X_DRAFT_SOURCE_SNAPSHOT
): XLibraryReview {
  const reviews = library.map((t) => reviewTemplate(t, sources));
  const seenIds = new Set<string>();
  const seenText = new Map<string, string>();
  for (const [i, r] of reviews.entries()) {
    if (seenIds.has(r.id)) r.problems.push("duplicate_id");
    seenIds.add(r.id);
    const sameText = seenText.get(r.textHash);
    if (sameText) r.problems.push(`duplicate_text: identical to ${sameText}`);
    else seenText.set(r.textHash, r.id);
    for (const earlier of reviews.slice(0, i)) {
      const score = similarity(r.text, earlier.text);
      if (score >= X_AUTOPILOT_POLICY.nearDuplicateThreshold) {
        r.problems.push(`near_duplicate: ${earlier.id} (${Math.round(score * 100)}%)`);
      }
    }
    r.eligible = r.problems.length === 0;
  }
  return {
    libraryId: X_AUTOPILOT_LIBRARY_ID,
    version: sha256Hex(
      canonicalJson({ v: 1, libraryId: X_AUTOPILOT_LIBRARY_ID, policyHash: X_AUTOPILOT_POLICY_HASH, templates: reviews.map((r) => ({ id: r.id, hash: r.hash })) })
    ),
    policyHash: X_AUTOPILOT_POLICY_HASH,
    templates: reviews,
    eligibleCount: reviews.filter((r) => r.eligible).length,
  };
}

let cached: XLibraryReview | null = null;

/** The committed library reviewed against the committed source snapshot (pure; computed once). */
export function currentLibraryReview(): XLibraryReview {
  cached ??= reviewLibrary();
  return cached;
}
