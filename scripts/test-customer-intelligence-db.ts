/**
 * DB smoke for customer intelligence schema + idempotent snapshot.
 * Run: npm run test:customer-intelligence-db
 */
import { loadEnvLocal } from "./_env";
import { ensureCustomerIntelligenceSchema } from "@/lib/customer-intelligence/schema";
import {
  upsertCustomerIntelSnapshot,
  getLatestCustomerIntelSnapshot,
} from "@/lib/customer-intelligence/signals-store";

loadEnvLocal();

async function main() {
  console.log("[test:customer-intelligence-db] running…");
  await ensureCustomerIntelligenceSchema();
  const a = await upsertCustomerIntelSnapshot({
    periodStart: "2099-01-01",
    periodEnd: "2099-01-28",
    snapshot: { test: true, pass: 1 },
  });
  const b = await upsertCustomerIntelSnapshot({
    periodStart: "2099-01-01",
    periodEnd: "2099-01-28",
    snapshot: { test: true, pass: 2 },
  });
  if (a.id !== b.id && b.inserted) {
    throw new Error("snapshot should upsert same period");
  }
  const latest = await getLatestCustomerIntelSnapshot();
  if (!latest) throw new Error("expected snapshot");
  console.log("[test:customer-intelligence-db] all passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
