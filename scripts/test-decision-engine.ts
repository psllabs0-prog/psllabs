/**
 * Offline / pure evaluator tests for Phase 13 Decision Engine.
 * Run: npm run test:decision-engine
 */
import {
  emptyDecisionContext,
  evaluateDecisionPatterns,
  type DecisionContext,
  type DecisionSignalRow,
} from "../lib/decision-engine";
import { decideDigestNotifications } from "../lib/decision-engine/digest";
import { composeWeeklyBrief, buildLukeActionCandidates } from "../lib/ceo-brief/compose";
import { selectLukeActions } from "../lib/ceo-brief/period";
import type {
  CeoAcquisitionSnapshot,
  CeoHealthSnapshot,
  CeoInventorySnapshot,
  CeoSalesSnapshot,
  CeoSeoSnapshot,
  CeoSupportSnapshot,
  CeoDecisionSnapshot,
} from "../lib/ceo-brief/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
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

function testZeroData() {
  const ctx = emptyDecisionContext();
  const signals = evaluateDecisionPatterns(ctx);
  assert(signals.length === 0, "zero data => no fake decisions");
}

function testDataQualityGates() {
  const ctx = emptyDecisionContext();
  ctx.acquisition.metaConfigured = true;
  ctx.systemHealth.metaStale = true;
  ctx.acquisition.spendUsd7d = 200;
  ctx.acquisition.clicks7d = 100;
  ctx.acquisition.pslAttributedOrders7d = 0;
  // Stale meta should create SOURCE_STALE, not a performance conclusion alone
  const signals = evaluateDecisionPatterns(ctx);
  assert(
    signals.some((s) => s.signalType === "SOURCE_STALE" && s.signalKey.includes("meta")),
    "stale Meta => SOURCE_STALE"
  );
  assert(
    !signals.some((s) => s.signalType === "ATTRIBUTION_MEASUREMENT"),
    "stale Meta prevents paid-performance attribution signal"
  );

  const gsc = emptyDecisionContext();
  gsc.seo.gscConfigured = true;
  gsc.systemHealth.gscStale = true;
  gsc.seo.materialOpportunity = true;
  gsc.seo.nonBrandImpressions28d = 500;
  const gscSig = evaluateDecisionPatterns(gsc);
  assert(
    gscSig.some((s) => s.signalKey === "data:stale:gsc"),
    "stale GSC => data quality"
  );
  assert(
    !gscSig.some((s) => s.signalType === "AUTHORITY_OPPORTUNITY_REVIEW"),
    "stale GSC prevents SEO opportunity conclusion"
  );

  const inv = emptyDecisionContext();
  inv.inventory.monitorFresh = false;
  inv.systemHealth.inventoryMonitorStale = true;
  inv.inventory.skus = [
    {
      sku: "PSL-X",
      handle: "x",
      name: "X",
      sellableUnits: 2,
      orderedInbound: 0,
      inTransit: 0,
      awaitingTesting: 0,
      inboundPipelineTotal: 0,
      forecastConfidence: "RELIABLE",
      statusFlags: ["REORDER_REVIEW"],
      daysSupply: 3,
    },
  ];
  const invSig = evaluateDecisionPatterns(inv);
  assert(
    invSig.some((s) => s.signalKey === "data:stale:inventory"),
    "stale inventory => data quality"
  );
  assert(
    !invSig.some((s) => s.signalType === "INVENTORY_DEMAND_RISK"),
    "stale inventory prevents stock-coverage conclusion"
  );

  const fin = emptyDecisionContext();
  fin.finance.reconcileFailed = true;
  fin.finance.fresh = false;
  const finSig = evaluateDecisionPatterns(fin);
  assert(
    finSig.some((s) => s.signalType === "DATA_QUALITY"),
    "finance failure lowers trust / creates data quality"
  );
}

function testAcquisition() {
  const tiny = emptyDecisionContext();
  tiny.acquisition.metaConfigured = true;
  tiny.acquisition.metaFresh = true;
  tiny.acquisition.spendUsd7d = 5;
  tiny.acquisition.clicks7d = 5;
  tiny.acquisition.pslAttributedOrders7d = 0;
  assert(
    evaluateDecisionPatterns(tiny).every(
      (s) => s.signalType !== "ATTRIBUTION_MEASUREMENT"
    ),
    "tiny spend => no strong attribution signal"
  );

  const meaningful = emptyDecisionContext();
  meaningful.acquisition.metaConfigured = true;
  meaningful.acquisition.metaFresh = true;
  meaningful.acquisition.spendUsd7d = 120;
  meaningful.acquisition.clicks7d = 80;
  meaningful.acquisition.pslAttributedOrders7d = 0;
  meaningful.acquisition.measurementWarnings = [
    "2 platform campaign(s) with spend and no matched PSL orders (measurement warning).",
  ];
  const sigs = evaluateDecisionPatterns(meaningful);
  assert(
    sigs.some((s) => s.signalType === "ATTRIBUTION_MEASUREMENT"),
    "meaningful spend + no order + warning => measurement-first"
  );
  const text = JSON.stringify(sigs);
  assert(!/ROAS is profit/i.test(text), "never call ROAS profit");
  assert(/not profit/i.test(text), "ROAS explicitly not profit");

  // Funnel unavailable => no fabricated paid-without-progression
  meaningful.acquisition.funnelDataAvailable = false;
  assert(
    !evaluateDecisionPatterns(meaningful).some(
      (s) => s.signalType === "PAID_WITHOUT_PROGRESSION"
    ),
    "no funnel fabrication"
  );
}

function testInventory() {
  const tesa = emptyDecisionContext();
  tesa.inventory.monitorFresh = true;
  tesa.inventory.skus = [
    {
      sku: "PSL-Tesa-10MG",
      handle: "tesamorelin",
      name: "Tesamorelin",
      sellableUnits: 9,
      orderedInbound: 30,
      inTransit: 0,
      awaitingTesting: 0,
      inboundPipelineTotal: 30,
      forecastConfidence: "INSUFFICIENT_SALES_DATA",
      statusFlags: ["ABSOLUTE_LOW_STOCK", "INSUFFICIENT_SALES_DATA"],
      daysSupply: null,
    },
  ];
  assert(
    !evaluateDecisionPatterns(tesa).some(
      (s) => s.signalType === "INVENTORY_DEMAND_RISK"
    ),
    "Tesa 9 + inbound 30 + unvalidated => NO reorder"
  );

  const risk = emptyDecisionContext();
  risk.inventory.monitorFresh = true;
  risk.inventory.skus = [
    {
      sku: "PSL-RTA-10MG",
      handle: "retatrutide",
      name: "Retatrutide",
      sellableUnits: 4,
      orderedInbound: 0,
      inTransit: 0,
      awaitingTesting: 0,
      inboundPipelineTotal: 0,
      forecastConfidence: "RELIABLE",
      statusFlags: ["REORDER_REVIEW", "ABSOLUTE_LOW_STOCK"],
      daysSupply: 10,
    },
  ];
  const riskSig = evaluateDecisionPatterns(risk);
  assert(
    riskSig.some((s) => s.signalType === "INVENTORY_DEMAND_RISK"),
    "validated demand + no inbound + low coverage => reorder REVIEW"
  );
  assert(
    riskSig.every((s) => !/PLACE ORDER|place a PO because MOQ/i.test(s.recommendation) || /Do not place a PO because MOQ/i.test(s.recommendation)),
    "MOQ alone never creates PO recommendation"
  );
  assert(
    /250|500|testing/i.test(
      riskSig.find((s) => s.signalType === "INVENTORY_DEMAND_RISK")!.recommendation
    ),
    "testing economics referenced"
  );

  const testing = emptyDecisionContext();
  testing.inventory.monitorFresh = true;
  testing.inventory.skus = [
    {
      sku: "PSL-BPC",
      handle: "bpc-157",
      name: "BPC-157",
      sellableUnits: 8,
      orderedInbound: 0,
      inTransit: 0,
      awaitingTesting: 25,
      inboundPipelineTotal: 25,
      forecastConfidence: "RELIABLE",
      statusFlags: ["DEPLETION_WATCH"],
      daysSupply: 12,
    },
  ];
  assert(
    evaluateDecisionPatterns(testing).some(
      (s) => s.signalType === "TESTING_RELEASE_REVIEW"
    ),
    "awaiting-testing + rising demand => testing/release review"
  );
}

function testFulfillment() {
  const normal = emptyDecisionContext();
  normal.fulfillment.readyOrders = 3;
  normal.fulfillment.packingOrReadyBacklog = 3;
  normal.finance.legitimateOrders7d = 10;
  assert(
    !evaluateDecisionPatterns(normal).some(
      (s) => s.signalType === "FULFILLMENT_BACKLOG"
    ),
    "normal ready queue not crisis"
  );

  const holds = emptyDecisionContext();
  holds.fulfillment.holds = 4;
  assert(
    evaluateDecisionPatterns(holds).some((s) => s.signalType === "FULFILLMENT_HOLDS"),
    "material holds => decision"
  );

  const backlog = emptyDecisionContext();
  backlog.fulfillment.packingOrReadyBacklog = 12;
  backlog.fulfillment.slaConfigured = false;
  backlog.finance.legitimateOrders7d = 10;
  const b = evaluateDecisionPatterns(backlog).find(
    (s) => s.signalType === "FULFILLMENT_BACKLOG"
  );
  assert(b, "material backlog with orders");
  assert(!/overdue/i.test(b!.summary + b!.recommendation), "no fake overdue without SLA");
}

function testCustomerIntel() {
  const one = emptyDecisionContext();
  one.support.topCategories = [{ category: "coa_location", count: 1 }];
  one.customerIntelligence.signals = [
    {
      signalKey: "c1",
      theme: "coa_findability",
      evidenceClass: "customer",
      currentCount: 1,
      confidenceLevel: "early_signal",
      recommendation: null,
      status: "early",
    },
  ];
  assert(
    !evaluateDecisionPatterns(one).some((s) => s.signalType === "COA_FRICTION"),
    "one question => no trend"
  );

  const multi = emptyDecisionContext();
  multi.support.topCategories = [{ category: "coa_location", count: 3 }];
  multi.customerIntelligence.signals = [
    {
      signalKey: "c1",
      theme: "coa_findability",
      evidenceClass: "customer",
      currentCount: 3,
      confidenceLevel: "early_signal",
      recommendation: "COA_DISCOVERABILITY_REVIEW",
      status: "early",
    },
    {
      signalKey: "com1",
      theme: "coa_findability",
      evidenceClass: "community",
      currentCount: 2,
      confidenceLevel: "early_signal",
      recommendation: null,
      status: "early",
    },
    {
      signalKey: "s1",
      theme: "coa_findability",
      evidenceClass: "search_demand",
      currentCount: 2,
      confidenceLevel: "early_signal",
      recommendation: null,
      status: "early",
    },
  ];
  const coa = evaluateDecisionPatterns(multi).find(
    (s) => s.signalType === "COA_FRICTION"
  );
  assert(coa, "corroborated COA friction");
  assert(
    (coa!.confidence === "moderate" || coa!.confidence === "high" || coa!.confidence === "early"),
    "corroboration increases confidence without merging counts"
  );
  assert(/not merged/i.test(JSON.stringify(coa!.evidence)), "counts not merged language");

  const restricted = emptyDecisionContext();
  restricted.customerIntelligence.signals = [
    {
      signalKey: "r1",
      theme: "restricted_human_use_request",
      evidenceClass: "compliance",
      currentCount: 5,
      confidenceLevel: "early_signal",
      recommendation: null,
      status: "early",
    },
  ];
  const reg = evaluateDecisionPatterns(restricted).find(
    (s) => s.signalType === "REGULATORY_CLAIMS_REVIEW"
  );
  assert(reg, "regulatory signal");
  assert(reg!.recommendedOwner === "regulatory_counsel", "routes to counsel");
  assert(!/marketing opportunity|scale ads|publish/i.test(reg!.recommendation), "no marketing rec");
}

function testSeo() {
  const tiny = emptyDecisionContext();
  tiny.seo.gscConfigured = true;
  tiny.seo.gscFresh = true;
  tiny.seo.nonBrandImpressions28d = 10;
  tiny.seo.materialOpportunity = true;
  assert(
    !evaluateDecisionPatterns(tiny).some(
      (s) => s.signalType === "AUTHORITY_OPPORTUNITY_REVIEW"
    ),
    "tiny search ignored"
  );
}

function testDiscord() {
  const d = emptyDecisionContext();
  d.discord.enabled = true;
  d.discord.interactionCount = 40;
  d.discord.restrictedCount = 25;
  const sig = evaluateDecisionPatterns(d).find(
    (s) => s.signalKey === "discord:restricted_trend"
  );
  assert(sig, "restricted trend");
  assert(sig!.area === "discord" || sig!.recommendedOwner === "regulatory_counsel", "compliance-only");
}

function testDigestIdempotency() {
  const base: DecisionSignalRow = {
    id: 1,
    signalKey: "k1",
    signalType: "X",
    area: "finance",
    priority: "P1",
    confidence: "moderate",
    status: "active",
    title: "t",
    summary: "s",
    recommendation: "r",
    reasoningJson: {},
    evidenceJson: { items: [] },
    risksJson: {},
    whatCouldMakeWrongJson: [],
    dataNeededJson: [],
    recommendedOwner: "luke",
    sourceHref: "/admin-decisions",
    firstDetectedAt: "a",
    lastDetectedAt: "b",
    acknowledgedAt: null,
    resolvedAt: null,
    dismissedAt: null,
    lastNotifiedAt: "already",
    lastNotifiedEvidenceHash: null, // will compute mismatch
    createdAt: "a",
    updatedAt: "b",
  };
  // With lastNotifiedAt set and hash matching current evidence — should not re-notify
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        priority: base.priority,
        confidence: base.confidence,
        evidence: base.evidenceJson,
        recommendation: base.recommendation,
      })
    )
    .digest("hex")
    .slice(0, 32);
  const unchanged = { ...base, lastNotifiedEvidenceHash: hash };
  assert(
    decideDigestNotifications([unchanged]).length === 0,
    "unchanged signal does not repeatedly notify"
  );

  const changed = {
    ...base,
    lastNotifiedEvidenceHash: "oldhash",
    recommendation: "changed",
  };
  assert(
    decideDigestNotifications([changed]).length === 1,
    "materially changed evidence can re-notify"
  );

  const p3 = { ...base, priority: "P3" as const, lastNotifiedAt: null };
  assert(
    decideDigestNotifications([p3]).length === 0,
    "P3 alone does not notify"
  );
}

function testCeoMaxThree() {
  const decisions: CeoDecisionSnapshot = {
    status: "available",
    message: "3 high-priority",
    highPriorityCount: 3,
    lukeActions: [
      { priority: "P0", action: "D1", why: "w1", signalKey: "a" },
      { priority: "P1", action: "D2", why: "w2", signalKey: "b" },
      { priority: "P1", action: "D3", why: "w3", signalKey: "c" },
      { priority: "P2", action: "D4", why: "w4", signalKey: "d" },
    ],
  };
  const cands = buildLukeActionCandidates({
    sales: emptySales(),
    inventory: {
      skus: [],
      lowStockAlerts: [],
      reorderReviewSignals: [],
      awaitingTestingLots: 0,
      inboundPipelineTotal: 0,
      inboundUnitsTotal: 0,
      sellableUnitsTotal: 0,
      testingEconomicsNote: "t",
    } as CeoInventorySnapshot,
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
    health: { warnings: [] } satisfies CeoHealthSnapshot,
    acquisition: {
      status: "unavailable",
      message: "n/a",
      spendUsd: null,
      sessionsOrClicks: null,
      attributedOrders: null,
      attributedRevenueUsd: null,
      cacUsd: null,
      roas: null,
      winners: [],
      losers: [],
    } satisfies CeoAcquisitionSnapshot,
    seo: {
      status: "pending",
      message: "n/a",
      clicks: null,
      impressions: null,
      nonBrandImpressions: null,
      nonBrandClicks: null,
      ctr: null,
      averagePosition: null,
      priorClicks: null,
      priorImpressions: null,
      clicksChangeNote: null,
      impressionsChangeNote: null,
      pagesGaining: [],
      queryChanges: [],
      materialOpportunity: false,
    } satisfies CeoSeoSnapshot,
    decisions,
  });
  const actions = selectLukeActions(cands, 3);
  assert(actions.length <= 3, "max 3 owner actions");
  assert(actions.every((a) => /D[123]/.test(a.action)), "P0/P1 outrank P2 optimization");

  const brief = composeWeeklyBrief({
    periodStart: "a",
    periodEnd: "b",
    periodLabel: "c",
    generatedAt: "d",
    sales: emptySales(),
    acquisition: {
      status: "unavailable",
      message: "n/a",
      spendUsd: null,
      sessionsOrClicks: null,
      attributedOrders: null,
      attributedRevenueUsd: null,
      cacUsd: null,
      roas: null,
      winners: [],
      losers: [],
    },
    inventory: {
      skus: [],
      lowStockAlerts: [],
      reorderReviewSignals: [],
      awaitingTestingLots: 0,
      inboundPipelineTotal: 0,
      inboundUnitsTotal: 0,
      sellableUnitsTotal: 0,
      testingEconomicsNote: "t",
    } as CeoInventorySnapshot,
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
    seo: {
      status: "pending",
      message: "n/a",
      clicks: null,
      impressions: null,
      nonBrandImpressions: null,
      nonBrandClicks: null,
      ctr: null,
      averagePosition: null,
      priorClicks: null,
      priorImpressions: null,
      clicksChangeNote: null,
      impressionsChangeNote: null,
      pagesGaining: [],
      queryChanges: [],
      materialOpportunity: false,
    },
    health: { warnings: [] },
    decisions: {
      status: "available",
      message: "No high-priority owner decisions this week.",
      lukeActions: [],
      highPriorityCount: 0,
    },
  });
  assert(brief.actions.length === 0, "no busywork filling empty slots");
}

function testLifecycleKeysStable() {
  const ctx = emptyDecisionContext();
  ctx.finance.reconcileFailed = true;
  ctx.finance.fresh = false;
  const a = evaluateDecisionPatterns(ctx);
  const b = evaluateDecisionPatterns(ctx);
  assert(a.length === b.length, "deterministic");
  assert(
    a.every((s, i) => s.signalKey === b[i].signalKey),
    "stable signal keys across runs"
  );
}

function main() {
  console.log("[test:decision-engine] start");
  testZeroData();
  testDataQualityGates();
  testAcquisition();
  testInventory();
  testFulfillment();
  testCustomerIntel();
  testSeo();
  testDiscord();
  testDigestIdempotency();
  testCeoMaxThree();
  testLifecycleKeysStable();
  console.log("[test:decision-engine] ok");
}

main();
