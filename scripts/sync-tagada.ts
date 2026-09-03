import { loadEnvLocal } from "./_env";

loadEnvLocal();

import { getSql } from "../lib/db/sql";
import { ensureInventorySchema } from "../lib/inventory/store";
import {
  catalogProducts,
  getCatalogProductByHandle,
} from "../lib/products/catalog";
import {
  catalogToTagadaInput,
  getAllStoredTagadaRecords,
  planTagadaSync,
  syncProductToTagada,
  TAGADA_CANONICAL_PRODUCT_IDS,
} from "../lib/tagada";

function maskSecret(value: string): string {
  if (value.length <= 10) return "[redacted-short]";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function parseFlags(argv: string[]): { dryRun: boolean } {
  return {
    dryRun: argv.includes("--dry-run") || argv.includes("-n"),
  };
}

async function main() {
  const { dryRun } = parseFlags(process.argv.slice(2));
  const apiKey = process.env.TAGADA_API_KEY?.trim() ?? "";
  const storeId = process.env.TAGADA_STORE_ID?.trim() ?? "";

  console.info("[sync-tagada] starting");
  console.info(
    `[sync-tagada] TAGADA_API_KEY present=${Boolean(apiKey)} masked=${apiKey ? maskSecret(apiKey) : "(empty)"}`
  );
  console.info(`[sync-tagada] TAGADA_STORE_ID=${storeId || "(empty)"}`);
  console.info(`[sync-tagada] mode=${dryRun ? "DRY-RUN (no mutations)" : "APPLY"}`);
  console.info(
    `[sync-tagada] canonical pins: ${Object.entries(TAGADA_CANONICAL_PRODUCT_IDS)
      .map(([handle, id]) => `${handle}=${id}`)
      .join(", ")}`
  );

  if (!apiKey || !storeId) {
    console.error(
      "Missing TAGADA_API_KEY or TAGADA_STORE_ID. Set them in .env.local or the environment."
    );
    process.exit(1);
  }

  await ensureInventorySchema();
  console.info("[sync-tagada] inventory schema ready");

  const storedTagada = await getAllStoredTagadaRecords();

  const toSync = new Map(
    catalogProducts
      .filter((p) => p.status === "active" || p.handle === "retatrutide")
      .map((p) => [p.handle, p])
  );

  const sql = getSql();
  const rows = (await sql`
    SELECT handle, name FROM products
  `) as Array<{ handle: string; name: string }>;

  console.info(
    `[sync-tagada] catalog candidates=${toSync.size} inventory rows=${rows.length}`
  );

  for (const row of rows) {
    const catalog = getCatalogProductByHandle(row.handle);
    if (!catalog) continue;
    if (catalog.status === "active" || catalog.handle === "retatrutide") {
      toSync.set(catalog.handle, catalog);
    }
  }

  if (toSync.size === 0) {
    console.error("No products found to sync.");
    process.exit(1);
  }

  // Local-db preview (before remote resolution)
  for (const handle of toSync.keys()) {
    const stored = storedTagada.get(handle);
    const canonical = TAGADA_CANONICAL_PRODUCT_IDS[handle];
    console.info(
      `[sync-tagada] ${handle}: local=${stored?.tagadaProductId ?? "(none)"} canonical=${canonical ?? "(none)"}`
    );
  }

  const inputs = [...toSync.values()].map(catalogToTagadaInput);
  console.info("[sync-tagada] resolving create vs update plan…");
  const plan = await planTagadaSync(inputs);

  const updateCount = plan.filter((item) => item.action === "update").length;
  const createCount = plan.filter((item) => item.action === "create").length;

  console.info("");
  console.info("======== SYNC PLAN ========");
  for (const item of plan) {
    console.info(
      `  [${item.action.toUpperCase()}] ${item.handle} (${item.displayName}) sku=${item.sku}`
    );
    console.info(`           ${item.note}`);
  }
  console.info(
    `======== ${updateCount} update(s), ${createCount} create(s) ========`
  );
  console.info("");

  if (dryRun) {
    console.info(
      "[sync-tagada] dry-run complete — no Tagada mutations were made. Re-run without --dry-run to apply."
    );
    return;
  }

  if (createCount > 0) {
    console.warn(
      `[sync-tagada] WARNING: ${createCount} product(s) will be CREATED. Confirm these are not duplicates before leaving this run.`
    );
  }

  let failed = 0;
  for (const product of toSync.values()) {
    console.info(
      `[sync-tagada] --- begin ${product.handle} (${product.name} ${product.strength}, $${product.price}) ---`
    );
    const result = await syncProductToTagada(catalogToTagadaInput(product));
    if (result.ok) {
      console.info(
        `${result.action === "updated" ? "UPDATED" : "CREATED"} ${result.handle} → product=${result.tagadaProductId} variant=${result.tagadaVariantId} price=${result.tagadaPriceId}`
      );
    } else {
      failed += 1;
      console.error(`FAIL ${result.handle}: ${result.error}`);
    }
    console.info(`[sync-tagada] --- end ${product.handle} ---`);
  }

  if (failed > 0) {
    console.error(`Finished with ${failed} failure(s).`);
    process.exit(1);
  }

  console.info("Tagada product sync complete.");
}

main().catch((error) => {
  console.error("[sync-tagada] uncaught error (network/script-level):", error);
  process.exit(1);
});
