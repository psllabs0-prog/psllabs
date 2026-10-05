import assert from "node:assert/strict";
import { summarizeCustomerIntelligence } from "../lib/ceo-brief/customer-intelligence";
import { signalsForSnapshot, type CustomerIntelSnapshotEvidence } from "../lib/customer-intelligence/signal-freshness";
import type { CustomerIntelSignalRow } from "../lib/customer-intelligence/signals-store";

const signal: CustomerIntelSignalRow = {
  id: 11, signalKey: "support:payment_friction", signalType: "support_category",
  theme: "payment_friction", evidenceClass: "customer", productSku: null,
  sourceChannel: "support", currentCount: 3, priorCount: 0, sampleSize: 3,
  confidenceLevel: "early_signal", firstSeenAt: "2026-09-20T10:40:57Z",
  lastSeenAt: "2026-09-20T10:40:57Z", status: "early",
  recommendation: "CHECKOUT_FRICTION_REVIEW", evidenceJson: { inferredOnly: true },
};
const latest: CustomerIntelSnapshotEvidence = {
  periodStart: "2026-09-07", periodEnd: "2026-10-04", generatedAt: "2026-10-05T12:23:04Z",
  snapshot: { evidenceHealth: { supportCurrent: 0, feedbackCurrent: 0, communityCurrent: 1 }, recommendations: [] },
};

// Production incident: historical September signal remained after the source
// observations disappeared, but October's completed scan recorded zero.
const empty = summarizeCustomerIntelligence([signal], latest);
assert.equal(empty.status, "available");
assert.equal(empty.lukeAction, null);
assert.match(empty.highlights[0], /No qualifying customer support or post-order feedback/);
assert.match(empty.highlights[0], /2026-09-07–2026-10-04 \(28-day UTC window\)/);
assert.ok(!empty.highlights.join(" ").includes("payment friction"));

const current = { ...signal, lastSeenAt: "2026-10-05T12:23:00Z", evidenceJson: { periodStart: latest.periodStart, periodEnd: latest.periodEnd } };
const currentSnapshot = {
  ...latest,
  snapshot: { evidenceHealth: { supportCurrent: 3, feedbackCurrent: 0 }, signalKeys: [signal.signalKey] },
};
const fresh = summarizeCustomerIntelligence([current], currentSnapshot);
assert.equal(fresh.status, "available");
assert.match(fresh.highlights[0], /3 support messages classified as payment friction/);
assert.match(fresh.highlights[0], /28-day UTC window/);
assert.ok(fresh.lukeAction?.action.includes("CHECKOUT_FRICTION_REVIEW"));

// A newer partial scan cannot make the prior completed snapshot appear fresh.
assert.deepEqual(signalsForSnapshot([{ ...current, lastSeenAt: "2026-10-05T12:24:00Z" }], currentSnapshot), []);
assert.deepEqual(signalsForSnapshot([{ ...current, evidenceJson: { periodStart: "2026-09-06", periodEnd: "2026-10-03" } }], currentSnapshot), []);
assert.deepEqual(signalsForSnapshot([current], { ...currentSnapshot, snapshot: { ...currentSnapshot.snapshot, signalKeys: [] } }), []);
assert.deepEqual(signalsForSnapshot([{ ...current, currentCount: 0 }], currentSnapshot), []);

// Legacy snapshots must explicitly corroborate current recommendations; matching
// a theme from an old signal without current evidence is insufficient.
const legacyCurrent = {
  ...latest,
  snapshot: {
    evidenceHealth: { supportCurrent: 3, feedbackCurrent: 0 },
    recommendations: [{ evidenceClass: "customer", theme: signal.theme, recommendation: signal.recommendation, sampleSize: 3 }],
  },
};
assert.equal(signalsForSnapshot([current], legacyCurrent).length, 1);
assert.deepEqual(signalsForSnapshot([signal], legacyCurrent), []);
assert.deepEqual(signalsForSnapshot([{ ...current, currentCount: 4 }], legacyCurrent), []);

for (const status of ["resolved", "dismissed"] as const) {
  assert.equal(summarizeCustomerIntelligence([{ ...current, status }], currentSnapshot).lukeAction, null);
}
assert.equal(summarizeCustomerIntelligence([signal], null).status, "unavailable");
const unknown = summarizeCustomerIntelligence([signal], { ...latest, snapshot: {} });
assert.equal(unknown.status, "unavailable", "missing counts must never be reported as zero");
assert.equal(unknown.highlights.length, 0);

const community = { ...current, signalKey: "community:shipping_question", theme: "shipping_question", evidenceClass: "community" as const, sourceChannel: "discord" };
const communitySnapshot = { ...latest, snapshot: { signalKeys: [community.signalKey], evidenceHealth: { supportCurrent: 0, feedbackCurrent: 0, communityCurrent: 3 } } };
assert.match(summarizeCustomerIntelligence([community], communitySnapshot).highlights[0], /community evidence, not customer sample/);
assert.ok(!summarizeCustomerIntelligence([{ ...community, status: "resolved" }], communitySnapshot).highlights.join(" ").includes("community questions"));
const restricted = { ...current, theme: "restricted_human_use_request" };
assert.equal(summarizeCustomerIntelligence([restricted], currentSnapshot).lukeAction, null);
console.log("[test-customer-intelligence-freshness] all assertions passed");
