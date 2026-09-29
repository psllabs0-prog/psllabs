/**
 * REAL-database concurrency test for the n8n registration quota. Opt-in only,
 * and only against an isolated, disposable Neon database/branch:
 *
 *   MISSION_CONTROL_N8N_DB_TEST=1 N8N_TEST_DATABASE_URL=<isolated branch URL> \
 *     npm run test:mission-control-n8n-db
 *
 * Refuses to run when the target host matches any application database URL
 * (process env, .env.local, .env) or when the target contains business tables.
 * Creates the Mission Control activity tables in the isolated database if
 * missing, and deletes only rows it created. Never prints connection details.
 */
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { neon } from "@neondatabase/serverless";

import { __setSqlClientForTests } from "../lib/db/sql";
import {
  N8N_EVENT_TYPES,
  N8N_REGISTRATION_LIMIT,
  N8N_REGISTRATION_WINDOW_MS,
  registerN8nRun,
} from "../lib/ops/mission-control/n8n/runs";
import { N8N_WORKFLOW_ID } from "../lib/ops/mission-control/n8n/validate";
import { ensureMissionControlSchema } from "../lib/ops/mission-control/schema";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace("-pooler.", ".");
  } catch {
    return null;
  }
}

function applicationDatabaseHosts(): Set<string> {
  const hosts = new Set<string>();
  const add = (v: string | undefined) => {
    const h = hostOf(v?.trim().replace(/^["']|["']$/g, ""));
    if (h) hosts.add(h);
  };
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== "N8N_TEST_DATABASE_URL" && /DATABASE_URL|POSTGRES_URL/.test(k)) add(v);
  }
  for (const file of [".env.local", ".env", ".env.production", ".env.production.local"]) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]*(?:DATABASE_URL|POSTGRES_URL)[A-Z0-9_]*)\s*=\s*(.+)$/.exec(line);
      if (m) add(m[2]);
    }
  }
  return hosts;
}

const TAG = `dbtest-${Date.now().toString(36)}`;

async function main() {
  if (process.env.MISSION_CONTROL_N8N_DB_TEST !== "1") {
    console.log("[n8n-db] skipped: set MISSION_CONTROL_N8N_DB_TEST=1 and N8N_TEST_DATABASE_URL (isolated DB only).");
    return;
  }
  const url = process.env.N8N_TEST_DATABASE_URL?.trim();
  const target = hostOf(url);
  if (!url || !target) throw new Error("N8N_TEST_DATABASE_URL is required.");
  if (applicationDatabaseHosts().has(target)) {
    throw new Error("Refusing: the test database host matches an application database. Use an isolated branch.");
  }

  const sql = neon(url);
  const [biz] = (await sql`
    SELECT to_regclass('public.orders') AS orders,
           to_regclass('public.finance_transactions') AS finance,
           to_regclass('public.support_escalations') AS support
  `) as Array<Record<string, unknown>>;
  if (biz.orders || biz.finance || biz.support) {
    throw new Error("Refusing: the test database contains business tables; it is not isolated.");
  }

  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  __setSqlClientForTests(sql);
  Object.assign(process.env, {
    MISSION_CONTROL_N8N_ENABLED: "true",
    MISSION_CONTROL_N8N_TOKEN: crypto.randomBytes(32).toString("base64url"),
    MISSION_CONTROL_SYNC_ENABLED: "true",
  });
  delete process.env.VERCEL_ENV;

  await ensureMissionControlSchema();

  const since = () => new Date(Date.now() - N8N_REGISTRATION_WINDOW_MS).toISOString();
  const windowCount = async () =>
    Number(
      (
        (await sql`
          SELECT COUNT(*)::int AS n FROM ops_activity_events
          WHERE source_system = 'n8n' AND event_type = ${N8N_EVENT_TYPES.registered}
            AND received_at > ${since()}::timestamptz
        `) as Array<{ n: number }>
      )[0].n
    );
  const cleanup = async () => {
    await sql`
      DELETE FROM ops_activity_events
      WHERE source_system = 'n8n'
        AND correlation_id IN (
          SELECT correlation_id FROM ops_activity_events
          WHERE source_event_key LIKE ${`n8n:connection_test:request:${TAG}-%`}
        )
    `;
  };
  const reg = (requestId: string, exec: string) =>
    registerN8nRun({ requestId, workflow: N8N_WORKFLOW_ID, n8nExecutionId: exec }, new Date());

  assert((await windowCount()) === 0, "isolated DB already has recent n8n registrations; retry after the window");

  try {
    const trials: Array<{ concurrent: number }> = [
      { concurrent: 2 },
      { concurrent: 2 },
      { concurrent: 2 },
      { concurrent: 8 },
      { concurrent: 8 },
    ];
    for (const [t, trial] of trials.entries()) {
      for (let i = 0; i < N8N_REGISTRATION_LIMIT - 1; i++) {
        assert((await reg(`${TAG}-t${t}-seed-${i}`, `s${t}${i}`)).status === 201, "seed registration");
      }
      const results = await Promise.all(
        Array.from({ length: trial.concurrent }, (_, i) => reg(`${TAG}-t${t}-new-${i}`, `n${t}${i}`))
      );
      const created = results.filter((r) => r.status === 201).length;
      const total = await windowCount();
      console.log(
        `[n8n-db] trial ${t + 1}: ${trial.concurrent} simultaneous → created ${created}, statuses ${results.map((r) => r.status).join(",")}, window total ${total}`
      );
      assert(created === 1, `expected exactly one additional run, got ${created}`);
      assert(total === N8N_REGISTRATION_LIMIT, `quota exceeded: ${total}`);
      await cleanup();
    }

    const dup = await Promise.all([reg(`${TAG}-dup`, "d1"), reg(`${TAG}-dup`, "d1")]);
    const statuses = dup.map((d) => d.status).sort().join(",");
    console.log(`[n8n-db] same requestId concurrently → ${statuses}`);
    assert(statuses === "200,201" && dup[0].body.runId === dup[1].body.runId, "concurrent duplicates share one run");
    console.log("\n[n8n-db] real-database concurrency assertions passed.");
  } finally {
    await cleanup().catch((e) => console.error("[n8n-db] cleanup failed:", e instanceof Error ? e.message : e));
    __setSqlClientForTests(null);
  }
}

main().catch((error) => {
  console.error("[n8n-db] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
