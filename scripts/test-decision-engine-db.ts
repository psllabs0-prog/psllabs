/**
 * DB smoke for decision engine schema + lifecycle upsert.
 * Run: npm run test:decision-engine-db
 */
import { loadEnvLocal } from "./_env";
import {
  ensureDecisionEngineSchema,
  DECISION_ENGINE_TABLES,
} from "@/lib/decision-engine/schema";
import {
  acknowledgeDecisionSignal,
  dismissDecisionSignal,
  getDecisionSignalByKey,
  markDecisionSignalResolved,
  resolveMissingAutoSignals,
  upsertDecisionSignal,
} from "@/lib/decision-engine/store";
import { getSql } from "@/lib/db/sql";
import type { DecisionCandidate } from "@/lib/decision-engine/types";

loadEnvLocal();

function sample(key: string): DecisionCandidate {
  return {
    signalKey: key,
    signalType: "TEST_SIGNAL",
    area: "system_health",
    priority: "P2",
    confidence: "early",
    title: "Test decision signal",
    decision: "Review test signal",
    summary: "DB lifecycle test",
    recommendation: "Acknowledge or resolve — test only",
    recommendedOwner: "luke",
    why: "Exercise upsert lifecycle",
    expectedUpside: "n/a",
    mainRisks: ["test"],
    opportunityCost: "n/a",
    whatCouldMakeWrong: ["fixture"],
    dataNeeded: ["none"],
    nextAction: "resolve",
    evidence: [
      {
        sourceClass: "system_health",
        label: "test",
        detail: "fixture evidence",
      },
    ],
    sourceHref: "/admin-decisions",
    autoResolveWhenGone: true,
  };
}

async function main() {
  console.log("[test:decision-engine-db] running…");
  await ensureDecisionEngineSchema();
  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${DECISION_ENGINE_TABLES as unknown as string[]})
  `) as Array<{ table_name: string }>;
  if (tables.length < DECISION_ENGINE_TABLES.length) {
    throw new Error("decision engine tables missing");
  }

  const key = `test:lifecycle:${Date.now()}`;
  const a = await upsertDecisionSignal(sample(key));
  if (!a.created) throw new Error("first upsert should create");
  const b = await upsertDecisionSignal(sample(key));
  if (b.created) throw new Error("second upsert must not create duplicate");

  const row = await getDecisionSignalByKey(key);
  if (!row || row.status !== "active") throw new Error("expected active");

  await acknowledgeDecisionSignal(key);
  const ack = await getDecisionSignalByKey(key);
  if (ack?.status !== "acknowledged") throw new Error("acknowledge failed");

  // Condition gone + healthy sources => auto-resolve
  const {
    emptySourceHealth,
    markSourceOk,
    markSourceFailed,
  } = await import("@/lib/decision-engine/source-health");
  const healthy = emptySourceHealth();
  for (const k of Object.keys(healthy) as Array<keyof typeof healthy>) {
    markSourceOk(healthy, k);
  }
  const resolved = await resolveMissingAutoSignals(new Set(), healthy);
  if (resolved < 1) throw new Error("auto-resolve should clear missing auto signals");
  const after = await getDecisionSignalByKey(key);
  if (after?.status !== "resolved") throw new Error("expected resolved");

  // Source-aware: inventory unavailable must NOT resolve inventory-dependent signal
  const invKey = `${key}:inv`;
  const invSample: DecisionCandidate = {
    ...sample(invKey),
    signalType: "INVENTORY_DEMAND_RISK",
    area: "inventory",
    evidence: [
      {
        sourceClass: "inventory",
        label: "coverage",
        detail: "test inventory evidence",
      },
    ],
  };
  await upsertDecisionSignal(invSample);
  const unhealthy = emptySourceHealth();
  for (const k of Object.keys(unhealthy) as Array<keyof typeof unhealthy>) {
    markSourceOk(unhealthy, k);
  }
  markSourceFailed(unhealthy, "inventory", new Error("read failed"));
  const blocked = await resolveMissingAutoSignals(new Set(), unhealthy);
  const stillActive = await getDecisionSignalByKey(invKey);
  if (stillActive?.status !== "active" && stillActive?.status !== "acknowledged") {
    throw new Error("inventory-unavailable must not auto-resolve inventory signal");
  }
  // cleanup
  await markDecisionSignalResolved(invKey);
  void blocked;

  // Reappear
  const re = await upsertDecisionSignal(sample(key));
  if (!re.reactivated) throw new Error("should reactivate resolved");
  const live = await getDecisionSignalByKey(key);
  if (live?.status !== "active") throw new Error("reactivated should be active");

  await dismissDecisionSignal(key);
  const dismissed = await getDecisionSignalByKey(key);
  if (dismissed?.status !== "dismissed") throw new Error("dismiss retained");

  // Dismissed stays dismissed on upsert
  await upsertDecisionSignal(sample(key));
  const still = await getDecisionSignalByKey(key);
  if (still?.status !== "dismissed") throw new Error("dismissed must remain");

  // Manual resolve path on a fresh key
  const key2 = `${key}:r2`;
  await upsertDecisionSignal(sample(key2));
  await markDecisionSignalResolved(key2);
  const r2 = await getDecisionSignalByKey(key2);
  if (r2?.status !== "resolved") throw new Error("manual resolve failed");

  console.log("[test:decision-engine-db] all passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
