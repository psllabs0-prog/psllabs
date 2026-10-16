/** Actual fulfillment service with isolated in-memory persistence and provider fixtures only. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { BtcpostageApiError } from "../lib/btcpostage/client";
import * as guards from "../lib/btcpostage/shipping-guard";
import { DEFAULT_PACKAGE, type BtcpostageLabelRecord, type BtcpostagePurchase, type BtcpostageRate } from "../lib/btcpostage/types";
import * as shippingPolicy from "../lib/shipping/policy";
import { isPhysicalUSShippingAddress } from "../lib/shipping/request";
import type { Order } from "../lib/orders/types";
import type { ShippingSelection } from "../lib/shipping/types";

let checks = 0, externalCalls = 0;
const check = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); checks++; };
const selection: ShippingSelection = {
  method: "priority", carrier: "USPS", providerServiceCode: "Priority", serviceDisplayName: "USPS Priority Mail",
  transitDays: 2, deliveryEstimate: "Estimated 2 business days; not guaranteed.", quotedPostageUsd: 9.61,
  package: { weightOz: 8, lengthIn: 6, widthIn: 4, heightIn: 3 },
  quotedAt: "2026-10-15T12:00:00.000Z", quoteExpiresAt: "2026-10-15T12:05:00.000Z",
};
const order = {
  orderId: "psl_offline_recovery", status: "paid", trackingNumber: null, currency: "USD", shippingCost: 22.99,
  shipping: { firstName: "Fixture", lastName: "Buyer", address: "1 Fixture Street", city: "Phoenix", state: "AZ", zip: "85016", country: "US", selection },
} as Order;
const purchase = (): BtcpostagePurchase => ({
  orderId: "btcp_fixture", orderTimestamp: null, remainingCredits: null, orderNotes: `PSL ${order.orderId}`,
  items: [{ shipmentId: "shipment_fixture", carrier: "usps", service: "Priority", price: "9.61", currency: "USD",
    filename: "https://fixture.invalid/label.pdf", trackingNo: "OFFLINE-NOT-A-SHIPMENT", toName: "Fixture Buyer" }],
});
const record = (status: BtcpostageLabelRecord["purchaseStatus"] = "none"): BtcpostageLabelRecord => ({
  pslOrderId: order.orderId, purchaseStatus: status, btcpOrderId: null, shipmentId: null, carrier: null, service: null,
  postageCost: null, trackingNumber: null, labelUrl: null, labelFormat: null, testMode: false,
  purchasedAt: null, purchaseClaimedAt: null, lastError: null, verifiedStreet1: null, verifiedStreet2: null,
  verifiedCity: null, verifiedState: null, verifiedZip: null, verifiedCountry: null,
  weightLbs: 0, weightOz: 8, heightIn: 3, widthIn: 4, depthIn: 6, updatedAt: null,
});

function harness(options: { returned?: BtcpostagePurchase; existing?: BtcpostageLabelRecord | null; retrieveFailure?: boolean; createFailure?: boolean; saveFailure?: boolean; legacy?: boolean;
  trackingNumber?: string; shipped?: boolean;
  rates?: BtcpostageRate[]; rateFailure?: boolean; fromZip?: string; fromCountry?: string; toCountry?: string; reserve?: string; standard?: boolean } = {}) {
  let saved = options.existing === undefined ? null : structuredClone(options.existing);
  let creates = 0, retrieves = 0, successes = 0, claims = 0, rateReads = 0;
  const calls: string[] = [];
  const returned = options.returned ?? (options.standard ? { ...purchase(), items: [{ ...purchase().items[0], service: "GroundAdvantage" }] } : purchase());
  const currentOrder = { ...order, trackingNumber: options.trackingNumber ?? order.trackingNumber, status: options.shipped ? "shipped" : order.status, shipping: { ...order.shipping, country: options.toCountry ?? "US",
    selection: options.legacy ? undefined : options.standard ? shippingPolicy.standardShippingSelection() : selection } };
  const mocks: Record<string, unknown> = {
    "@/lib/orders/store": { getOrder: async () => currentOrder },
    "@/lib/shipping/policy": shippingPolicy,
    "@/lib/shipping/request": { isPhysicalUSShippingAddress },
    "./types": { DEFAULT_PACKAGE }, "./shipping-guard": guards,
    "./config": { isBtcpostageTestMode: () => false, getBtcpostageFromAddress: () => ({ street1: "1 Fixture Origin", city: "Phoenix", state: "AZ", zip: options.fromZip ?? "85016", country: options.fromCountry ?? "US" }) },
    "./client": {
      BtcpostageApiError,
      createPurchase: async (input: { orderNotes: string }) => {
        creates++; calls.push("purchase"); check(input.orderNotes, `PSL ${order.orderId}`, "paid request carries exact PSL order reference");
        if (options.createFailure) throw new BtcpostageApiError("Fixture uncertain transport", { uncertain: true });
        return returned;
      },
      retrievePurchase: async () => { retrieves++; if (options.retrieveFailure) throw new Error("Fixture retrieval timeout"); return returned; },
      getRates: async (input: { pkg: { weightOz: number; depthIn: number; widthIn: number; heightIn: number }; from: { zip: string }; to: { zip: string }; carrier: string }) => {
        rateReads++; calls.push("rates");
        check({ ...input.pkg }, { ...DEFAULT_PACKAGE, weightOz: 8 }, "purchase refresh uses the conservative quoted 8 oz package");
        check(input.from.zip, "85016", "fresh quote retains the verified origin");
        check(input.to.zip, "85016", "fresh quote uses the actual resolved destination");
        check(input.carrier, "USPS", "fresh quote is USPS only");
        if (options.rateFailure) throw new Error("Fixture rate timeout");
        return options.rates ?? [{ service: "Priority", carrier: "USPS", currency: "USD", rate: "9.61", serviceDisplay: "Priority Mail", estDeliveryDays: 2 }];
      },
      verifyAddress: async () => { throw new Error("Address mutation must not run in purchase/recovery fixtures"); },
    },
    "./store": {
      getBtcpostageLabel: async () => saved,
      ensureLabelRow: async () => { saved ??= record(); },
      claimLabelPurchase: async () => {
        claims++; calls.push("claim"); saved ??= record();
        if (saved.purchaseStatus === "needs_review") return { ok: false, reason: "needs_review", label: saved };
        if (saved.purchaseStatus === "purchased") return { ok: false, reason: "already_purchased", label: saved };
        if (saved.purchaseStatus === "purchasing") return { ok: false, reason: "in_flight", label: saved };
        saved.purchaseStatus = "purchasing"; return { ok: true };
      },
      markPurchaseSucceeded: async (input: Record<string, unknown>) => {
        if (options.saveFailure) throw new Error("Fixture database lost response after paid purchase");
        successes++; saved = { ...record("purchased"), ...input, purchaseStatus: "purchased" } as BtcpostageLabelRecord; return saved;
      },
      markPurchaseNeedsReview: async (_id: string, error: string, partial?: { btcpOrderId?: string | null }) => {
        assert(saved, "needs-review must retain an actual durable label row");
        saved.purchaseStatus = "needs_review"; saved.lastError = error;
        if (partial?.btcpOrderId) saved.btcpOrderId = partial.btcpOrderId;
      },
      markPurchaseFailed: async () => { assert(saved); saved.purchaseStatus = "failed"; },
      saveVerifiedAddress: async () => { throw new Error("Address writes are forbidden in this fixture"); },
      toPublicLabel: (value: BtcpostageLabelRecord) => ({ purchaseStatus: value.purchaseStatus, service: value.service }),
    },
  };
  const source = readFileSync(new URL("../lib/btcpostage/service.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const output: Record<string, unknown> = {};
  const run = new Script(`(function(require,module,exports){${compiled}\n})`).runInContext(createContext({ console, Error,
    process: { env: { PSL_PRIORITY_SHIPPING_ENABLED: "false", PSL_PRIORITY_EXTRA_COST_RESERVE_USD: options.reserve } } }));
  run((id: string) => { assert(id in mocks, `Unknown offline dependency ${id}`); return mocks[id]; }, { exports: output }, output);
  return {
    buy: () => (output.buyOrderLabel as (input: unknown) => Promise<unknown>)({ orderId: order.orderId, carrier: "USPS", service: options.standard ? "GroundAdvantage" : "Priority", confirmPurchase: true, pkg: { ...DEFAULT_PACKAGE, weightOz: 8 } }),
    recover: (id = "btcp_fixture") => (output.recoverOrderPurchase as (input: unknown) => Promise<unknown>)({ orderId: order.orderId, btcpOrderId: id }),
    state: () => ({ creates, retrieves, successes, claims, rateReads, calls, saved }),
  };
}

async function main() {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { externalCalls++; throw new Error("External network is forbidden in recovery tests"); };
  try {
    const good = harness(); await good.buy();
    check(good.state().successes, 1, "exact returned Priority service can be saved");
    check(good.state().calls, ["claim", "rates", "purchase"], "fresh carrier cost is verified immediately before the paid request");
    await good.buy(); check(good.state().creates, 1, "a purchased label is not purchased twice");
    check(good.state().rateReads, 1, "a purchased label is not requoted or rebought");

    const baseRate: BtcpostageRate = { service: "Priority", carrier: "USPS", currency: "USD", rate: "9.61", serviceDisplay: "Priority Mail", estDeliveryDays: 2 };
    for (const rates of [[], [{ ...baseRate, rate: "20.49" }], [{ ...baseRate, rate: "29.28" }],
      [{ ...baseRate, currency: "EUR" }], [{ ...baseRate, carrier: "UPS" }],
      [{ ...baseRate, service: "GroundAdvantage" }], [{ ...baseRate, service: "Express" }],
      [{ ...baseRate, rate: "not-a-price" }], [baseRate, baseRate]]) {
      const h = harness({ rates }); await assert.rejects(h.buy(), /review.*No label was purchased/i); checks++;
      check(h.state().creates, 0, "unavailable, mismatched or uncovered current postage stops before any paid provider request");
      check(h.state().saved?.purchaseStatus, "needs_review", "current quote failures are held for explicit review");
      await assert.rejects(h.buy(), /review/i); checks++;
      check(h.state().rateReads, 1, "a held attempt cannot repeat purchase or quotation blindly");
    }
    const exactCeiling = harness({ rates: [{ ...baseRate, rate: "20.48" }] }); await exactCeiling.buy();
    check(exactCeiling.state().successes, 1, "$20.48 postage + $0.51 packaging + $2 reserve exactly fits $22.99");
    for (const rate of ["11.06", "16.18", "19.28"]) {
      const covered = harness({ rates: [{ ...baseRate, rate }] }); await covered.buy();
      check(covered.state().successes, 1, "the approved $22.99 tier covers the sampled LA, NYC, and HI/AK postage with packaging and reserve");
    }
    for (const options of [{ fromZip: "10007" }, { fromCountry: "CA" }, { toCountry: "CA" },
      { reserve: "-1" }, { reserve: "invalid" }, { reserve: "Infinity" }]) {
      const h = harness(options); await assert.rejects(h.buy(), /review.*No label was purchased/i); checks++;
      check(h.state().rateReads, 0, "bad origin/destination/reserve stops before carrier quotation");
      check(h.state().creates, 0, "bad fulfillment context cannot purchase a label");
      check(h.state().saved?.purchaseStatus, "needs_review", "bad fulfillment context is held for review");
    }
    const timedOut = harness({ rateFailure: true }); await assert.rejects(timedOut.buy(), /No label was purchased/i); checks++;
    check(timedOut.state().creates, 0, "a current-rate timeout cannot purchase a label");
    check(timedOut.state().saved?.purchaseStatus, "needs_review", "a current-rate timeout is held for review");
    const configuredReserve = harness({ reserve: "15" }); await assert.rejects(configuredReserve.buy(), /No label was purchased/i); checks++;
    check(configuredReserve.state().creates, 0, "current configured reserve is honored even while new Priority offers are paused");
    const standard = harness({ standard: true }); await standard.buy();
    check(standard.state().rateReads, 0, "standard shipment workflow does not acquire a new cost rule");
    check(standard.state().creates, 1, "the current standard label workflow is preserved");

    for (const changed of [
      { ...purchase(), items: [{ ...purchase().items[0], service: "GroundAdvantage" }] },
      { ...purchase(), items: [{ ...purchase().items[0], carrier: "UPS" }] },
      { ...purchase(), items: [{ ...purchase().items[0], toName: "Unrelated Recipient" }] },
      { ...purchase(), orderNotes: "PSL unrelated_order" },
      { ...purchase(), items: [purchase().items[0], purchase().items[0]] },
    ]) {
      const h = harness({ returned: changed }); await assert.rejects(h.buy(), /uncertain|review/i); checks++;
      check(h.state().successes, 0, "mismatching returned shipment never becomes successful");
      check(h.state().saved?.purchaseStatus, "needs_review", "mismatch retains duplicate-buy protection");
      check(h.state().saved?.btcpOrderId, "btcp_fixture", "the known returned provider ID survives for recovery");
      await assert.rejects(h.buy(), /review|uncertain/i); checks++;
      check(h.state().creates, 1, "retry cannot dispatch a second paid purchase");
    }

    const uncertain = harness({ createFailure: true }); await assert.rejects(uncertain.buy()); checks++;
    await assert.rejects(uncertain.buy(), /review|uncertain/i); checks++;
    check(uncertain.state().creates, 1, "uncertain provider failure cannot be blindly repurchased");

    const persistence = harness({ saveFailure: true }); await assert.rejects(persistence.buy(), /uncertain/i); checks++;
    check(persistence.state().saved?.purchaseStatus, "needs_review", "database failure after accepted paid purchase never becomes retryable");
    check(persistence.state().saved?.btcpOrderId, "btcp_fixture", "known paid provider ID retained after database failure");
    await assert.rejects(persistence.buy(), /review|uncertain/i); checks++;
    check(persistence.state().creates, 1, "post-success database failure cannot trigger a second paid request");

    const incomplete = { ...record("purchased"), btcpOrderId: "btcp_fixture", carrier: "USPS", service: "Priority", trackingNumber: "OFFLINE-NOT-A-SHIPMENT", labelUrl: null };
    for (const shipped of [false, true]) {
      const repair = harness({ existing: incomplete, trackingNumber: "OFFLINE-NOT-A-SHIPMENT", shipped });
      await repair.recover();
      check(repair.state().retrieves, 1, "missing label PDF can be retrieved even after matching tracking is saved");
      check(repair.state().creates, 0, "incomplete purchase repair never buys a replacement");
    }
    const conflict = harness({ existing: incomplete, trackingNumber: "DIFFERENT-SAVED-TRACKING" });
    await assert.rejects(conflict.recover(), /tracking differs/i); checks++;
    check(conflict.state().successes, 0, "recovery cannot overwrite a different saved shipment");

    const recovered = harness(); await recovered.recover();
    check(recovered.state().successes, 1, "manual recovery with exact returned PSL reference and service succeeds");
    check(recovered.state().creates, 0, "recovery does not create a provider purchase");

    for (const changed of [
      { ...purchase(), items: [{ ...purchase().items[0], service: "GroundAdvantage" }] },
      { ...purchase(), orderNotes: null },
      { ...purchase(), orderNotes: "PSL unrelated_order" },
      { ...purchase(), orderId: "different_purchase" },
    ]) {
      const h = harness({ returned: changed }); await assert.rejects(h.recover(), /review/i); checks++;
      check(h.state().successes, 0, "unverified/manual recovered shipment is never attached");
      check(h.state().saved?.purchaseStatus, "needs_review", "unverified recovery is durably blocked from repurchase");
      check(h.state().saved?.btcpOrderId, null, "an unverified manually entered ID is not promoted to a saved identity binding");
      await assert.rejects(h.buy(), /review/i); checks++;
      check(h.state().creates, 0, "failed recovery cannot enable a replacement paid call");
    }

    const known = { ...record("needs_review"), btcpOrderId: "btcp_fixture" };
    const knownRecovery = harness({ existing: known, returned: { ...purchase(), orderNotes: null } });
    await knownRecovery.recover(); check(knownRecovery.state().successes, 1, "previously recorded provider identity can recover without echoed notes");
    const knownWrong = harness({ existing: known, returned: { ...purchase(), orderNotes: "PSL unrelated_order" } });
    await assert.rejects(knownWrong.recover(), /different PSL order/i); checks++;
    check(knownWrong.state().successes, 0, "a prior binding never overrides contradictory returned evidence");

    const timeout = harness({ retrieveFailure: true }); await assert.rejects(timeout.recover(), /timeout/i); checks++;
    check(timeout.state().saved?.purchaseStatus, "needs_review", "retrieval failure preserves duplicate protection");
    await assert.rejects(timeout.buy(), /review/i); checks++;
    check(timeout.state().creates, 0, "retrieval timeout cannot dispatch a new purchase");

    const wrongStored = harness({ existing: { ...record("purchased"), carrier: "USPS", service: "GroundAdvantage" } });
    await assert.rejects(wrongStored.recover(), /stored label does not match/i); checks++;
    check(wrongStored.state().creates, 0, "an old mismatching stored label cannot trigger repurchase");

    const legacy = harness({ legacy: true, returned: { ...purchase(), items: [{ ...purchase().items[0], service: "GroundAdvantage" }] } });
    await legacy.recover(); check(legacy.state().successes, 1, "legacy shipping remains manual when recovered identity is verified");
    check(externalCalls, 0, "every provider call and persistence effect stayed inside offline fixtures");
  } finally { globalThis.fetch = oldFetch; }
  console.log(`PASS: shipping purchase/recovery (${checks} offline checks; exact returned services, order identity, uncertain recovery and no duplicate purchases; no real labels, orders, payments or network).`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
