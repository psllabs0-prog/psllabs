import { getSql } from "@/lib/db/sql";
import { ensureProductTracked } from "@/lib/inventory/store";
import { getCatalogProductBySku, getActiveCatalogProducts } from "@/lib/products/catalog";

import type { PipelineLotStatus } from "./constants";
import { ensureInventoryMonitorSchema } from "./schema";
import { resetInventoryBaseline } from "./baselines";

export type PipelineLotRow = {
  id: number;
  sku: string;
  supplierLotReference: string | null;
  quantityOrdered: number;
  quantityReceived: number | null;
  status: PipelineLotStatus;
  orderedAt: string;
  expectedReleaseAt: string | null;
  receivedAt: string | null;
  testingStartedAt: string | null;
  testingCost: number | null;
  notes: string | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapLot(row: {
  id: number | string;
  sku: string;
  supplier_lot_reference: string | null;
  quantity_ordered: number;
  quantity_received: number | null;
  status: string;
  ordered_at: string;
  expected_release_at: string | null;
  received_at: string | null;
  testing_started_at: string | null;
  testing_cost: string | number | null;
  notes: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}): PipelineLotRow {
  return {
    id: Number(row.id),
    sku: row.sku,
    supplierLotReference: row.supplier_lot_reference,
    quantityOrdered: row.quantity_ordered,
    quantityReceived: row.quantity_received,
    status: row.status as PipelineLotStatus,
    orderedAt: new Date(row.ordered_at).toISOString(),
    expectedReleaseAt: row.expected_release_at
      ? new Date(row.expected_release_at).toISOString()
      : null,
    receivedAt: row.received_at ? new Date(row.received_at).toISOString() : null,
    testingStartedAt: row.testing_started_at
      ? new Date(row.testing_started_at).toISOString()
      : null,
    testingCost:
      row.testing_cost === null || row.testing_cost === undefined
        ? null
        : Number(row.testing_cost),
    notes: row.notes,
    releasedAt: row.released_at ? new Date(row.released_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listPipelineLots(
  options?: { includeReleased?: boolean; limit?: number }
): Promise<PipelineLotRow[]> {
  await ensureInventoryMonitorSchema();
  const sql = getSql();
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 300);
  const includeReleased = options?.includeReleased ?? true;

  const rows = includeReleased
    ? ((await sql`
        SELECT * FROM inventory_pipeline_lots
        ORDER BY ordered_at DESC, id DESC
        LIMIT ${limit}
      `) as Array<Parameters<typeof mapLot>[0]>)
    : ((await sql`
        SELECT * FROM inventory_pipeline_lots
        WHERE status <> 'released' AND status <> 'cancelled'
        ORDER BY ordered_at DESC, id DESC
        LIMIT ${limit}
      `) as Array<Parameters<typeof mapLot>[0]>);

  return rows.map(mapLot);
}

export async function createPipelineLot(input: {
  sku: string;
  quantityOrdered: number;
  supplierLotReference?: string | null;
  orderedAt?: string | null;
  expectedReleaseAt?: string | null;
  notes?: string | null;
  status?: Extract<PipelineLotStatus, "ordered" | "in_transit">;
}): Promise<PipelineLotRow> {
  await ensureInventoryMonitorSchema();
  const catalog = getCatalogProductBySku(input.sku);
  if (!catalog) throw new Error(`Unknown catalog SKU: ${input.sku}`);
  await ensureProductTracked(catalog.handle, catalog.name, catalog.sku);

  if (!Number.isInteger(input.quantityOrdered) || input.quantityOrdered <= 0) {
    throw new Error("quantityOrdered must be a positive integer");
  }

  const sql = getSql();
  const status = input.status ?? "ordered";
  const rows = (await sql`
    INSERT INTO inventory_pipeline_lots (
      sku,
      supplier_lot_reference,
      quantity_ordered,
      status,
      ordered_at,
      expected_release_at,
      notes
    ) VALUES (
      ${catalog.sku},
      ${input.supplierLotReference?.trim() || null},
      ${input.quantityOrdered},
      ${status},
      ${input.orderedAt ?? new Date().toISOString()},
      ${input.expectedReleaseAt ?? null},
      ${input.notes?.trim() || null}
    )
    RETURNING *
  `) as Array<Parameters<typeof mapLot>[0]>;

  return mapLot(rows[0]);
}

export async function updatePipelineLotStage(input: {
  lotId: number;
  status: PipelineLotStatus;
  quantityReceived?: number | null;
  receivedAt?: string | null;
  testingStartedAt?: string | null;
  testingCost?: number | null;
  expectedReleaseAt?: string | null;
  notes?: string | null;
}): Promise<PipelineLotRow> {
  await ensureInventoryMonitorSchema();
  if (input.status === "released") {
    throw new Error("Use releasePipelineLotToSellable for release");
  }

  const sql = getSql();
  const rows = (await sql`
    UPDATE inventory_pipeline_lots
    SET
      status = ${input.status},
      quantity_received = COALESCE(${input.quantityReceived ?? null}, quantity_received),
      received_at = COALESCE(${input.receivedAt ?? null}, received_at),
      testing_started_at = COALESCE(${input.testingStartedAt ?? null}, testing_started_at),
      testing_cost = COALESCE(${input.testingCost ?? null}, testing_cost),
      expected_release_at = COALESCE(${input.expectedReleaseAt ?? null}, expected_release_at),
      notes = COALESCE(${input.notes ?? null}, notes),
      updated_at = now()
    WHERE id = ${input.lotId}
      AND status <> 'released'
    RETURNING *
  `) as Array<Parameters<typeof mapLot>[0]>;

  if (!rows[0]) throw new Error("Lot not found or already released");
  return mapLot(rows[0]);
}

export async function releasePipelineLotToSellable(
  lotId: number,
  confirmed: boolean
): Promise<{
  ok: boolean;
  error?: string;
  handle?: string;
  sku?: string;
  quantity?: number;
  oldStock?: number;
  newStock?: number;
}> {
  if (!confirmed) {
    return { ok: false, error: "Release requires explicit confirmation" };
  }
  await ensureInventoryMonitorSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT inventory_release_pipeline_lot(${lotId}) AS result
  `) as { result: Record<string, unknown> }[];

  const result = rows[0]?.result ?? {};
  const ok = Boolean(result.ok);
  if (!ok) {
    return {
      ok: false,
      error: typeof result.error === "string" ? result.error : "Release failed",
    };
  }

  const sku = typeof result.sku === "string" ? result.sku : null;
  const newStock =
    typeof result.new_stock === "number"
      ? result.new_stock
      : Number(result.new_stock);
  if (sku && Number.isFinite(newStock)) {
    await resetInventoryBaseline(sku, newStock, "pipeline_release");
  }

  return {
    ok: true,
    handle: typeof result.handle === "string" ? result.handle : undefined,
    sku: sku ?? undefined,
    quantity:
      typeof result.quantity === "number"
        ? result.quantity
        : Number(result.quantity),
    oldStock:
      typeof result.old_stock === "number"
        ? result.old_stock
        : Number(result.old_stock),
    newStock,
  };
}

export async function sumPipelineBySku(): Promise<
  Map<
    string,
    { ordered: number; inTransit: number; awaitingTesting: number; released: number }
  >
> {
  await ensureInventoryMonitorSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      sku,
      COALESCE(SUM(quantity_ordered) FILTER (WHERE status = 'ordered'), 0)::int AS ordered,
      COALESCE(SUM(quantity_ordered) FILTER (WHERE status = 'in_transit'), 0)::int AS in_transit,
      COALESCE(
        SUM(COALESCE(quantity_received, quantity_ordered))
        FILTER (WHERE status = 'received_awaiting_testing'),
        0
      )::int AS awaiting_testing,
      COALESCE(
        SUM(COALESCE(quantity_received, quantity_ordered))
        FILTER (WHERE status = 'released'),
        0
      )::int AS released
    FROM inventory_pipeline_lots
    GROUP BY sku
  `) as Array<{
    sku: string;
    ordered: number;
    in_transit: number;
    awaiting_testing: number;
    released: number;
  }>;

  const map = new Map<
    string,
    { ordered: number; inTransit: number; awaitingTesting: number; released: number }
  >();
  for (const row of rows) {
    map.set(row.sku, {
      ordered: row.ordered,
      inTransit: row.in_transit,
      awaitingTesting: row.awaiting_testing,
      released: row.released,
    });
  }

  // Ensure active SKUs appear even with zero pipeline.
  for (const product of getActiveCatalogProducts()) {
    if (!map.has(product.sku)) {
      map.set(product.sku, {
        ordered: 0,
        inTransit: 0,
        awaitingTesting: 0,
        released: 0,
      });
    }
  }
  return map;
}

export async function listOpenPipelineLotsForSku(
  sku: string
): Promise<PipelineLotRow[]> {
  await ensureInventoryMonitorSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM inventory_pipeline_lots
    WHERE sku = ${sku}
      AND status IN ('ordered', 'in_transit', 'received_awaiting_testing')
    ORDER BY ordered_at ASC, id ASC
  `) as Array<Parameters<typeof mapLot>[0]>;
  return rows.map(mapLot);
}
