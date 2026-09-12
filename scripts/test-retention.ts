/**
 * Offline retention unsubscribe reliability tests.
 * Run: npm run test:retention
 */
process.env.MARKETING_UNSUB_SECRET =
  process.env.MARKETING_UNSUB_SECRET || "test-unsub-secret-for-unit-tests";

import {
  createUnsubscribeToken,
  getRetentionReadiness,
  humanUnsubscribeUrl,
  listUnsubscribeApiUrl,
  retentionProductsUrl,
  RETENTION_UTM,
  verifyUnsubscribeToken,
} from "../lib/retention/config";
import { buildRetention30dEmail } from "../lib/retention/email";
import { isRetentionEligibleContact } from "../lib/retention/store";
import { isSupportAutoSendEnabled } from "../lib/support/constants";
import { topOpsActions, type OpsException } from "../lib/ops/types";
import { applyAcknowledgements, priorityOutranks } from "../lib/ops/exceptions";
import { buildFulfillmentLukeActionCandidates } from "../lib/ceo-brief/fulfillment";
import { selectLukeActions } from "../lib/ceo-brief/period";
import { buildLukeActionCandidates } from "../lib/ceo-brief/compose";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function testEligibilityGates() {
  assert(
    isRetentionEligibleContact({
      marketingEligible: false,
      unsubscribedAt: null,
      suppressed: false,
      reportingExcluded: false,
      alreadySent: false,
    }) === false,
    "no eligibility => no send"
  );
  assert(
    isRetentionEligibleContact({
      marketingEligible: true,
      unsubscribedAt: null,
      suppressed: false,
      reportingExcluded: false,
      alreadySent: false,
    }) === true,
    "explicit eligible can become due"
  );
  assert(
    isRetentionEligibleContact({
      marketingEligible: true,
      unsubscribedAt: "2026-01-01T00:00:00.000Z",
      suppressed: false,
      reportingExcluded: false,
      alreadySent: false,
    }) === false,
    "unsubscribed => no send"
  );
  assert(
    isRetentionEligibleContact({
      marketingEligible: true,
      unsubscribedAt: null,
      suppressed: true,
      reportingExcluded: false,
      alreadySent: false,
    }) === false,
    "suppressed => no send"
  );
  assert(
    isRetentionEligibleContact({
      marketingEligible: true,
      unsubscribedAt: null,
      suppressed: false,
      reportingExcluded: true,
      alreadySent: false,
    }) === false,
    "QA/test => no send"
  );
  assert(
    isRetentionEligibleContact({
      marketingEligible: true,
      unsubscribedAt: null,
      suppressed: false,
      reportingExcluded: false,
      alreadySent: true,
    }) === false,
    "already sent => no duplicate"
  );
}

function testComplianceGate() {
  const prevFrom = process.env.MARKETING_FROM_EMAIL;
  const prevPostal = process.env.MARKETING_POSTAL_ADDRESS;
  const prevAuto = process.env.RETENTION_AUTO_SEND_ENABLED;
  const prevUnsub = process.env.MARKETING_UNSUB_SECRET;

  process.env.MARKETING_FROM_EMAIL = "marketing@psllabs.org";
  process.env.MARKETING_POSTAL_ADDRESS = "123 Test St, Phoenix, AZ";
  process.env.RETENTION_AUTO_SEND_ENABLED = "true";
  delete process.env.MARKETING_UNSUB_SECRET;

  const missingSecret = getRetentionReadiness();
  assert(missingSecret.ready === false, "missing MARKETING_UNSUB_SECRET => not ready");
  assert(
    missingSecret.reasons.some((x) => /MARKETING_UNSUB_SECRET/i.test(x)),
    "secret reason present"
  );
  assert(missingSecret.unsubSecretConfigured === false, "flag false");

  delete process.env.MARKETING_FROM_EMAIL;
  delete process.env.MARKETING_POSTAL_ADDRESS;
  delete process.env.RETENTION_AUTO_SEND_ENABLED;
  const r = getRetentionReadiness();
  assert(r.ready === false, "missing postal/from => not ready");
  assert(
    r.reasons.some((x) => /MARKETING_POSTAL_ADDRESS/i.test(x)),
    "postal address reason"
  );

  if (prevFrom !== undefined) process.env.MARKETING_FROM_EMAIL = prevFrom;
  else delete process.env.MARKETING_FROM_EMAIL;
  if (prevPostal !== undefined) process.env.MARKETING_POSTAL_ADDRESS = prevPostal;
  else delete process.env.MARKETING_POSTAL_ADDRESS;
  if (prevAuto !== undefined) process.env.RETENTION_AUTO_SEND_ENABLED = prevAuto;
  else delete process.env.RETENTION_AUTO_SEND_ENABLED;
  if (prevUnsub !== undefined) process.env.MARKETING_UNSUB_SECRET = prevUnsub;
  else process.env.MARKETING_UNSUB_SECRET = "test-unsub-secret-for-unit-tests";
}

function testUtmsAndDualUnsubscribeUrls() {
  const url = retentionProductsUrl("https://psllabs.org");
  assert(url.includes("utm_source=email"), "utm source");
  assert(url.includes("utm_medium=email"), "utm medium");
  assert(url.includes(`utm_campaign=${RETENTION_UTM.utm_campaign}`), "campaign");
  assert(url.includes("utm_content=products_batch_reports"), "content");

  const built = buildRetention30dEmail({
    email: "a@b.com",
    siteUrl: "https://psllabs.org",
  });
  assert(/Current availability/i.test(built.subject), "subject");
  assert(
    !/running low|next dose|cycle|refill|treatment|results|benefits|effects/i.test(
      built.text
    ),
    "banned words"
  );
  assert(/research use only/i.test(built.text), "RUO");
  assert(/View Products & Batch Reports/i.test(built.text), "CTA");

  assert(
    built.humanUnsubscribeUrl.startsWith("https://psllabs.org/unsubscribe?token="),
    "visible link is human confirmation page"
  );
  assert(
    built.listUnsubscribeUrl.startsWith(
      "https://psllabs.org/api/marketing/unsubscribe?token="
    ),
    "List-Unsubscribe header points to API"
  );
  assert(
    built.text.includes(built.humanUnsubscribeUrl),
    "body uses human URL"
  );
  assert(
    !built.text.includes("/api/marketing/unsubscribe"),
    "body does not use API URL"
  );

  const token = createUnsubscribeToken("a@b.com");
  assert(
    humanUnsubscribeUrl("https://psllabs.org", token).includes("/unsubscribe?"),
    "human helper"
  );
  assert(
    listUnsubscribeApiUrl("https://psllabs.org", token).includes(
      "/api/marketing/unsubscribe?"
    ),
    "api helper"
  );
}

function testUnsubToken() {
  const token = createUnsubscribeToken("Luke@PSLlabs.org");
  const ok = verifyUnsubscribeToken(token);
  assert(ok.ok === true && ok.email === "luke@psllabs.org", "token roundtrip");
  assert(verifyUnsubscribeToken("bad").ok === false, "bad token");
}

function testKillSwitchStillEnv() {
  const prev = process.env.SUPPORT_AUTO_SEND_ENABLED;
  process.env.SUPPORT_AUTO_SEND_ENABLED = "false";
  assert(isSupportAutoSendEnabled() === false, "kill switch off");
  process.env.SUPPORT_AUTO_SEND_ENABLED = "true";
  assert(isSupportAutoSendEnabled() === true, "kill switch on");
  if (prev === undefined) delete process.env.SUPPORT_AUTO_SEND_ENABLED;
  else process.env.SUPPORT_AUTO_SEND_ENABLED = prev;
}

function testFulfillmentDoesNotOutrankRed() {
  const fulfillmentActions = buildFulfillmentLukeActionCandidates({
    readyOrders: 12,
    holds: 1,
    packedWaitingTracking: 0,
    notes: ["1 blocked"],
  });
  const candidates = buildLukeActionCandidates({
    sales: {
      periodLabel: "",
      priorPeriodLabel: "",
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
      refundsNote: "",
      reconciliationWarnings: [
        {
          type: "amount_mismatch",
          message: "payment mismatch",
          orderId: "x",
        },
      ],
      ordersChangeNote: null,
      revenueChangeNote: null,
    },
    inventory: {
      skus: [],
      lowStockAlerts: [],
      reorderReviewSignals: [],
      awaitingTestingLots: 0,
      inboundUnitsTotal: 0,
      sellableUnitsTotal: 0,
      testingEconomicsNote: "",
    },
    support: {
      genuineCustomerMessages: 1,
      green: 0,
      yellow: 0,
      red: 1,
      unresolvedEscalations: 1,
      unresolvedEscalationsLabel: "Current legitimate unresolved escalations",
      spamSolicitations: 0,
      vendorSolicitations: 0,
      topGenuineCategories: [],
      recurringQuestionHints: [],
      systemFailures: [],
      automationIssues: [],
    },
    health: { warnings: [] },
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
    },
    seo: {
      status: "pending",
      message: "External SEO data pending sync.",
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
    fulfillment: {
      readyOrders: 12,
      holds: 1,
      packedWaitingTracking: 0,
      notes: ["blocked"],
    },
  });
  const actions = selectLukeActions(candidates, 3);
  assert(actions.length <= 3, "≤3");
  assert(fulfillmentActions.length === 1, "hold creates action");
  assert(
    !actions.some((a) => /ready to pack|12 legitimate/i.test(a.action)),
    "normal queue not Luke busywork"
  );

  const ranked = applyAcknowledgements(
    [
      {
        sourceType: "fulfillment_queue",
        sourceId: "1",
        priority: "P2",
        area: "fulfillment",
        title: "ready",
        why: "n",
        detectedAt: "2026-01-01T00:00:00.000Z",
        href: "/admin-fulfillment",
      },
      {
        sourceType: "support_escalation",
        sourceId: "2",
        priority: "P1",
        area: "support",
        title: "RED",
        why: "n",
        detectedAt: "2026-01-02T00:00:00.000Z",
        href: "/admin-support",
      },
    ],
    []
  ) as OpsException[];
  assert(priorityOutranks("P1", "P2"), "RED outranks fulfillment queue");
  assert(topOpsActions(ranked, 3)[0].priority === "P1", "top is RED");
}

function main() {
  console.log("[test-retention] running…");
  testEligibilityGates();
  testComplianceGate();
  testUtmsAndDualUnsubscribeUrls();
  testUnsubToken();
  testKillSwitchStillEnv();
  testFulfillmentDoesNotOutrankRed();
  console.log("[test-retention] all passed.");
}

main();
