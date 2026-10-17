import { createHash } from "node:crypto";
import { ensureSqlSchema, getSql } from "@/lib/db/sql";
import { ensureInventoryMonitorSchema } from "./monitor/schema";
import { ensureLedgerSchema } from "@/lib/ledger/store";
import { LOW_STOCK_THRESHOLD } from "./constants";
import { getReceiptProductDefinitions } from "./receipt-products";
import { InventoryReceiptError, inventoryReceiptReferenceKey, validateInventoryReceipt } from "./receipt-validation";
import type { InventoryReceipt, InventoryReceiptResult, InventoryReceiptSnapshot, ReceiptOpenInboundLot } from "./receipt-types";

/** Business mutations execute inside one PostgreSQL function invocation/transaction. */
export const INVENTORY_RECEIPT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS inventory_receipts (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL,
  reference_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  source_note TEXT NOT NULL,
  merchandise_total_cents BIGINT NOT NULL CHECK (merchandise_total_cents > 0),
  total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
  release_to_sellable BOOLEAN NOT NULL,
  ledger_entry_id INTEGER UNIQUE,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory_receipt_lines (
  receipt_id BIGINT NOT NULL REFERENCES inventory_receipts(id),
  sku TEXT NOT NULL,
  handle TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_cents BIGINT NOT NULL CHECK (unit_cost_cents > 0),
  line_total_cents BIGINT NOT NULL CHECK (line_total_cents = quantity::bigint * unit_cost_cents),
  disposition TEXT NOT NULL CHECK (disposition IN ('sellable','awaiting_testing','internal_unlisted')),
  pipeline_lot_id BIGINT,
  old_stock INTEGER NOT NULL,
  new_stock INTEGER NOT NULL,
  PRIMARY KEY (receipt_id, sku)
);
CREATE TABLE IF NOT EXISTS inventory_internal_stock (
  sku TEXT PRIMARY KEY CHECK (sku = 'PSL-BW-10ML'),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory_receipt_tracking_closures (
  receipt_id BIGINT NOT NULL REFERENCES inventory_receipts(id),
  lot_id BIGINT NOT NULL UNIQUE,
  previous_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (receipt_id, lot_id)
);
CREATE OR REPLACE FUNCTION inventory_record_receipt(p JSONB, p_hash TEXT, p_low_threshold INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_id BIGINT; prior inventory_receipts%ROWTYPE; line JSONB; lot_id BIGINT;
  lot inventory_pipeline_lots%ROWTYPE; v_old INTEGER; v_new BIGINT; v_sku TEXT;
  v_qty INTEGER; v_unit BIGINT; v_total BIGINT := 0; v_count INTEGER := 0;
  v_line_total BIGINT; v_pipeline_id BIGINT; v_disposition TEXT;
  v_ledger_id INTEGER; v_lines JSONB := '[]'::jsonb; v_result JSONB;
  v_created TIMESTAMPTZ; v_reason TEXT;
BEGIN
  IF jsonb_typeof(p->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'lines') < 1
    OR jsonb_typeof(p->'closeInboundLotIds') IS DISTINCT FROM 'array'
    OR p_hash !~ '^[a-f0-9]{64}$' OR length(p->>'referenceKey') < 3
    OR jsonb_typeof(p->'releaseToSellable') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'RECEIPT_INVALID_INPUT';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p->'lines') l GROUP BY l->>'sku' HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p->'closeInboundLotIds') i GROUP BY i HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'RECEIPT_DUPLICATE_LINE';
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
    v_qty := (line->>'quantity')::integer; v_unit := (line->>'unitCostCents')::bigint;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 1000000 OR v_unit IS NULL OR v_unit < 1
      OR v_unit > 100000000 OR coalesce(line->>'sku','') = ''
      OR coalesce(line->>'handle','') = '' OR jsonb_typeof(line->'listedForSale') IS DISTINCT FROM 'boolean'
      OR ((line->>'listedForSale')::boolean IS FALSE AND
        (line->>'sku' <> 'PSL-BW-10ML' OR line->>'handle' <> 'bac-water-10ml')) THEN
      RAISE EXCEPTION 'RECEIPT_INVALID_LINE';
    END IF;
    v_total := v_total + v_qty::bigint * v_unit; v_count := v_count + v_qty;
  END LOOP;
  IF v_total < 1 OR v_total > 9999999999 THEN RAISE EXCEPTION 'RECEIPT_TOTAL_RANGE'; END IF;

  -- Unique insert serializes same-reference concurrent requests before any business change.
  INSERT INTO inventory_receipts(reference,reference_key,request_hash,source_note,
    merchandise_total_cents,total_quantity,release_to_sellable)
  VALUES(p->>'reference',p->>'referenceKey',p_hash,p->>'sourceNote',v_total,v_count,
    (p->>'releaseToSellable')::boolean)
  ON CONFLICT(reference_key) DO NOTHING RETURNING id,created_at INTO v_id,v_created;
  IF v_id IS NULL THEN
    SELECT * INTO prior FROM inventory_receipts WHERE reference_key = p->>'referenceKey' FOR UPDATE;
    IF prior.request_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'RECEIPT_REFERENCE_CONFLICT'; END IF;
    IF prior.result_json IS NULL THEN RAISE EXCEPTION 'RECEIPT_INCOMPLETE'; END IF;
    RETURN jsonb_build_object('ok',true,'receipt',prior.result_json,'replayed',true);
  END IF;

  -- Match the existing release lock order: lots first, then products deterministically.
  FOR lot_id IN SELECT value::bigint FROM jsonb_array_elements_text(p->'closeInboundLotIds') ORDER BY value::bigint LOOP
    SELECT * INTO lot FROM inventory_pipeline_lots WHERE id = lot_id FOR UPDATE;
    IF NOT FOUND OR lot.status NOT IN ('ordered','in_transit') THEN RAISE EXCEPTION 'RECEIPT_INBOUND_STATE_CHANGED'; END IF;
  END LOOP;
  FOR line IN SELECT value FROM jsonb_array_elements(p->'lines') ORDER BY value->>'handle' LOOP
    v_qty := (line->>'quantity')::integer; v_unit := (line->>'unitCostCents')::bigint;
    v_line_total := v_qty::bigint * v_unit; v_pipeline_id := NULL;
    IF (line->>'listedForSale')::boolean THEN
      INSERT INTO products(handle,name,stock,sku) VALUES(line->>'handle',line->>'name',0,line->>'sku')
        ON CONFLICT(handle) DO NOTHING;
      SELECT stock,sku INTO v_old,v_sku FROM products WHERE handle = line->>'handle' FOR UPDATE;
      IF v_sku IS DISTINCT FROM line->>'sku' THEN RAISE EXCEPTION 'RECEIPT_PRODUCT_IDENTITY_CHANGED'; END IF;
      v_new := v_old;
      IF (p->>'releaseToSellable')::boolean THEN
        v_new := v_old::bigint + v_qty;
        IF v_new > 2147483647 THEN RAISE EXCEPTION 'RECEIPT_STOCK_RANGE'; END IF;
        UPDATE products SET stock = v_new::integer,
          low_stock_alert_sent_at = CASE WHEN v_new >= p_low_threshold THEN NULL ELSE low_stock_alert_sent_at END
          WHERE handle = line->>'handle';
        INSERT INTO stock_history(handle,sku,old_stock,new_stock) VALUES(line->>'handle',line->>'sku',v_old,v_new::integer);
        INSERT INTO inventory_monitor_baselines(sku,baseline_stock,source,set_at,updated_at)
          VALUES(line->>'sku',v_new::integer,'inventory_receipt',now(),now())
          ON CONFLICT(sku) DO UPDATE SET baseline_stock=EXCLUDED.baseline_stock,
            source=EXCLUDED.source,set_at=now(),updated_at=now();
        v_disposition := 'sellable';
      ELSE
        INSERT INTO inventory_pipeline_lots(sku,supplier_lot_reference,quantity_ordered,quantity_received,
          status,received_at,notes)
          VALUES(line->>'sku',NULL,v_qty,v_qty,'received_awaiting_testing',now(),
            'Received via inventory receipt ' || (p->>'reference') || '. ' || (p->>'sourceNote')) RETURNING id INTO v_pipeline_id;
        v_disposition := 'awaiting_testing';
      END IF;
    ELSE
      -- Internal physical supplies never enter products, public stock or checkout.
      INSERT INTO inventory_internal_stock(sku,stock) VALUES(line->>'sku',0) ON CONFLICT(sku) DO NOTHING;
      SELECT stock INTO v_old FROM inventory_internal_stock WHERE sku = line->>'sku' FOR UPDATE;
      v_new := v_old::bigint + v_qty;
      IF v_new > 2147483647 THEN RAISE EXCEPTION 'RECEIPT_STOCK_RANGE'; END IF;
      UPDATE inventory_internal_stock SET stock=v_new::integer,updated_at=now() WHERE sku=line->>'sku';
      v_disposition := 'internal_unlisted';
    END IF;
    INSERT INTO inventory_receipt_lines(receipt_id,sku,handle,name,quantity,unit_cost_cents,
      line_total_cents,disposition,pipeline_lot_id,old_stock,new_stock)
      VALUES(v_id,line->>'sku',line->>'handle',line->>'name',v_qty,v_unit,v_line_total,
        v_disposition,v_pipeline_id,v_old,v_new::integer);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('sku',line->>'sku','handle',line->>'handle',
      'name',line->>'name','quantity',v_qty,'unitCostUsd',v_unit::numeric/100,'lineTotalUsd',v_line_total::numeric/100,
      'disposition',v_disposition,'pipelineLotId',v_pipeline_id,'oldStock',v_old,'newStock',v_new));
  END LOOP;

  FOR lot_id IN SELECT value::bigint FROM jsonb_array_elements_text(p->'closeInboundLotIds') ORDER BY value::bigint LOOP
    SELECT * INTO lot FROM inventory_pipeline_lots WHERE id=lot_id;
    v_reason := 'Tracking superseded by inventory receipt ' || (p->>'reference') ||
      '; administrative tracking closure only, no supplier order cancellation.';
    INSERT INTO inventory_receipt_tracking_closures(receipt_id,lot_id,previous_status,reason)
      VALUES(v_id,lot_id,lot.status,v_reason);
    UPDATE inventory_pipeline_lots SET status='cancelled',notes=concat_ws(E'\n',NULLIF(notes,''),v_reason),updated_at=now()
      WHERE id=lot_id;
  END LOOP;
  INSERT INTO financial_ledger(record_type,order_id,sku,quantity,gross_revenue_usd,
    transaction_fees,expense_name,notes)
    VALUES('EXPENSE',NULL,NULL,v_count,v_total::numeric/100,0,
      'Inventory merchandise purchase · ' || (p->>'reference'),
      'Owner-reported merchandise cost only. Receipt ' || (p->>'reference') || '. ' || (p->>'sourceNote'))
    RETURNING id INTO v_ledger_id;
  v_result := jsonb_build_object('id',v_id::text,'reference',p->>'reference','sourceNote',p->>'sourceNote',
    'createdAt',v_created,'merchandiseTotalUsd',v_total::numeric/100,'totalQuantity',v_count,
    'releaseToSellable',(p->>'releaseToSellable')::boolean,'ledgerEntryId',v_ledger_id,
    'closedInboundLotIds',p->'closeInboundLotIds','lines',v_lines);
  UPDATE inventory_receipts SET ledger_entry_id=v_ledger_id,result_json=v_result WHERE id=v_id;
  RETURN jsonb_build_object('ok',true,'receipt',v_result,'replayed',false);
END;
$$ LANGUAGE plpgsql;
`;

async function ensureReceiptSchema(): Promise<void> {
  return ensureSqlSchema("inventory-receipts", async () => {
    await ensureInventoryMonitorSchema();
    await ensureLedgerSchema();
    // Neon prepares one statement per request; retain the function body as one statement.
    for (const statement of INVENTORY_RECEIPT_SCHEMA_SQL.trim().split(/\n(?=CREATE (?:TABLE|OR REPLACE FUNCTION))/)) {
      await getSql().query(statement);
    }
  });
}

export async function recordInventoryReceipt(input: unknown): Promise<InventoryReceiptResult> {
  const validated = validateInventoryReceipt(input, getReceiptProductDefinitions());
  const requestHash = createHash("sha256").update(JSON.stringify({
    referenceKey: validated.referenceKey,
    sourceNote: validated.sourceNote,
    lines: validated.lines.map(({ sku, quantity, unitCostCents }) => ({ sku, quantity, unitCostCents })),
    releaseToSellable: validated.releaseToSellable,
    closeInboundLotIds: validated.closeInboundLotIds,
  })).digest("hex");
  await ensureReceiptSchema();
  try {
    const rows = await getSql()`SELECT inventory_record_receipt(${JSON.stringify(validated)}::jsonb,
      ${requestHash}, ${Number.isInteger(LOW_STOCK_THRESHOLD) ? LOW_STOCK_THRESHOLD : 15}) AS result`;
    return rows[0].result as InventoryReceiptResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("RECEIPT_REFERENCE_CONFLICT")) {
      throw new InventoryReceiptError("That reference already records different receipt details. Review the saved receipt; do not create a second reference to retry.", 409);
    }
    if (message.includes("RECEIPT_INBOUND_STATE_CHANGED")) {
      throw new InventoryReceiptError("An inbound tracking record changed or is no longer open. Refresh and review the selected records. Nothing was recorded.", 409);
    }
    if (message.includes("RECEIPT_")) {
      throw new InventoryReceiptError("The receipt could not be recorded because inventory data changed or exceeded a supported limit. Refresh and review the saved state.", 409);
    }
    throw error;
  }
}

export async function getInventoryReceiptSnapshot(reference?: string): Promise<InventoryReceiptSnapshot> {
  if (reference && (reference.length > 120 || /[\u0000-\u001f\u007f]/.test(reference))) {
    throw new InventoryReceiptError("Invalid receipt reference.");
  }
  await ensureReceiptSchema();
  const sql = getSql();
  const definitions = getReceiptProductDefinitions();
  // One MVCC snapshot avoids mixing pre-receipt stock with post-receipt held lots.
  const rows = await sql`SELECT
    (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM
      (SELECT handle,sku,stock FROM products WHERE sku = ANY(${definitions.filter(p => p.listedForSale).map(p => p.sku)})) s) AS stock,
    (SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM
      (SELECT sku,COALESCE(SUM(COALESCE(quantity_received,quantity_ordered)),0)::int AS quantity
       FROM inventory_pipeline_lots WHERE status='received_awaiting_testing' GROUP BY sku) a) AS awaiting,
    (SELECT COALESCE(jsonb_agg(to_jsonb(i)), '[]'::jsonb) FROM inventory_internal_stock i) AS internal,
    (SELECT COALESCE(jsonb_agg(r.result_json), '[]'::jsonb) FROM
      (SELECT result_json FROM inventory_receipts WHERE result_json IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 30) r) AS recent,
    (SELECT result_json FROM inventory_receipts WHERE reference_key=${reference ? inventoryReceiptReferenceKey(reference) : null}
      AND result_json IS NOT NULL) AS exact,
    (SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb) FROM
      (SELECT id,sku,quantity_ordered,status,supplier_lot_reference,ordered_at,notes
       FROM inventory_pipeline_lots WHERE status IN ('ordered','in_transit') ORDER BY id LIMIT 150) l) AS lots`;
  const snapshot = rows[0] as {
    stock: { handle: string; sku: string; stock: number }[];
    awaiting: { sku: string; quantity: number }[];
    internal: { sku: string; stock: number }[];
    recent: InventoryReceipt[];
    exact: InventoryReceipt | null;
    lots: { id: string | number; sku: string; quantity_ordered: number; status: string;
      supplier_lot_reference: string | null; ordered_at: string; notes: string | null }[];
  };
  const { stock, awaiting, internal, lots } = snapshot;
  const receipts = new Map<string, InventoryReceipt>();
  for (const receipt of [...snapshot.recent, ...(snapshot.exact ? [snapshot.exact] : [])]) {
    receipts.set(receipt.id, receipt);
  }
  return {
    products: definitions.map(definition => {
      const product = stock.find(row => row.sku === definition.sku && row.handle === definition.handle);
      const count = definition.listedForSale ? Number(product?.stock ?? 0) : Number(internal.find(row => row.sku === definition.sku)?.stock ?? 0);
      const awaitingTesting = definition.listedForSale ? Number(awaiting.find(row => row.sku === definition.sku)?.quantity ?? 0) : 0;
      return { ...definition, stock: count, awaitingTesting, physicalOnHand: count + awaitingTesting };
    }),
    receipts: [...receipts.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    openInboundLots: lots.map(row => ({ id: Number(row.id), sku: String(row.sku), quantityOrdered: Number(row.quantity_ordered),
      status: row.status as ReceiptOpenInboundLot["status"], supplierLotReference: row.supplier_lot_reference as string | null,
      orderedAt: new Date(row.ordered_at as string).toISOString(), notes: row.notes as string | null })),
  };
}
