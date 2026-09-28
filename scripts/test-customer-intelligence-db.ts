/**
 * DB smoke for customer intelligence schema + idempotent snapshot.
 * The smoke row is QA data (`test` + `reporting_excluded`) and must never be
 * returned as the latest snapshot.
 * Run: npm run test:customer-intelligence-db
 */
import { loadEnvLocal } from "./_env";
import { ensureCustomerIntelligenceSchema } from "@/lib/customer-intelligence/schema";
import {
  upsertCustomerIntelSnapshot,
  getLatestCustomerIntelSnapshot,
} from "@/lib/customer-intelligence/signals-store";

loadEnvLocal();

const QA_SNAPSHOT = {
  test: true,
  reporting_excluded: true,
  reporting_exclusion_reason: "customer-intelligence DB smoke test",
};

async function main() {
  console.log("[test:customer-intelligence-db] running…");
  await ensureCustomerIntelligenceSchema();
  const a = await upsertCustomerIntelSnapshot({
    periodStart: "2099-01-01",
    periodEnd: "2099-01-28",
    snapshot: { ...QA_SNAPSHOT, pass: 1 },
  });
  const b = await upsertCustomerIntelSnapshot({
    periodStart: "2099-01-01",
    periodEnd: "2099-01-28",
    snapshot: { ...QA_SNAPSHOT, pass: 2 },
  });
  if (a.id !== b.id && b.inserted) {
    throw new Error("snapshot should upsert same period");
  }
  const latest = await getLatestCustomerIntelSnapshot();
  if (latest?.periodStart === "2099-01-01") {
    throw new Error("QA smoke snapshot must not be returned as latest");
  }
  console.log("[test:customer-intelligence-db] all passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
