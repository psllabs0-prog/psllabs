/**
 * DB smoke for customer intelligence schema + idempotent snapshot.
 * Leaves no rows behind: the QA snapshot it creates is deleted in `finally`,
 * and a failed cleanup fails loudly with the row id.
 * Run: npm run test:customer-intelligence-db
 */
import { loadEnvLocal } from "./_env";
import { runCustomerIntelSnapshotSmoke } from "./_ci-db-smoke";

loadEnvLocal();

async function main() {
  console.log("[test:customer-intelligence-db] running…");
  const { qaRowId } = await runCustomerIntelSnapshotSmoke();
  console.log(`[test:customer-intelligence-db] all passed (QA row ${qaRowId} created and removed).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
