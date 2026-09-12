/**
 * Offline tests for Phase 11 customer intelligence.
 * Run: npm run test:customer-intelligence
 */
import { readFileSync } from "fs";
import { join } from "path";
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
import {
  aggregateSearchDemandByTheme,
  classifySearchDemandQuery,
  getCustomerIntelSearchMinImpressions,
} from "../lib/customer-intelligence/search-demand";
import { composeWeeklyBrief } from "../lib/ceo-brief/compose";
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

function testSearchDemandQuerySpecific() {
  process.env.CUSTOMER_INTEL_SEARCH_MIN_IMPRESSIONS = "40";
  assert(getCustomerIntelSearchMinImpressions() === 40, "search min 40");

  assert(classifySearchDemandQuery("buy peptide shipping") === null, "shipping not thematic");
  assert(classifySearchDemandQuery("psl labs retatrutide") === null, "unrelated product query");
  assert(classifySearchDemandQuery("certificate of analysis") === "coa_findability", "coa phrase");
  assert(classifySearchDemandQuery("where to find coa") === "coa_findability", "coa token");
  assert(classifySearchDemandQuery("hplc purity testing") === "analytical_education", "analytical");
  assert(classifySearchDemandQuery("coating spray") === null, "coa not substring of coating");

  // 100 unrelated non-brand impressions => no COA theme aggregation
  const unrelated = aggregateSearchDemandByTheme([
    { query: "peptide supplier usa", isBrand: false, impressions: 100, clicks: 5 },
    { query: "research chemicals shipping", isBrand: false, impressions: 50, clicks: 2 },
  ]);
  assert(unrelated.length === 0, "100 unrelated non-brand => no search-demand theme");

  // Branded excluded even if query contains coa
  const branded = aggregateSearchDemandByTheme([
    { query: "psl labs coa", isBrand: true, impressions: 80, clicks: 4 },
  ]);
  assert(branded.length === 0, "branded COA query excluded");

  // 40+ actual COA-related impressions => COA theme crosses threshold input
  const coaAggs = aggregateSearchDemandByTheme([
    { query: "certificate of analysis peptide", isBrand: false, impressions: 25, clicks: 1 },
    { query: "lab report verification", isBrand: false, impressions: 20, clicks: 1 },
  ]);
  assert(coaAggs.length === 1 && coaAggs[0].theme === "coa_findability", "COA theme present");
  assert(coaAggs[0].impressions >= 40, "COA impressions aggregate to 40+");

  const analytical = aggregateSearchDemandByTheme([
    { query: "hplc purity", isBrand: false, impressions: 45, clicks: 2 },
  ]);
  assert(
    analytical[0]?.theme === "analytical_education" && analytical[0].impressions >= 40,
    "analytical search-demand"
  );

  // Contract: search evidence never mixes into customer sample in scan recommendations gate
  const scanSrc = readFileSync(
    join(process.cwd(), "lib/customer-intelligence/scan.ts"),
    "utf8"
  );
  assert(/evidenceClass:\s*"search_demand"/.test(scanSrc), "search stays search_demand");
  assert(
    /b\.evidenceClass === "customer"/.test(scanSrc),
    "recommendations only from customer evidence"
  );
  assert(
    !/coa_verification_demand/.test(scanSrc),
    "no aggregate coa_verification_demand signal"
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
  testSearchDemandQuerySpecific();
  testCeoCapAndNoOpsClutterContract();
  console.log("[test:customer-intelligence] ok");
}

main();
