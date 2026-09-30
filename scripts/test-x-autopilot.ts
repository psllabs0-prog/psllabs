/**
 * OFFLINE tests for the standing-policy documentation autopilot: policy
 * identity and hashing, deterministic slots (no catch-up), the proposed
 * library's validity, per-template invalidation on wording or source changes,
 * eligibility/duplicate/exhaustion rules, and the dispatch-time check of a
 * standing-policy post. No database, network, or model calls. The guarded
 * database paths are exercised in test-x-autopilot-db.ts.
 * Run: npm run test:x-autopilot
 */
import twitterText from "twitter-text";

import { X_DRAFT_SOURCE_SNAPSHOT } from "../lib/x-drafts/source-snapshot";
import { similarity } from "../lib/x-drafts/validate";
import { X_ACCOUNT_ID, X_AUTOPILOT_ACTOR, X_LIMITS } from "../lib/x-publishing/constants";
import { X_CONTENT_POLICY_VERSION } from "../lib/x-publishing/content";
import { canonicalJson, sha256Hex } from "../lib/x-publishing/hash";
import type { StandingPolicyApprovalContext, XPostRecord } from "../lib/x-publishing/records";
import { currentLibraryReview, reviewLibrary, reviewTemplate, templateHash } from "../lib/x-publishing/autopilot/eligibility";
import { X_AUTOPILOT_LIBRARY, type XAutopilotTemplate } from "../lib/x-publishing/autopilot/library";
import {
  autopilotSlotKey,
  currentAutopilotSlot,
  upcomingAutopilotSlots,
  X_AUTOPILOT_POLICY,
  X_AUTOPILOT_POLICY_HASH,
  X_AUTOPILOT_POLICY_VERSION,
} from "../lib/x-publishing/autopilot/policy";
import { evaluateTemplates, standingPolicyProblem, standingPolicyRefs } from "../lib/x-publishing/autopilot/store";

let passed = 0;
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
  passed++;
}

/** Phoenix is UTC-7 all year. */
const phx = (local: string) => new Date(`${local}:00.000-07:00`);

function testPolicy() {
  const p = X_AUTOPILOT_POLICY;
  assert(p.accountId === X_ACCOUNT_ID && typeof p.accountId === "string" && p.accountId === "2094368418443280384", "policy account ID is the exact string");
  assert(p.accountHandle === "PSLLabspurity" && p.timeZone === "America/Phoenix", "policy account handle and time zone");
  assert(JSON.stringify(p.windows) === JSON.stringify(["09:00", "17:00"]), "two windows: 09:00 and 17:00");
  assert(p.dailyCreateDispatchCap === 2 && X_LIMITS.createDispatchesPerPhoenixDay === 2, "cap of two shared with the global limit");
  assert(p.postsPerWorkflowRun === 1 && p.publicationWindowMinutes === X_LIMITS.expiryMinutesAfterScheduled, "one post per run; existing short window");
  assert(/^[0-9a-f]{64}$/.test(X_AUTOPILOT_POLICY_HASH) && X_AUTOPILOT_POLICY_VERSION.startsWith(`${p.id}@${p.version}#`), "policy version label carries the hash");
  const changed = sha256Hex(canonicalJson({ v: 1, policy: { ...p, windows: ["09:00", "12:00"] } as unknown as Parameters<typeof canonicalJson>[0] }));
  assert(changed !== X_AUTOPILOT_POLICY_HASH, "any policy change changes the policy hash (re-authorization required)");
}

function testSlots() {
  const s = currentAutopilotSlot(phx("2026-10-01T09:00"));
  assert(s && s.key === "psl-x-documentation-autopilot:2026-10-01T09:00" && s.key === autopilotSlotKey("2026-10-01", "09:00"), "deterministic slot key");
  assert(currentAutopilotSlot(phx("2026-10-01T09:30"))?.key === s.key, "a repeated check inside the window yields the same slot");
  assert(currentAutopilotSlot(phx("2026-10-01T09:59"))?.key === s.key, "window lasts the existing 60 minutes");
  assert(currentAutopilotSlot(phx("2026-10-01T10:00")) === null, "no slot after the window closes (no catch-up)");
  assert(currentAutopilotSlot(phx("2026-10-01T08:59")) === null, "no slot before the window opens");
  assert(currentAutopilotSlot(phx("2026-10-01T16:30")) === null, "missed or future windows are never considered early");
  const e = currentAutopilotSlot(phx("2026-10-01T17:30"));
  assert(e?.key === autopilotSlotKey("2026-10-01", "17:00") && e.day === "2026-10-01", "evening slot belongs to its Phoenix day");
  assert(e.closesAt.getTime() - e.slotAt.getTime() === 60 * 60_000, "slot window closes 60 minutes after the slot");
  const up = upcomingAutopilotSlots(phx("2026-10-01T12:00"), 4).map((x) => x.key);
  assert(
    JSON.stringify(up) ===
      JSON.stringify([
        autopilotSlotKey("2026-10-01", "17:00"),
        autopilotSlotKey("2026-10-02", "09:00"),
        autopilotSlotKey("2026-10-02", "17:00"),
        autopilotSlotKey("2026-10-03", "09:00"),
      ]),
    "upcoming slots in order, today's passed window skipped"
  );
  assert(upcomingAutopilotSlots(phx("2026-10-01T09:15"), 1)[0].key === autopilotSlotKey("2026-10-01", "09:00"), "an open window is listed first");
}

function testLibrary() {
  const review = currentLibraryReview();
  assert(review.templates.length === X_AUTOPILOT_LIBRARY.length && review.templates.length >= 20, "proposed library has at least 20 templates");
  for (const t of review.templates) {
    assert(t.eligible, `${t.id} passes every check: ${t.problems.join("; ")}`);
    assert(t.warnings.length === 0 && t.template.acceptedWarnings.length === 0, `${t.id} raises no warnings and needs no exception`);
    assert(twitterText.parseTweet(t.text).weightedLength <= X_LIMITS.maxWeightedLength, `${t.id} fits X length`);
    assert(!/[@#]|\d/.test(t.text.replace(/https:\/\/\S+/g, "")), `${t.id} has no mentions, hashtags, or numbers`);
    assert(!/\b(we|our|buy|order|shop|dose|dosing|inject|human|safe|results?|purity|pure|potency|batch\s+#)\b/i.test(t.text), `${t.id} avoids promotion, use, outcome, and specific-batch words`);
    assert(t.template.sourceIds.every((id) => X_DRAFT_SOURCE_SNAPSHOT.find((s) => s.id === id)?.kind === "evidence"), `${t.id} cites evidence sources only`);
    assert(t.template.context.length >= 10 && t.template.purpose.length >= 10, `${t.id} records its purpose and preserved limitation`);
  }
  const ids = new Set(review.templates.map((t) => t.id));
  assert(ids.size === review.templates.length, "template IDs are unique");
  let max = 0;
  for (const a of review.templates) for (const b of review.templates) if (a.id < b.id) max = Math.max(max, similarity(a.text, b.text));
  assert(max < X_AUTOPILOT_POLICY.nearDuplicateThreshold, `no two templates are near-duplicates (max ${max.toFixed(2)})`);
  assert(review.eligibleCount === review.templates.length, "every proposed template is eligible for review");
  assert(currentLibraryReview() === review, "library review is computed once (pure)");
  assert(
    review.templates.every((t) => !/\ba mismatch (means|proves)\b/i.test(t.text) && !/task number printed on it match the label/i.test(t.text)),
    "no template assumes a task number on every label or treats a mismatch as proof of a different sample"
  );
  assert(review.templates.every((t) => (t.text.match(/https:\/\/\S+/g) ?? []).every((u) => /^https:\/\/www\.psllabs\.org\/science\//.test(u))), "template links point only to cited source pages");
}

const baseT = X_AUTOPILOT_LIBRARY[0];
const variant = (patch: Partial<XAutopilotTemplate>): XAutopilotTemplate => ({ ...baseT, ...patch });

function testTemplateRules() {
  assert(!reviewTemplate(variant({ text: "Research documentation: dosing guidance is on the report." })).eligible, "prohibited wording never becomes eligible");
  const warned = variant({ text: "Laboratory results apply only to the tested sample and batch named in the report." });
  const wr = reviewTemplate(warned);
  assert(!wr.eligible && wr.problems.some((p) => p.startsWith("unaccepted_warning: claim:body_outcome")), "warnings are not ignored");
  const excepted = reviewTemplate({ ...warned, acceptedWarnings: [{ code: "claim:body_outcome", justification: "Quotes the source's scope sentence about laboratory results verbatim." }] });
  assert(excepted.eligible, "a documented exception applies to that exact template only");
  const stale = reviewTemplate({ ...baseT, acceptedWarnings: [{ code: "claim:body_outcome", justification: "No longer needed for this wording at all." }] });
  assert(!stale.eligible && stale.problems.some((p) => p.startsWith("stale_exception")), "an exception that no longer applies is refused");
  assert(!reviewTemplate(variant({ text: "Our latest batch report is now linked on the product page." })).eligible, "current-batch claims are refused");
  assert(!reviewTemplate(variant({ excerpt: { sourceId: baseT.excerpt.sourceId, quote: "This sentence is not anywhere in the source text." } })).eligible, "excerpt must be verbatim");
  assert(!reviewTemplate(variant({ text: `${baseT.text} https://example.com/page` })).eligible, "links must be cited source URLs");
  assert(!reviewTemplate(variant({ sourceIds: ["guidance:claims-rules"], excerpt: { sourceId: "guidance:claims-rules", quote: "Do not overstate lab methods or results beyond the published report." } })).eligible, "guidance can never be cited");
  assert(!reviewTemplate(variant({ text: "PSL tests every lot in-house before release." })).eligible, "invented testing capability refused");
  const dup = reviewLibrary([baseT, { ...baseT, id: "doc-99-copy" }]);
  assert(!dup.templates[1].eligible && dup.templates[1].problems.some((p) => p.startsWith("duplicate_text")), "duplicate wording inside the library refused");
  const near = reviewLibrary([baseT, { ...baseT, id: "doc-99-near", text: baseT.text.replace("It is not a marketing summary", "It is never a marketing summary") }]);
  assert(!near.templates[1].eligible && near.templates[1].problems.some((p) => p.startsWith("near_duplicate")), "near-duplicate wording inside the library refused");
}

function testHashing() {
  const lib = [...X_AUTOPILOT_LIBRARY];
  const base = reviewLibrary(lib);
  const edited = reviewLibrary(lib.map((t, i) => (i === 3 ? { ...t, context: `${t.context} (edited)` } : t)));
  assert(edited.version !== base.version, "any template change changes the library version");
  assert(edited.templates.filter((t, i) => t.hash !== base.templates[i].hash).length === 1, "only the edited template's hash changes");

  const coa = "science:how-to-read-a-coa";
  const sources = X_DRAFT_SOURCE_SNAPSHOT.map((s) => (s.id === coa ? { ...s, text: `${s.text}\n\nNew paragraph.` } : s));
  const moved = reviewLibrary(lib, sources);
  for (const [i, t] of moved.templates.entries()) {
    const cites = t.template.sourceIds.includes(coa);
    assert((t.hash !== base.templates[i].hash) === cites, `${t.id}: source change invalidates ${cites ? "it" : "nothing"}`);
  }
  assert(templateHash(baseT) === base.templates[0].hash && X_CONTENT_POLICY_VERSION.length > 0, "template hash is stable and bound to the content policy");
}

function authorizationFor(review = currentLibraryReview()) {
  return { policyHash: review.policyHash, templateHashes: Object.fromEntries(review.templates.map((t) => [t.id, t.hash])) };
}

function testEvaluation() {
  const review = currentLibraryReview();
  const first = review.templates[0];
  const second = review.templates[1];
  let states = evaluateTemplates({ review, authorization: null, consumed: new Set(), usedTexts: [] });
  assert(states.every((s) => s.status === "not_authorized"), "nothing is eligible until the owner authorizes (default OFF)");

  const auth = authorizationFor();
  states = evaluateTemplates({ review, authorization: auth, consumed: new Set(), usedTexts: [] });
  assert(states.every((s) => s.status === "eligible"), "authorized library is eligible");
  assert(states.find((s) => s.status === "eligible")?.id === first.id, "selection is deterministic (library order)");

  const partial = { ...auth, templateHashes: { ...auth.templateHashes, [first.id]: "0".repeat(64) } };
  delete (partial.templateHashes as Record<string, string>)[second.id];
  states = evaluateTemplates({ review, authorization: partial, consumed: new Set(), usedTexts: [] });
  assert(states[0].status === "changed_since_authorization" && states[1].status === "not_authorized" && states[2].status === "eligible", "changed or unauthorized templates skip; others stay eligible");

  states = evaluateTemplates({ review, authorization: { ...auth, policyHash: "f".repeat(64) }, consumed: new Set(), usedTexts: [] });
  assert(states.every((s) => s.status === "not_authorized"), "a policy change invalidates the whole authorization");

  states = evaluateTemplates({ review, authorization: auth, consumed: new Set([first.id]), usedTexts: [] });
  assert(states[0].status === "consumed" && states[1].status === "eligible", "a used template is never recycled");

  states = evaluateTemplates({ review, authorization: auth, consumed: new Set(), usedTexts: [first.text] });
  assert(states[0].status === "duplicate", "exact duplicate of an existing or sent post is rejected");

  const nearText = `${first.text.replace("https://www.psllabs.org/science/how-to-read-a-coa", "").trim()} Always.`;
  states = evaluateTemplates({ review, authorization: auth, consumed: new Set(), usedTexts: [nearText] });
  assert(states[0].status === "near_duplicate", "substantially similar content is blocked");

  states = evaluateTemplates({ review, authorization: auth, consumed: new Set(review.templates.map((t) => t.id)), usedTexts: [] });
  assert(!states.some((s) => s.status === "eligible"), "exhausted library yields nothing (the slot skips; nothing is generated)");

  const freeForm = "Freshly drafted AI text about reading laboratory documentation that nobody reviewed as a template.";
  states = evaluateTemplates({ review, authorization: auth, consumed: new Set(), usedTexts: [] });
  assert(!review.templates.some((t) => t.text === freeForm) && states.length === review.templates.length, "only library wording is ever evaluated; free-form drafts are never candidates");
}

function standingPost(): XPostRecord {
  const review = currentLibraryReview();
  const t = review.templates[0];
  const ctx: StandingPolicyApprovalContext = {
    authorization: "standing_policy",
    previewHash: "a".repeat(64),
    acknowledgedWarnings: [],
    policyVersion: X_CONTENT_POLICY_VERSION,
    env: "production",
    links: [],
    weightedLength: 100,
    validityMinutes: null,
    standingPolicy: {
      policyId: X_AUTOPILOT_POLICY.id,
      policyVersion: X_AUTOPILOT_POLICY_VERSION,
      policyHash: X_AUTOPILOT_POLICY_HASH,
      libraryId: review.libraryId,
      libraryVersion: review.version,
      templateId: t.id,
      templateHash: t.hash,
      sourceIds: [...t.template.sourceIds],
      sourceHashes: t.sources,
      acceptedWarnings: [],
      authorizationId: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
      authorizationGrantedAt: "2026-10-01T15:00:00.000Z",
      authorizationGrantedBy: "admin",
      slotKey: autopilotSlotKey("2026-10-01", "09:00"),
      slotAt: "2026-10-01T16:00:00.000Z",
      actor: X_AUTOPILOT_ACTOR,
    },
  };
  return {
    id: "4f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    status: "claimed",
    revision: 1,
    text: t.text,
    textHash: t.textHash,
    sourceRefs: standingPolicyRefs(t, review.version, ctx.standingPolicy.authorizationId),
    accountId: X_ACCOUNT_ID,
    accountHandle: "PSLLabspurity",
    isTest: true,
    scheduleKind: "scheduled",
    scheduledFor: "2026-10-01T16:00:00.000Z",
    expiresAt: "2026-10-01T17:00:00.000Z",
    scheduledDay: "2026-10-01",
    approvalHash: "b".repeat(64),
    approvedRevision: 1,
    approvedAt: "2026-10-01T16:00:00.000Z",
    approvedBy: X_AUTOPILOT_ACTOR,
    approvalContext: ctx,
    activeAttemptId: null,
    xPostId: null,
    verifiedAt: null,
    reviewRequired: false,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdBy: X_AUTOPILOT_ACTOR,
    createdAt: "2026-10-01T16:00:00.000Z",
    updatedAt: "2026-10-01T16:00:00.000Z",
  };
}

function testDispatchCheck() {
  const p = standingPost();
  assert(standingPolicyProblem(p) === null, "an intact standing-policy post passes the dispatch-time check");
  const ctx = p.approvalContext as StandingPolicyApprovalContext;
  assert(standingPolicyProblem({ ...p, text: `${p.text} ` }) !== null, "text drift blocks dispatch");
  assert(standingPolicyProblem({ ...p, approvedBy: "admin" }) !== null, "a standing-policy post is never attributed to the owner");
  assert(standingPolicyProblem({ ...p, approvalContext: { ...ctx, acknowledgedWarnings: ["claim:body_outcome"] } }) !== null, "no fabricated warning acknowledgements");
  assert(standingPolicyProblem({ ...p, approvalContext: { ...ctx, standingPolicy: { ...ctx.standingPolicy, templateHash: "0".repeat(64) } } }) !== null, "a library/source change blocks dispatch");
  assert(standingPolicyProblem({ ...p, approvalContext: { ...ctx, standingPolicy: { ...ctx.standingPolicy, policyHash: "0".repeat(64) } } }) !== null, "a policy change blocks dispatch");
  assert(standingPolicyProblem({ ...p, approvalContext: { ...ctx, standingPolicy: { ...ctx.standingPolicy, templateId: "doc-unknown" } } }) !== null, "an unknown template blocks dispatch");
  assert(standingPolicyProblem({ ...p, scheduleKind: "next_manual_run" }) !== null, "standing-policy posts use their slot only");
  const refs = p.sourceRefs.join("\n");
  assert(/not by individual owner review/.test(refs) && refs.includes(ctx.standingPolicy.templateId), "provenance records the standing policy, not an owner review");
  assert(p.sourceRefs.length <= X_LIMITS.maxSourceRefs && p.sourceRefs.every((r) => r.length <= X_LIMITS.maxSourceRefLength), "provenance fits the stored limits");
}

function main() {
  testPolicy();
  testSlots();
  testLibrary();
  testTemplateRules();
  testHashing();
  testEvaluation();
  testDispatchCheck();
  console.log(`[x-autopilot] ${passed} offline assertions passed.`);
}

try {
  main();
} catch (error) {
  console.error("[x-autopilot] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
}
