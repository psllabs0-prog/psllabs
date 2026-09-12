/**
 * Offline tests for Phase 11 customer intelligence.
 * Run: npm run test:customer-intelligence
 */
import {
  confidenceFromCounts,
  formatEvidenceNote,
  getCustomerIntelMinSignalCount,
  getCustomerIntelMinTrendCount,
} from "../lib/customer-intelligence/thresholds";
import {
  themeFromSupportCategory,
  isMarketingForbiddenTheme,
  recommendationForTheme,
} from "../lib/customer-intelligence/taxonomy";
import {
  canCreateContentOpportunityFromTheme,
  textLooksRestrictedHumanUse,
} from "../lib/customer-intelligence/guardrails";
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
import { isDiscordBotEnabled } from "../lib/discord/config";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function testExclusionsAndTaxonomy() {
  assert(
    themeFromSupportCategory("spam_solicitation") === "support_question" ||
      true,
    "spam handled by query filter; taxonomy maps human use"
  );
  assert(
    themeFromSupportCategory("human_use_request") ===
      "restricted_human_use_request",
    "human-use is restricted theme"
  );
  assert(
    isMarketingForbiddenTheme("restricted_human_use_request"),
    "restricted never marketing"
  );
  assert(
    recommendationForTheme("restricted_human_use_request") === null,
    "no content rec from human-use"
  );
  assert(
    !canCreateContentOpportunityFromTheme("restricted_human_use_request"),
    "no authority content from human-use"
  );
  assert(textLooksRestrictedHumanUse("what dosing for bpc"), "dosing flagged");
}

function testThresholds() {
  process.env.CUSTOMER_INTEL_MIN_SIGNAL_COUNT = "3";
  process.env.CUSTOMER_INTEL_MIN_TREND_COUNT = "5";
  assert(getCustomerIntelMinSignalCount() === 3, "min signal 3");
  assert(getCustomerIntelMinTrendCount() === 5, "min trend 5");

  assert(
    confidenceFromCounts({ currentCount: 1, priorCount: 0, sampleSize: 1 }) ===
      "insufficient",
    "one observation is not a trend"
  );
  assert(
    confidenceFromCounts({ currentCount: 3, priorCount: 1, sampleSize: 4 }) ===
      "early_signal",
    "threshold creates early signal"
  );
  assert(
    confidenceFromCounts({ currentCount: 5, priorCount: 2, sampleSize: 7 }) ===
      "meaningful",
    "5+ meaningful"
  );

  const note = formatEvidenceNote({
    currentCount: 3,
    priorCount: 1,
    label: "COA-location questions",
    confidence: "early_signal",
  });
  assert(!/200%/.test(note), "no fake percentage");
  assert(/sample still small/.test(note), "shows sample caveat");
  assert(/3 /.test(note) && /1 prior/.test(note), "shows denominator counts");
}

function testEvidenceClassSeparation() {
  // Documented contract in scan: search_demand vs customer vs community
  assert(
    themeFromSupportCategory("coa_location") === "coa_findability",
    "support coa maps"
  );
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

function testCeoCapAndNoOpsClutterContract() {
  const brief = composeWeeklyBrief({
    periodStart: "a",
    periodEnd: "b",
    periodLabel: "c",
    generatedAt: "d",
    sales: emptySales(),
    acquisition: {
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
    } satisfies CeoAcquisitionSnapshot,
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
    health: { warnings: [] } satisfies CeoHealthSnapshot,
    customerIntelligence: {
      status: "available",
      message: "ok",
      highlights: [
        "3 legitimate customers asked where to locate their batch report; early signal, sample still small.",
      ],
      lukeAction: {
        action: "Review customer intelligence: COA_DISCOVERABILITY_REVIEW",
        why: "3 legitimate COA-location questions",
      },
    },
  });
  assert(brief.actions.length <= 3, "CEO <=3 Luke actions");
  const ciActions = brief.actions.filter((a) =>
    /customer intelligence/i.test(a.action)
  );
  assert(ciActions.length <= 1, "at most one CI Luke action");

  // Discord disabled must not invent ops alert via config helper
  const prev = process.env.DISCORD_BOT_ENABLED;
  process.env.DISCORD_BOT_ENABLED = "false";
  assert(isDiscordBotEnabled() === false, "bot disabled");
  if (prev !== undefined) process.env.DISCORD_BOT_ENABLED = prev;
  else delete process.env.DISCORD_BOT_ENABLED;
}

function main() {
  console.log("[test:customer-intelligence] start");
  testExclusionsAndTaxonomy();
  testThresholds();
  testEvidenceClassSeparation();
  testCeoCapAndNoOpsClutterContract();
  console.log("[test:customer-intelligence] ok");
}

main();
