/**
 * Offline tests for Mission Control (shared activity records + worker status).
 * Run: npm run test:mission-control
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  normalizeActivityEvent,
  parseActivityCursor,
  sanitizeActivitySummary,
} from "../lib/ops/mission-control/events";
import {
  ACTIVITY_SOURCES,
  describeSourceError,
  mapBtcpostageLabel,
  mapCeoBrief,
  mapDecisionEngineRun,
  mapDiscordInteraction,
  mapExternalMetricSyncRun,
  mapFinanceJobRun,
  mapFulfillmentWorkflow,
  mapInventorySnapshotDay,
  mapOrderShipped,
  mapSupportEscalation,
  mapSupportJobRun,
} from "../lib/ops/mission-control/projectors";
import {
  SCHEDULED_JOBS,
  cronIntervalMinutes,
  nextCronRun,
} from "../lib/ops/mission-control/schedule";
import { buildPipeline } from "../lib/ops/mission-control/snapshot";
import type {
  ActivityEventInput,
  WorkerCard,
} from "../lib/ops/mission-control/types";
import {
  buildWorkerCard,
  deriveWorkerStatus,
  type WorkerObservation,
} from "../lib/ops/mission-control/workers";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const NOW = new Date("2026-09-28T18:00:00.000Z");

function testSanitize() {
  const s = sanitizeActivitySummary(
    "Failed for jane.doe@example.com  phone 15551234567 https://x.test/l?token=abc"
  );
  assert(!s.includes("@"), "email stripped");
  assert(!s.includes("15551234567"), "long digits stripped");
  assert(!s.includes("token=abc"), "url query stripped");
  assert(!/\s{2,}/.test(s), "whitespace collapsed");
  const long = sanitizeActivitySummary("x".repeat(1000));
  assert(long.length === 280, "truncated to 280");
}

function baseEvent(): ActivityEventInput {
  return {
    sourceEventKey: "k:1",
    sourceSystem: "t",
    worker: "support",
    eventType: "e",
    outcome: "completed",
    observation: "run_log",
    occurredAt: "2026-09-28T10:00:00Z",
    summary: "ok",
  };
}

function testNormalize() {
  assert(normalizeActivityEvent(baseEvent()) !== null, "valid event accepted");
  assert(
    normalizeActivityEvent({ ...baseEvent(), sourceEventKey: " " }) === null,
    "empty key rejected"
  );
  assert(
    normalizeActivityEvent({ ...baseEvent(), occurredAt: "not a date" }) === null,
    "invalid timestamp rejected (never invent one)"
  );
  assert(
    normalizeActivityEvent({
      ...baseEvent(),
      worker: "social_publisher" as ActivityEventInput["worker"],
    }) === null,
    "unregistered worker rejected"
  );
  assert(
    normalizeActivityEvent({
      ...baseEvent(),
      outcome: "published" as ActivityEventInput["outcome"],
    }) === null,
    "unknown outcome rejected"
  );
  const n = normalizeActivityEvent({ ...baseEvent(), summary: "to a@b.co" });
  assert(n && n.summary === "to [email]", "normalize sanitizes summary");
}

function testCursor() {
  assert(parseActivityCursor(null) === null, "null cursor");
  assert(parseActivityCursor("42") === 42, "numeric cursor");
  assert(parseActivityCursor("-1") === null, "negative rejected");
  assert(parseActivityCursor("1;DROP") === null, "garbage rejected");
}

function testSupportRunMapping() {
  const ok = mapSupportJobRun({
    id: 5,
    finished_at: "2026-09-28T16:00:05Z",
    ok: true,
    messages_checked: 3,
    new_messages: 1,
    auto_sent: 0,
    escalated: 1,
    failed: 0,
    skipped: 2,
  });
  assert(ok.length === 1, "one finished event");
  assert(ok[0].sourceEventKey === "support_job_runs:5:finished", "stable key");
  assert(ok[0].outcome === "completed", "ok → completed");
  assert(
    Date.parse(ok[0].occurredAt) === Date.parse("2026-09-28T16:00:05Z"),
    "source timestamp kept"
  );

  const failed = mapSupportJobRun({
    id: 6,
    finished_at: "2026-09-28T17:00:00Z",
    ok: false,
    error_summary: "IMAP auth failed for support@psllabs.org",
  });
  const norm = normalizeActivityEvent(failed[0]);
  assert(norm?.outcome === "failed", "ok=false → failed");
  assert(norm && !norm.summary.includes("@"), "error summary sanitized");

  const unknown = mapSupportJobRun({ id: 7, finished_at: "2026-09-28T17:00:00Z", ok: null });
  assert(unknown[0].outcome === "outcome_unknown", "ok=null → outcome_unknown");

  assert(mapSupportJobRun({ id: 8, finished_at: null }).length === 0, "no timestamp → no event");
}

function testStartFinishDedupe() {
  const running = {
    id: 9,
    job_name: "finance_reconciliation",
    started_at: "2026-09-28T15:30:00Z",
    finished_at: null,
    status: "running",
  };
  const r1 = mapFinanceJobRun(running);
  assert(r1.length === 1 && r1[0].outcome === "started", "running → started only");

  const done = { ...running, finished_at: "2026-09-28T15:31:00Z", status: "ok" };
  const r2 = mapFinanceJobRun(done);
  assert(r2.length === 2, "finished → started + finished");
  assert(r2[0].sourceEventKey === r1[0].sourceEventKey, "started key stable across syncs");
  assert(r2[1].sourceEventKey === "finance_job_runs:9:finished", "finished key");
  assert(r2[0].correlationId === r2[1].correlationId, "shared correlation id");

  const again = mapFinanceJobRun(done).map((e) => e.sourceEventKey);
  assert(
    JSON.stringify(again) === JSON.stringify(r2.map((e) => e.sourceEventKey)),
    "re-mapping yields identical keys (dedupe)"
  );

  const err = mapDecisionEngineRun({
    id: 1,
    started_at: "2026-09-28T17:00:00Z",
    completed_at: "2026-09-28T17:00:09Z",
    status: "error",
    error_summary: "boom",
  });
  assert(err[1].outcome === "failed" && err[1].summary.includes("boom"), "DE error → failed");

  const skipped = mapExternalMetricSyncRun({
    id: 2,
    provider: "meta_ads",
    started_at: "2026-09-28T11:00:00Z",
    completed_at: "2026-09-28T11:00:01Z",
    status: "not_configured",
  });
  assert(skipped[1].outcome === "skipped", "not_configured → skipped (not completed)");
}

function testRecordMappings() {
  const esc = mapSupportEscalation({
    id: 3,
    risk_level: "RED",
    created_at: "2026-09-27T10:00:00Z",
    resolved_at: "2026-09-27T12:00:00Z",
    reporting_excluded: true,
  });
  assert(esc.length === 2, "opened + resolved");
  assert(esc[0].outcome === "waiting", "opened escalation is waiting");
  assert(esc.every((e) => e.excluded), "excluded flag carried");

  const label = mapBtcpostageLabel({
    psl_order_id: "PSL-1",
    purchase_status: "needs_review",
    carrier: "USPS",
    service: "Priority",
    test_mode: true,
    purchased_at: null,
    updated_at: "2026-09-28T12:00:00Z",
  });
  assert(label.length === 1, "needs_review event only");
  assert(label[0].outcome === "outcome_unknown", "needs_review → outcome_unknown");
  assert(label[0].excluded && label[0].summary.startsWith("[test]"), "test label excluded");

  const hold = mapFulfillmentWorkflow({
    order_id: "PSL-2",
    workflow_status: "hold",
    packing_started_at: null,
    packed_at: null,
    updated_at: "2026-09-28T09:00:00Z",
  });
  assert(hold.length === 1 && hold[0].outcome === "waiting", "hold → waiting");
  assert(!hold[0].summary.includes("PSL-2"), "order id kept in source ref, not summary");

  const shipped = mapOrderShipped({
    order_id: "PSL-3",
    shipped_at: "2026-09-28T13:00:00Z",
    tracking_carrier: "USPS",
    reporting_excluded: false,
  });
  assert(shipped[0].summary === "Order marked shipped (USPS)", "shipped summary w/o tracking");

  const ceo = mapCeoBrief({
    id: 4,
    period_start: "2026-09-21T00:00:00Z",
    period_end: "2026-09-28T00:00:00Z",
    generated_at: "2026-09-28T15:00:00Z",
    email_sent_at: null,
  });
  assert(ceo.length === 1, "no email event without email_sent_at");

  const inv = mapInventorySnapshotDay({
    snapshot_date: "2026-09-28",
    sku_count: 6,
    recorded_at: "2026-09-28T15:00:03Z",
  });
  assert(inv[0].sourceEventKey === "inventory_monitor_snapshots:2026-09-28", "one event per day");

  const discord = mapDiscordInteraction({
    id: 10,
    command: "coa",
    category: null,
    outcome: null,
    reporting_excluded: false,
    created_at: "2026-09-28T10:00:00Z",
  });
  assert(discord[0].outcome === "outcome_unknown", "missing discord outcome → unknown");
}

function testSourcesRegistered() {
  const names = new Set(ACTIVITY_SOURCES.map((s) => s.name));
  assert(names.size === ACTIVITY_SOURCES.length, "unique source names");
  for (const expected of [
    "support_job_runs",
    "finance_job_runs",
    "decision_engine_runs",
    "ceo_weekly_briefs",
    "inventory_monitor_snapshots",
    "discord_interactions",
    "fulfillment_workflow",
    "content_briefs",
    "customer_intelligence_snapshots",
  ]) {
    assert(names.has(expected), `source registered: ${expected}`);
  }
  assert(
    describeSourceError(new Error('relation "btcpostage_labels" does not exist')) ===
      "Source table not present in this database",
    "missing table labelled as coverage gap"
  );
}

function testSchedule() {
  const daily = nextCronRun("0 16 * * *", new Date("2026-09-28T15:00:00Z"));
  assert(daily?.toISOString() === "2026-09-28T16:00:00.000Z", "daily later today");
  const atRun = nextCronRun("0 16 * * *", new Date("2026-09-28T16:00:00Z"));
  assert(atRun?.toISOString() === "2026-09-29T16:00:00.000Z", "exact run time → tomorrow");
  const weekly = nextCronRun("0 15 * * 1", new Date("2026-09-28T16:00:00Z"));
  assert(weekly && weekly.getUTCDay() === 1, "weekly lands on Monday");
  assert(
    weekly.getTime() - Date.parse("2026-09-28T16:00:00Z") < 7 * 24 * 3600 * 1000,
    "weekly within 7 days"
  );
  const sunday = nextCronRun("0 10 * * 7", new Date("2026-09-28T00:00:00Z"));
  assert(sunday && sunday.getUTCDay() === 0, "dow 7 = Sunday");
  assert(nextCronRun("*/5 * * * *", NOW) === null, "unsupported step → null, not guessed");
  assert(nextCronRun("0 0 1 * *", NOW) === null, "unsupported dom → null");
  assert(cronIntervalMinutes("30 15 * * *") === 1440, "daily interval");
  assert(cronIntervalMinutes("0 15 * * 1") === 10080, "weekly interval");
}

function testScheduleMatchesVercel() {
  const vercel = JSON.parse(
    readFileSync(join(process.cwd(), "vercel.json"), "utf8")
  ) as { crons: Array<{ path: string; schedule: string }> };
  const a = vercel.crons.map((c) => `${c.path} ${c.schedule}`).sort();
  const b = SCHEDULED_JOBS.map((j) => `${j.path} ${j.schedule}`).sort();
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `SCHEDULED_JOBS drifted from vercel.json:\n${a.join("\n")}\nvs\n${b.join("\n")}`
  );
}

function obs(partial: Partial<WorkerObservation>): WorkerObservation {
  return {
    enabled: true,
    coverage: "full",
    latestRun: null,
    lastSuccessAt: null,
    staleAfterMinutes: 2 * 24 * 60,
    waitingCount: 0,
    now: NOW,
    ...partial,
  };
}

function testWorkerStatus() {
  assert(deriveWorkerStatus(obs({ observationFailed: true })).status === "unknown", "query failure → unknown");
  assert(deriveWorkerStatus(obs({ enabled: false })).status === "disabled", "disabled");
  assert(
    deriveWorkerStatus(obs({ misconfigured: "missing token" })).status === "failed",
    "enabled but misconfigured → failed"
  );
  assert(deriveWorkerStatus(obs({ leaseHeld: true })).status === "running", "lease → running");
  assert(
    deriveWorkerStatus(
      obs({ latestRun: { startedAt: "2026-09-28T17:50:00Z", finishedAt: null, outcome: "running" } })
    ).status === "running",
    "recent running row → running"
  );
  const stuck = deriveWorkerStatus(
    obs({ latestRun: { startedAt: "2026-09-28T10:00:00Z", finishedAt: null, outcome: "running" } })
  );
  assert(stuck.status === "unknown" && /outcome unknown/.test(stuck.detail ?? ""), "stuck run → unknown");
  assert(
    deriveWorkerStatus(
      obs({ latestRun: { startedAt: null, finishedAt: "2026-09-28T17:00:00Z", outcome: "failed" } })
    ).status === "failed",
    "failed run → failed"
  );
  assert(
    deriveWorkerStatus(
      obs({
        latestRun: { startedAt: null, finishedAt: "2026-09-28T17:00:00Z", outcome: "ok" },
        lastSuccessAt: "2026-09-28T17:00:00Z",
        waitingCount: 2,
      })
    ).status === "waiting",
    "waiting items → waiting"
  );
  assert(deriveWorkerStatus(obs({})).status === "configured", "no runs → configured, not idle");
  assert(deriveWorkerStatus(obs({ coverage: "none" })).status === "unknown", "no log → unknown");
  assert(
    deriveWorkerStatus(
      obs({
        latestRun: { startedAt: null, finishedAt: "2026-09-20T00:00:00Z", outcome: "ok" },
        lastSuccessAt: "2026-09-20T00:00:00Z",
      })
    ).status === "stale",
    "old success → stale"
  );
  assert(
    deriveWorkerStatus(
      obs({
        latestRun: { startedAt: null, finishedAt: "2026-09-28T16:00:00Z", outcome: "ok" },
        lastSuccessAt: "2026-09-28T16:00:00Z",
      })
    ).status === "idle",
    "daily job between runs → idle (not running)"
  );
  assert(
    deriveWorkerStatus(
      obs({
        latestRun: { startedAt: null, finishedAt: "2026-09-28T16:00:00Z", outcome: "unknown" },
        lastSuccessAt: "2026-09-27T16:00:00Z",
      })
    ).status === "unknown",
    "outcome not recorded → unknown"
  );
  assert(
    deriveWorkerStatus(obs({ coverage: "human_queue", staleAfterMinutes: null })).status === "idle",
    "empty human queue → idle"
  );
}

function testEmptySystem() {
  const cards: WorkerCard[] = (
    ["support", "authority", "fulfillment", "discord"] as const
  ).map((w) =>
    buildWorkerCard(
      w,
      {
        observation: {
          enabled: w !== "discord",
          latestRun: null,
          lastSuccessAt: null,
          staleAfterMinutes: w === "support" ? 120 : null,
          waitingCount: 0,
        },
      },
      NOW
    )
  );
  const by = Object.fromEntries(cards.map((c) => [c.worker, c]));
  assert(by.support.status === "configured", "empty support → configured");
  assert(by.authority.status === "unknown", "authority without log → unknown");
  assert(by.fulfillment.status === "idle", "empty fulfillment queue → idle");
  assert(by.discord.status === "disabled", "discord disabled");
  assert(by.discord.nextRunAt === null, "disabled worker has no next run");
  assert(by.support.nextRunAt !== null, "scheduled worker shows next run");
  assert(cards.every((c) => c.waiting.length === 0), "no fabricated waiting items");

  const failedObservation = buildWorkerCard("finance", null, NOW);
  assert(failedObservation.status === "unknown", "observation error → unknown card");

  const pipeline = buildPipeline(cards, NOW);
  assert(pipeline.active.length === 0, "no fabricated active work");
  assert(pipeline.waiting.length === 0, "no fabricated approvals");
  assert(pipeline.blocked.length === 0, "nothing blocked");
  assert(
    pipeline.upcoming.every((u) => u.worker !== "discord"),
    "disabled workers excluded from upcoming"
  );
  assert(pipeline.upcoming.length > 0, "real cron schedule listed");
}

function main() {
  testSanitize();
  testNormalize();
  testCursor();
  testSupportRunMapping();
  testStartFinishDedupe();
  testRecordMappings();
  testSourcesRegistered();
  testSchedule();
  testScheduleMatchesVercel();
  testWorkerStatus();
  testEmptySystem();
  console.log("[test-mission-control] all assertions passed");
}

main();
