/**
 * Live DB smoke tests for inventory monitor (requires DATABASE_URL).
 * Run: npx tsx scripts/test-inventory-monitor-db.ts
 *
 * Default: non-mutating (create inbound lot → assert → delete the smoke lot).
 * Optional destructive release check:
 *   INVENTORY_MONITOR_DB_MUTATION=1 npx tsx scripts/test-inventory-monitor-db.ts
 *
 * Smoke lots are identified ONLY by:
 *   notes = 'db-smoke-test-lot'
 *   AND supplier_lot_reference LIKE 'SMOKE-%'
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import { ensureInventoryMonitorSchema } from "@/lib/inventory/monitor/schema";
import {
  createPipelineLot,
  releasePipelineLotToSellable,
  updatePipelineLotStage,
} from "@/lib/inventory/monitor/pipeline";
import { getActiveCatalogProducts } from "@/lib/products/catalog";
import { ensureProductTracked } from "@/lib/inventory/store";
import { computeSkuDemandMetrics } from "@/lib/inventory/monitor/demand";

loadEnvLocal();

const SMOKE_NOTES = "db-smoke-test-lot";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function deleteSmokeTestLots(sql: ReturnType<typeof getSql>): Promise<number> {
  const rows = (await sql`
    DELETE FROM inventory_pipeline_lots
    WHERE notes = ${SMOKE_NOTES}
      AND supplier_lot_reference LIKE 'SMOKE-%'
    RETURNING id
  `) as { id: number | string }[];
  return rows.length;
}

async function deleteSmokeLotById(
  sql: ReturnType<typeof getSql>,
  lotId: number
): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM inventory_pipeline_lots
    WHERE id = ${lotId}
      AND notes = ${SMOKE_NOTES}
      AND supplier_lot_reference LIKE 'SMOKE-%'
    RETURNING id
  `) as { id: number | string }[];
  return rows.length === 1;
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.log("[test-inventory-monitor-db] skipped (no DATABASE_URL)");
    return;
  }

  await ensureInventoryMonitorSchema();
  const product = getActiveCatalogProducts()[0];
  assert(product, "need an active catalog product");
  await ensureProductTracked(product.handle, product.name, product.sku);

  const sql = getSql();

  // One-time cleanup of leftover cancelled/released smoke-test artifacts.
  const staleRemoved = await deleteSmokeTestLots(sql);
  console.log(
    `[test-inventory-monitor-db] removed ${staleRemoved} pre-existing smoke-test pipeline row(s).`
  );

  const before = (await sql`
    SELECT stock FROM products WHERE handle = ${product.handle} LIMIT 1
  `) as { stock: number }[];
  const sellableBefore = before[0]?.stock ?? 0;

  // Demand query must execute (QA exclusion path) without error.
  const demand = await computeSkuDemandMetrics();
  assert(Array.isArray(demand), "demand metrics array");
  assert(
    demand.some((d) => d.sku === product.sku),
    "active SKU present in demand"
  );

  const lot = await createPipelineLot({
    sku: product.sku,
    quantityOrdered: 3,
    notes: SMOKE_NOTES,
    supplierLotReference: `SMOKE-${Date.now()}`,
  });

  try {
    let mid = (await sql`
      SELECT stock FROM products WHERE handle = ${product.handle} LIMIT 1
    `) as { stock: number }[];
    assert(
      (mid[0]?.stock ?? 0) === sellableBefore,
      "create lot ≠ sellable change"
    );

    await updatePipelineLotStage({
      lotId: lot.id,
      status: "in_transit",
    });
    mid = (await sql`
      SELECT stock FROM products WHERE handle = ${product.handle} LIMIT 1
    `) as { stock: number }[];
    assert(
      (mid[0]?.stock ?? 0) === sellableBefore,
      "in_transit ≠ sellable change"
    );

    // Status received without quantity_received must block RELEASE.
    await sql`
      UPDATE inventory_pipeline_lots
      SET status = 'received_awaiting_testing',
          received_at = now(),
          quantity_received = NULL,
          updated_at = now()
      WHERE id = ${lot.id}
        AND notes = ${SMOKE_NOTES}
        AND supplier_lot_reference LIKE 'SMOKE-%'
    `;
    const noQty = await releasePipelineLotToSellable(lot.id, true);
    assert(!noQty.ok, "release without quantity_received blocked");
    assert(
      (noQty.error ?? "").includes("Record quantity received"),
      `expected received-qty error, got: ${noQty.error}`
    );
    mid = (await sql`
      SELECT stock FROM products WHERE handle = ${product.handle} LIMIT 1
    `) as { stock: number }[];
    assert(
      (mid[0]?.stock ?? 0) === sellableBefore,
      "failed release left sellable unchanged"
    );

    await updatePipelineLotStage({
      lotId: lot.id,
      status: "received_awaiting_testing",
      quantityReceived: 3,
      receivedAt: new Date().toISOString(),
      testingStartedAt: new Date().toISOString(),
      testingCost: 350,
    });
    mid = (await sql`
      SELECT stock FROM products WHERE handle = ${product.handle} LIMIT 1
    `) as { stock: number }[];
    assert(
      (mid[0]?.stock ?? 0) === sellableBefore,
      "received_awaiting_testing ≠ sellable change"
    );

    const unconfirmed = await releasePipelineLotToSellable(lot.id, false);
    assert(!unconfirmed.ok, "release without confirmation blocked");

    if (process.env.INVENTORY_MONITOR_DB_MUTATION === "1") {
      const first = await releasePipelineLotToSellable(lot.id, true);
      assert(first.ok, `first release ok: ${first.error}`);
      assert(first.quantity === 3, "released qty 3");
      assert(first.newStock === sellableBefore + 3, "sellable +3");

      const history = (await sql`
        SELECT old_stock, new_stock
        FROM stock_history
        WHERE handle = ${product.handle}
        ORDER BY id DESC
        LIMIT 1
      `) as { old_stock: number; new_stock: number }[];
      assert(history[0]?.old_stock === sellableBefore, "history old");
      assert(history[0]?.new_stock === sellableBefore + 3, "history new");

      const second = await releasePipelineLotToSellable(lot.id, true);
      assert(!second.ok, "double release blocked");

      await sql`
        UPDATE products SET stock = ${sellableBefore} WHERE handle = ${product.handle}
      `;
      await sql`
        INSERT INTO stock_history (handle, sku, old_stock, new_stock)
        VALUES (${product.handle}, ${product.sku}, ${sellableBefore + 3}, ${sellableBefore})
      `;
      console.log(
        "[test-inventory-monitor-db] release/double-release passed; stock restored."
      );
    } else {
      const after = (await sql`
        SELECT stock FROM products WHERE handle = ${product.handle} LIMIT 1
      `) as { stock: number }[];
      assert(
        (after[0]?.stock ?? 0) === sellableBefore,
        "non-release path left sellable unchanged"
      );
      console.log(
        "[test-inventory-monitor-db] non-mutating path passed (set INVENTORY_MONITOR_DB_MUTATION=1 for release check)."
      );
    }
  } finally {
    const deleted = await deleteSmokeLotById(sql, lot.id);
    assert(deleted, `failed to delete smoke lot id=${lot.id}`);
    console.log(
      `[test-inventory-monitor-db] cleaned up smoke lot id=${lot.id}.`
    );
  }

  // Migration idempotency
  await ensureInventoryMonitorSchema();
  console.log("[test-inventory-monitor-db] schema idempotency ok.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
