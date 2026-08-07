import { loadEnvLocal } from "./_env";

loadEnvLocal();

import { getSql } from "../lib/db/sql";
import { ensureInventorySchema } from "../lib/inventory/store";
import {
  catalogProducts,
  getCatalogProductByHandle,
} from "../lib/products/catalog";
import { catalogToTagadaInput, syncProductToTagada } from "../lib/tagada";

function maskSecret(value: string): string {
  if (value.length <= 10) return "[redacted-short]";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

async function main() {
  const apiKey = process.env.TAGADA_API_KEY?.trim() ?? "";
  const storeId = process.env.TAGADA_STORE_ID?.trim() ?? "";

  console.info("[sync-tagada] starting");
  console.info(
    `[sync-tagada] TAGADA_API_KEY present=${Boolean(apiKey)} masked=${apiKey ? maskSecret(apiKey) : "(empty)"}`
  );
  console.info(`[sync-tagada] TAGADA_STORE_ID=${storeId || "(empty)"}`);

  if (!apiKey || !storeId) {
    console.error(
      "Missing TAGADA_API_KEY or TAGADA_STORE_ID. Set them in .env.local or the environment."
    );
    process.exit(1);
  }

  await ensureInventorySchema();
  console.info("[sync-tagada] inventory schema ready");

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

  console.info(
    `[sync-tagada] Syncing ${toSync.size} product(s) to Tagada: ${[...toSync.keys()].join(", ")}`
  );

  let failed = 0;
  for (const product of toSync.values()) {
    console.info(
      `[sync-tagada] --- begin ${product.handle} (${product.name} ${product.strength}, $${product.price}) ---`
    );
    const result = await syncProductToTagada(catalogToTagadaInput(product));
    if (result.ok) {
      console.info(
        `OK ${result.handle} → product=${result.tagadaProductId} variant=${result.tagadaVariantId} price=${result.tagadaPriceId}`
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
