/**
 * Offline tests for Phase 10 authority / SEO opportunity engine.
 * Run: npm run test:authority
 */
import { detectAuthorityOpportunities } from "../lib/authority/detect";
import {
  classifyRisk,
  detectForbiddenTopic,
  looksLikeGenericCompoundPage,
  shouldSuppressAsNormalPublishable,
  claimsNotToMake,
} from "../lib/authority/guardrails";
import { generateDeterministicBrief } from "../lib/authority/briefs";
import {
  findMatchingKnownPage,
  recommendInternalLinks,
} from "../lib/authority/pages";
import { buildLukeActionCandidates, composeWeeklyBrief } from "../lib/ceo-brief/compose";
import { selectLukeActions } from "../lib/ceo-brief/period";
import type {
  CeoAcquisitionSnapshot,
  CeoHealthSnapshot,
  CeoInventorySnapshot,
  CeoSalesSnapshot,
  CeoSeoSnapshot,
  CeoSupportSnapshot,
} from "../lib/ceo-brief/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function testTrivialImpressionsNoOpportunity() {
  const ops = detectAuthorityOpportunities([
    {
      query: "peptide purity vs content",
      page: "/guides/peptide-purity-vs-content",
      isBrand: false,
      impressions: 2,
      clicks: 1,
      ctr: 0.5,
      position: 12,
      priorImpressions: 1,
      priorClicks: 0,
    },
  ]);
  assert(ops.length === 0, "1→2 impressions must not create opportunity");
}

function testNearPageOne() {
  process.env.AUTHORITY_MIN_IMPRESSIONS_FOR_OPPORTUNITY = "40";
  const ops = detectAuthorityOpportunities([
    {
      query: "verify peptide laboratory report",
      page: "/guides/verify-peptide-laboratory-report",
      isBrand: false,
      impressions: 120,
      clicks: 8,
      ctr: 0.066,
      position: 14,
      priorImpressions: 100,
      priorClicks: 6,
    },
  ]);
  assert(
    ops.some((o) => o.type === "NEAR_PAGE_ONE"),
    "meaningful position 8–30 creates near-page-one"
  );
  assert(
    ops.some((o) => o.existingPagePath?.includes("verify-peptide")),
    "existing page recognized"
  );
  assert(
    ops.every((o) => o.recommendAction !== "consider_new" || !o.existingPagePath),
    "existing page prefers optimize"
  );
}

function testBrandGrowthNotAuthorityWin() {
  const ops = detectAuthorityOpportunities([
    {
      query: "psl labs",
      page: "/",
      isBrand: true,
      impressions: 500,
      clicks: 40,
      ctr: 0.08,
      position: 1.2,
      priorImpressions: 100,
      priorClicks: 5,
    },
  ]);
  assert(ops.length === 0, "branded-only growth is not non-brand authority win");
}

function testDuplicateKeyStable() {
  const row = {
    query: "batch specific coa",
    page: "/guides/batch-specific-vs-generic-coa",
    isBrand: false,
    impressions: 90,
    clicks: 6,
    ctr: 0.066,
    position: 11,
    priorImpressions: 80,
    priorClicks: 5,
  };
  const a = detectAuthorityOpportunities([row]);
  const b = detectAuthorityOpportunities([row]);
  const keysA = a.map((o) => o.opportunityKey).sort();
  const keysB = b.map((o) => o.opportunityKey).sort();
  assert(JSON.stringify(keysA) === JSON.stringify(keysB), "duplicate detection stable");
}

function testGenericCompoundDeprioritized() {
  assert(looksLikeGenericCompoundPage("what is bpc 157"), "generic compound");
  const ops = detectAuthorityOpportunities([
    {
      query: "what is bpc 157",
      page: "",
      isBrand: false,
      impressions: 200,
      clicks: 10,
      ctr: 0.05,
      position: 12,
      priorImpressions: 150,
      priorClicks: 8,
    },
  ]);
  const near = ops.filter((o) => o.type === "NEAR_PAGE_ONE");
  for (const o of near) {
    assert(o.priorityScore <= 15, "generic compound not auto-prioritized");
  }
}

function testRiskyTopics() {
  assert(detectForbiddenTopic("bpc 157 dosing guide"), "dosing forbidden");
  assert(
    shouldSuppressAsNormalPublishable("injection protocol peptides"),
    "injection topic suppressed"
  );
  assert(classifyRisk("bpc 157 side effects", "") === "COUNSEL_REVIEW", "counsel");
  const brief = generateDeterministicBrief({
    opportunity: {
      type: "NEAR_PAGE_ONE",
      primaryQuery: "peptide injection dosing",
      page: "",
      intent: "informational",
      riskLevel: "COUNSEL_REVIEW",
      evidence: { impressions: 100, position: 10 },
    },
  });
  assert(brief.claimsReviewRequired, "claims review required");
  assert(
    brief.brief.claimsThatMustNotBeMade.length === claimsNotToMake().length,
    "claims-not-to-make present"
  );
  assert(
    brief.brief.evidenceRequired.some((e) =>
      /EVIDENCE REQUIRED BEFORE DRAFTING/i.test(e)
    ),
    "does not fabricate — labels evidence required"
  );
  assert(
    brief.brief.counselBanner?.includes("COUNSEL/CLAIMS REVIEW"),
    "counsel banner"
  );
}

function testInternalLinksNonDestructive() {
  const links = recommendInternalLinks("/guides/verify-peptide-coa");
  assert(links.length > 0, "has recommendations");
  assert(
    links.every((l) => l.from.startsWith("/") && l.to.startsWith("/")),
    "paths only"
  );
  // Function returns recommendations — no page mutation API here.
}

function testKnownPageInventory() {
  const hit = findMatchingKnownPage(
    "batch specific vs generic coa",
    "/guides/batch-specific-vs-generic-coa"
  );
  assert(hit?.path === "/guides/batch-specific-vs-generic-coa", "known page");
}

function emptySales(): CeoSalesSnapshot {
  return {
    periodLabel: "t",
    priorPeriodLabel: "p",
    legitimateOrders: 0,
    priorLegitimateOrders: 0,
    grossRevenueUsd: 0,
    priorGrossRevenueUsd: 0,
    netBusinessRevenueUsd: null,
    unitsSold: 0,
    priorUnitsSold: 0,
    aovUsd: null,
    priorAovUsd: null,
    revenueBySku: [],
    paymentMethodMix: [],
    refundsUsd: null,
    refundsNote: "n/a",
    reconciliationWarnings: [],
    ordersChangeNote: null,
    revenueChangeNote: null,
  };
}

function testCeoActionCapAndNoAutoPublish() {
  const acquisition: CeoAcquisitionSnapshot = {
    status: "unavailable",
    message: "Paid acquisition spend data not yet available.",
    spendUsd: null,
    sessionsOrClicks: null,
    attributedOrders: null,
    attributedRevenueUsd: null,
    cacUsd: null,
    roas: null,
    winners: [],
    losers: [],
  };
  const seo: CeoSeoSnapshot = {
    status: "available",
    message: "ok",
    clicks: 80,
    impressions: 2000,
    nonBrandImpressions: 1500,
    nonBrandClicks: 60,
    ctr: 0.04,
    averagePosition: 12,
    priorClicks: 40,
    priorImpressions: 1000,
    clicksChangeNote: "+100%",
    impressionsChangeNote: "+100%",
    pagesGaining: ["/guides/verify-peptide-coa"],
    queryChanges: ["verify peptide coa"],
    materialOpportunity: true,
  };
  const brief = composeWeeklyBrief({
    periodStart: "a",
    periodEnd: "b",
    periodLabel: "c",
    generatedAt: "d",
    sales: emptySales(),
    acquisition,
    inventory: {
      skus: [],
      lowStockAlerts: [],
      reorderReviewSignals: [],
      awaitingTestingLots: 0,
      inboundUnitsTotal: 0,
      sellableUnitsTotal: 0,
      testingEconomicsNote: "t",
    } satisfies CeoInventorySnapshot,
    support: {
      genuineCustomerMessages: 0,
      green: 0,
      yellow: 0,
      red: 0,
      unresolvedEscalations: 0,
      unresolvedEscalationsLabel: "x",
      spamSolicitations: 0,
      vendorSolicitations: 0,
      topGenuineCategories: [],
      recurringQuestionHints: [],
      systemFailures: [],
      automationIssues: [],
    } satisfies CeoSupportSnapshot,
    seo,
    health: { warnings: [] } satisfies CeoHealthSnapshot,
  });
  assert(brief.actions.length <= 3, "CEO <=3 Luke actions");
  const seoActions = brief.actions.filter((a) =>
    /SEO page gaining visibility/i.test(a.action)
  );
  assert(seoActions.length <= 1, "at most one SEO Luke action when material");

  // Status "published" is recording-only in admin API — no deploy helpers here.
  const candidates = buildLukeActionCandidates({
    sales: emptySales(),
    inventory: {
      skus: [],
      lowStockAlerts: [],
      reorderReviewSignals: [],
      awaitingTestingLots: 0,
      inboundUnitsTotal: 0,
      sellableUnitsTotal: 0,
      testingEconomicsNote: "t",
    },
    support: {
      genuineCustomerMessages: 0,
      green: 0,
      yellow: 0,
      red: 0,
      unresolvedEscalations: 0,
      unresolvedEscalationsLabel: "x",
      spamSolicitations: 0,
      vendorSolicitations: 0,
      topGenuineCategories: [],
      recurringQuestionHints: [],
      systemFailures: [],
      automationIssues: [],
    },
    health: { warnings: [] } satisfies CeoHealthSnapshot,
    acquisition,
    seo,
  });
  assert(
    !candidates.some((c) => /publish content|deploy/i.test(c.action)),
    "no auto-publish Luke action"
  );
  assert(selectLukeActions(candidates).length <= 3, "select caps at 3");
}

function main() {
  console.log("[test:authority] start");
  testTrivialImpressionsNoOpportunity();
  testNearPageOne();
  testBrandGrowthNotAuthorityWin();
  testDuplicateKeyStable();
  testGenericCompoundDeprioritized();
  testRiskyTopics();
  testInternalLinksNonDestructive();
  testKnownPageInventory();
  testCeoActionCapAndNoAutoPublish();
  console.log("[test:authority] ok");
}

main();
