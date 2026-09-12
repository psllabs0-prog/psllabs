/**
 * Offline tests for unified ops exception center.
 * Run: npm run test:ops
 */
import {
  applyAcknowledgements,
  inventorySkuToOpsCandidate,
  priorityOutranks,
  supportEscalationEligible,
  type RawOpsException,
} from "../lib/ops/exceptions";
import { topOpsActions, type OpsException } from "../lib/ops/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function testSupportExclusions() {
  assert(
    supportEscalationEligible({
      reportingExcluded: true,
      category: "refund_request",
      status: "escalated",
    }) === false,
    "TEST/EXCLUDED out"
  );
  assert(
    supportEscalationEligible({
      reportingExcluded: false,
      category: "spam_solicitation",
      status: "ignored",
    }) === false,
    "spam out"
  );
  assert(
    supportEscalationEligible({
      reportingExcluded: false,
      category: "vendor_solicitation",
      status: "ignored",
    }) === false,
    "vendor out"
  );
  assert(
    supportEscalationEligible({
      reportingExcluded: false,
      category: "refund_request",
      status: "escalated",
    }) === true,
    "legitimate in"
  );
}

function testTesaInboundNoAction() {
  const candidate = inventorySkuToOpsCandidate({
    handle: "tesamorelin",
    sku: "TESA",
    name: "Tesamorelin",
    sellableUnits: 9,
    orderedInbound: 30,
    inTransit: 0,
    awaitingTesting: 0,
    inboundPipelineTotal: 30,
    forecastConfidence: "INSUFFICIENT_SALES_DATA",
    statusFlags: ["ABSOLUTE_LOW_STOCK", "INSUFFICIENT_SALES_DATA"],
  });
  assert(candidate === null, "tesa inbound+insufficient not ops action");
}

function testAwaitingTestingCanAction() {
  // awaiting-testing lots are separate source_type in live collector;
  // reorder path still requires validated risk without inbound.
  const candidate = inventorySkuToOpsCandidate({
    handle: "bpc-157",
    sku: "BPC",
    name: "BPC-157",
    sellableUnits: 2,
    orderedInbound: 0,
    inTransit: 0,
    awaitingTesting: 0,
    inboundPipelineTotal: 0,
    forecastConfidence: "RELIABLE",
    statusFlags: ["ABSOLUTE_LOW_STOCK", "REORDER_REVIEW"],
  });
  assert(candidate !== null, "validated low stock can be action");
}

function testPriorityOrdering() {
  assert(priorityOutranks("P0", "P3") === true, "P0 > P3");
  assert(priorityOutranks("P1", "P3") === true, "RED/payment > SEO");
  assert(priorityOutranks("P3", "P1") === false, "SEO does not outrank RED");

  const raw: RawOpsException[] = [
    {
      sourceType: "external_metric_sync",
      sourceId: "1",
      priority: "P3",
      area: "data",
      title: "SEO connector",
      why: "gsc",
      detectedAt: "2026-09-01T00:00:00.000Z",
      href: "/admin-data",
    },
    {
      sourceType: "support_escalation",
      sourceId: "2",
      priority: "P1",
      area: "support",
      title: "RED support",
      why: "customer",
      detectedAt: "2026-09-02T00:00:00.000Z",
      href: "/admin-support",
    },
    {
      sourceType: "finance_job_failure",
      sourceId: "3",
      priority: "P0",
      area: "finance",
      title: "Payment job failed",
      why: "provider",
      detectedAt: "2026-09-03T00:00:00.000Z",
      href: "/admin-finance",
    },
  ];
  const ranked = applyAcknowledgements(raw, []);
  assert(ranked[0].priority === "P0", "payment first");
  assert(ranked[1].priority === "P1", "RED second");
  assert(ranked[2].priority === "P3", "SEO last");
}

function testAckAndResolveDisappear() {
  const raw: RawOpsException[] = [
    {
      sourceType: "support_escalation",
      sourceId: "9",
      priority: "P2",
      area: "support",
      title: "YELLOW",
      why: "review",
      detectedAt: "2026-09-01T00:00:00.000Z",
      href: "/admin-support",
    },
  ];
  const withAck = applyAcknowledgements(raw, [
    {
      sourceType: "support_escalation",
      sourceId: "9",
      acknowledgedAt: "2026-09-02T00:00:00.000Z",
      note: "looking",
    },
  ]);
  assert(withAck[0].acknowledged === true, "ack visible");
  const top = topOpsActions(withAck, 3);
  assert(top.length === 0, "acked filtered from top actions");

  // Authoritative issue gone → empty raw list
  const gone = applyAcknowledgements([], [
    {
      sourceType: "support_escalation",
      sourceId: "9",
      acknowledgedAt: "2026-09-02T00:00:00.000Z",
      note: null,
    },
  ]);
  assert(gone.length === 0, "resolved authoritative disappears");
}

function testMaxThreeAndZeroData() {
  const many: OpsException[] = Array.from({ length: 5 }).map((_, i) => ({
    sourceType: "x",
    sourceId: String(i),
    priority: i === 0 ? "P0" : i < 3 ? "P1" : "P2",
    area: "system",
    title: `item ${i}`,
    why: "n",
    detectedAt: `2026-09-0${i + 1}T00:00:00.000Z`,
    href: "/admin-ops",
    acknowledged: false,
    acknowledgedAt: null,
    note: null,
  })) as OpsException[];

  assert(topOpsActions(many, 3).length === 3, "≤3 owner actions");
  assert(topOpsActions([], 3).length === 0, "zero-data no actions");
}

function main() {
  console.log("[test-ops] running…");
  testSupportExclusions();
  testTesaInboundNoAction();
  testAwaitingTestingCanAction();
  testPriorityOrdering();
  testAckAndResolveDisappear();
  testMaxThreeAndZeroData();
  console.log("[test-ops] all passed.");
}

main();
