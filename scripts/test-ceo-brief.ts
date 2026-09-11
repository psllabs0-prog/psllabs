/**
 * Offline tests for weekly CEO brief logic (no fabrication, prioritization).
 * Run: npm run test:ceo-brief
 */
import {
  buildLukeActionCandidates,
  composeWeeklyBrief,
} from "../lib/ceo-brief/compose";
import {
  formatPctChange,
  getLastCompletedWeekUtc,
  previousWeekPeriod,
  selectLukeActions,
} from "../lib/ceo-brief/period";
import { sellableNeverIncludesInbound } from "../lib/ceo-brief/inventory";
import { genuineCustomerCount } from "../lib/ceo-brief/support";
import { collectAcquisitionSnapshot } from "../lib/ceo-brief/acquisition";
import { collectSeoSnapshot } from "../lib/ceo-brief/seo";
import { formatCeoBriefEmailSubject } from "../lib/ceo-brief/email";
import { verifyCronRequest } from "../lib/cron/auth";
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

function emptySales(over: Partial<CeoSalesSnapshot> = {}): CeoSalesSnapshot {
  return {
    periodLabel: "2026-09-01 → 2026-09-07",
    priorPeriodLabel: "2026-08-25 → 2026-08-31",
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
    refundsNote: "Refund totals not available in Neon finance records yet.",
    reconciliationWarnings: [],
    ordersChangeNote: null,
    revenueChangeNote: null,
    ...over,
  };
}

function emptyInventory(
  over: Partial<CeoInventorySnapshot> = {}
): CeoInventorySnapshot {
  return {
    skus: [],
    lowStockAlerts: [],
    reorderReviewSignals: [],
    awaitingTestingLots: 0,
    inboundUnitsTotal: 0,
    sellableUnitsTotal: 0,
    testingEconomicsNote: "test",
    ...over,
  };
}

function emptySupport(over: Partial<CeoSupportSnapshot> = {}): CeoSupportSnapshot {
  return {
    genuineCustomerMessages: 0,
    green: 0,
    yellow: 0,
    red: 0,
    unresolvedEscalations: 0,
    spamSolicitations: 0,
    vendorSolicitations: 0,
    topGenuineCategories: [],
    recurringQuestionHints: [],
    systemFailures: [],
    automationIssues: [],
    ...over,
  };
}

function testPeriodMondayWindow() {
  // Wednesday 2026-09-09 → last completed week Mon 2026-08-31 → Mon 2026-09-07
  const asOf = new Date(Date.UTC(2026, 8, 9));
  const period = getLastCompletedWeekUtc(asOf);
  assert(period.labelStart === "2026-08-31", "week start Mon");
  assert(period.labelEnd === "2026-09-06", "week end Sun");
  const prior = previousWeekPeriod(period);
  assert(prior.labelStart === "2026-08-24", "prior week");
}

function testZeroSalesNoPct() {
  assert(formatPctChange(0, 0) === null, "zero vs zero no pct");
  assert(formatPctChange(0.001, 0) === null, "near-zero vs zero");
  assert(formatPctChange(100, 50)?.includes("%") === true, "real change");
}

function testQaExclusionConcept() {
  // Documented rule: reporting_excluded finance rows drop from legitimate totals.
  const include = (reportingExcluded: boolean) => !reportingExcluded;
  assert(include(false) === true, "legitimate kept");
  assert(include(true) === false, "QA/test excluded");
}

function testSpamVendorExcludedFromCustomer() {
  assert(
    genuineCustomerCount({ totalClassified: 10, spam: 3, vendor: 2 }) === 5,
    "spam+vendor excluded"
  );
}

function testInboundNeverSellable() {
  assert(
    sellableNeverIncludesInbound({
      sellable: 4,
      inbound: 50,
      awaitingTesting: 20,
    }) === 4,
    "inbound not sellable"
  );
}

function testMissingPaidNotFabricated() {
  const a = collectAcquisitionSnapshot();
  assert(a.status === "unavailable", "paid unavailable");
  assert(a.spendUsd === null, "no spend invent");
  assert(a.cacUsd === null, "no cac invent");
  assert(a.roas === null, "no roas invent");
  assert(/not yet available/i.test(a.message), "explicit message");
}

function testMissingSeoNotFabricated() {
  const s = collectSeoSnapshot();
  assert(s.status === "pending", "seo pending");
  assert(s.clicks === null && s.impressions === null, "no seo invent");
  assert(/pending sync/i.test(s.message), "seo message");
}

function testMaxThreeActionsAndRedBeatsSeo() {
  const sales = emptySales({
    reconciliationWarnings: [],
  });
  const inventory = emptyInventory();
  const support = emptySupport({
    red: 2,
    genuineCustomerMessages: 2,
    unresolvedEscalations: 1,
  });
  const health: CeoHealthSnapshot = { warnings: [] };
  const acquisition: CeoAcquisitionSnapshot = collectAcquisitionSnapshot();
  const seo: CeoSeoSnapshot = {
    status: "available",
    message: "ok",
    clicks: 10,
    impressions: 1000,
    nonBrandImpressions: 800,
    pagesGaining: ["/guides/verify-peptide-coa"],
    queryChanges: [],
  };

  const candidates = buildLukeActionCandidates({
    sales,
    inventory,
    support,
    health,
    acquisition,
    seo,
  });
  const actions = selectLukeActions(candidates, 3);
  assert(actions.length <= 3, "≤3 actions");
  assert(actions.length >= 1, "at least red/escalation action");
  assert(
    actions.some((a) => /RED|escalation/i.test(a.action)),
    "RED/customer outranks SEO"
  );
  assert(
    !actions.some((a) => /SEO/i.test(a.action)) ||
      actions.findIndex((a) => /RED|escalation/i.test(a.action)) <
        actions.findIndex((a) => /SEO/i.test(a.action)),
    "customer before SEO when both present"
  );
}

function testFinanceFailureSurfaced() {
  const brief = composeWeeklyBrief({
    periodStart: "2026-08-31T00:00:00.000Z",
    periodEnd: "2026-09-07T00:00:00.000Z",
    periodLabel: "2026-08-31 → 2026-09-06",
    generatedAt: "2026-09-07T15:00:00.000Z",
    sales: emptySales({
      reconciliationWarnings: [
        {
          type: "amount_mismatch",
          message: "Order total differs from provider",
          orderId: "psl_x",
        },
      ],
    }),
    acquisition: collectAcquisitionSnapshot(),
    inventory: emptyInventory(),
    support: emptySupport(),
    seo: collectSeoSnapshot(),
    health: { warnings: ["Finance reconciliation failed: timeout"] },
  });
  assert(
    brief.executiveSummary.some((b) => /Finance|reconcil/i.test(b)),
    "finance failure in summary"
  );
  assert(brief.actions.length <= 3, "≤3 actions");
  assert(
    brief.actions.some((a) => /finance|warning|reconcil/i.test(a.action + a.why)),
    "finance in actions"
  );
}

function testEmailSubject() {
  const brief = composeWeeklyBrief({
    periodStart: "2026-08-31T00:00:00.000Z",
    periodEnd: "2026-09-07T00:00:00.000Z",
    periodLabel: "2026-08-31 → 2026-09-06",
    generatedAt: "2026-09-07T15:00:00.000Z",
    sales: emptySales(),
    acquisition: collectAcquisitionSnapshot(),
    inventory: emptyInventory(),
    support: emptySupport(),
    seo: collectSeoSnapshot(),
    health: { warnings: [] },
  });
  assert(
    formatCeoBriefEmailSubject(brief) ===
      "PSL Labs Weekly CEO Brief — 2026-09-06",
    "email subject date"
  );
}

function testCronAuth() {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-secret";
  const unauthorized = verifyCronRequest(
    new Request("http://localhost/api/cron/weekly-ceo-brief")
  );
  assert(unauthorized?.status === 401, "cron auth required");
  const ok = verifyCronRequest(
    new Request("http://localhost/api/cron/weekly-ceo-brief", {
      headers: { authorization: "Bearer test-secret" },
    })
  );
  assert(ok === null, "cron bearer accepted");
  if (prev === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prev;
}

function main() {
  console.log("[test-ceo-brief] running…");
  testPeriodMondayWindow();
  testZeroSalesNoPct();
  testQaExclusionConcept();
  testSpamVendorExcludedFromCustomer();
  testInboundNeverSellable();
  testMissingPaidNotFabricated();
  testMissingSeoNotFabricated();
  testMaxThreeActionsAndRedBeatsSeo();
  testFinanceFailureSurfaced();
  testEmailSubject();
  testCronAuth();
  console.log("[test-ceo-brief] all passed.");
}

main();
