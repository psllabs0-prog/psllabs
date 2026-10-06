/** Explicit synthetic counter check. No orders, customers or payments are touched. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getSql } from "../lib/db/sql";
import { consumeRequestLimit } from "../lib/security/request-rate-limit";

async function main() {
  if (!process.argv.includes("--synthetic-only")) throw new Error("Use --synthetic-only");
  // The known PSL order reference confirms this is the existing project database;
  // no private customer fields are selected.
  const sql = getSql();
  const rows = await sql`SELECT EXISTS(SELECT 1 FROM orders WHERE order_id = 'psl_1791004241212_qkfho9io') AS matches_project`;
  assert.equal(rows[0]?.matches_project, true, "expected PSL project database");
  const scope = `security-self-check-${randomUUID()}`;
  process.env.VERCEL = "1";
  process.env.REQUEST_RATE_LIMIT_SECRET = randomUUID();
  const request = new Request("https://www.psllabs.org/api/admin/login", {
    method: "POST", headers: { origin: "https://www.psllabs.org", "x-vercel-forwarded-for": "192.0.2.99" },
  });
  try {
    const results = await Promise.all(Array.from({ length: 12 }, () => consumeRequestLimit(request, scope, 5, 60)));
    assert.equal(results.filter((value) => value === null).length, 5);
    assert.equal(results.filter((value) => value?.status === 429).length, 7);
    console.log("PASS: project database confirmed; 12 simultaneous synthetic attempts allow exactly 5. No order/payment/customer changes.");
  } finally {
    await sql`DELETE FROM request_rate_limits WHERE scope = ${scope}`;
  }
}
main().catch(() => { console.error("Synthetic request-counter check failed."); process.exitCode = 1; });
