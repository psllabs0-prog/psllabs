import { getSql } from "@/lib/db/sql";
import { ensureInventorySchema } from "@/lib/inventory/store";

let schemaReady: Promise<void> | null = null;

/**
 * Idempotent inventory monitor / pipeline schema.
 * Prefer `npm run migrate-inventory-monitor` before deploy.
 */
export async function ensureInventoryMonitorSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await ensureInventorySchema();
    const sql = getSql();

    await sql`
      CREATE TABLE IF NOT EXISTS inventory_pipeline_lots (
        id BIGSERIAL PRIMARY KEY,
        sku TEXT NOT NULL,
        supplier_lot_reference TEXT,
        quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
        quantity_received INTEGER CHECK (quantity_received IS NULL OR quantity_received >= 0),
        status TEXT NOT NULL DEFAULT 'ordered',
        ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expected_release_at TIMESTAMPTZ,
        received_at TIMESTAMPTZ,
        testing_started_at TIMESTAMPTZ,
        testing_cost NUMERIC(12,2),
        notes TEXT,
        released_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS inventory_pipeline_lots_sku_idx
      ON inventory_pipeline_lots (sku)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS inventory_pipeline_lots_status_idx
      ON inventory_pipeline_lots (status)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS inventory_monitor_baselines (
        sku TEXT PRIMARY KEY,
        baseline_stock INTEGER NOT NULL CHECK (baseline_stock >= 0),
        source TEXT NOT NULL,
        set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS inventory_monitor_snapshots (
        id BIGSERIAL PRIMARY KEY,
        snapshot_date DATE NOT NULL,
        sku TEXT NOT NULL,
        sellable_stock INTEGER NOT NULL,
        ordered_inbound INTEGER NOT NULL DEFAULT 0,
        in_transit INTEGER NOT NULL DEFAULT 0,
        awaiting_testing INTEGER NOT NULL DEFAULT 0,
        sold_7d INTEGER NOT NULL DEFAULT 0,
        sold_14d INTEGER NOT NULL DEFAULT 0,
        sold_28d INTEGER NOT NULL DEFAULT 0,
        valid_orders_28d INTEGER NOT NULL DEFAULT 0,
        avg_7d NUMERIC(12,4),
        avg_14d NUMERIC(12,4),
        avg_28d NUMERIC(12,4),
        planning_velocity NUMERIC(12,4),
        days_supply NUMERIC(12,2),
        planning_adjusted_days_supply NUMERIC(12,2),
        risk_adjusted_days_supply NUMERIC(12,2),
        projected_stockout_at DATE,
        planning_adjusted_projected_stockout_at DATE,
        reorder_review_at DATE,
        baseline_stock INTEGER,
        depletion_pct NUMERIC(8,4),
        monitor_status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (snapshot_date, sku)
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS inventory_monitor_snapshots_date_idx
      ON inventory_monitor_snapshots (snapshot_date DESC)
    `;

    // Idempotent column adds for environments that already created snapshots.
    await sql`
      ALTER TABLE inventory_monitor_snapshots
      ADD COLUMN IF NOT EXISTS planning_adjusted_days_supply NUMERIC(12,2)
    `;
    await sql`
      ALTER TABLE inventory_monitor_snapshots
      ADD COLUMN IF NOT EXISTS planning_adjusted_projected_stockout_at DATE
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS inventory_monitor_alert_states (
        sku TEXT NOT NULL,
        alert_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        last_sent_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        details_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (sku, alert_key)
      )
    `;

    // Atomic sellable increment used by pipeline release (never read-then-write).
    await sql`
      CREATE OR REPLACE FUNCTION inventory_increment_stock(
        p_handle text,
        p_delta int,
        p_sku text DEFAULT NULL
      ) RETURNS jsonb AS $$
      DECLARE
        v_old int;
        v_new int;
        v_sku text;
      BEGIN
        IF p_delta IS NULL OR p_delta <= 0 THEN
          RETURN jsonb_build_object('ok', false, 'error', 'delta must be positive');
        END IF;

        SELECT stock, sku INTO v_old, v_sku
        FROM products
        WHERE handle = p_handle
        FOR UPDATE;

        IF NOT FOUND THEN
          RETURN jsonb_build_object('ok', false, 'error', 'product not found');
        END IF;

        v_new := v_old + p_delta;
        UPDATE products
        SET stock = v_new
        WHERE handle = p_handle;

        INSERT INTO stock_history (handle, sku, old_stock, new_stock)
        VALUES (p_handle, COALESCE(p_sku, v_sku), v_old, v_new);

        RETURN jsonb_build_object(
          'ok', true,
          'old_stock', v_old,
          'new_stock', v_new
        );
      END;
      $$ LANGUAGE plpgsql
    `;

    await sql`
      CREATE OR REPLACE FUNCTION inventory_release_pipeline_lot(
        p_lot_id bigint
      ) RETURNS jsonb AS $$
      DECLARE
        lot inventory_pipeline_lots%ROWTYPE;
        v_handle text;
        v_qty int;
        v_inc jsonb;
      BEGIN
        SELECT * INTO lot
        FROM inventory_pipeline_lots
        WHERE id = p_lot_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RETURN jsonb_build_object('ok', false, 'error', 'lot not found');
        END IF;

        IF lot.status = 'released' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'lot already released');
        END IF;

        IF lot.status = 'cancelled' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'lot is cancelled');
        END IF;

        IF lot.status <> 'received_awaiting_testing' THEN
          RETURN jsonb_build_object(
            'ok', false,
            'error', 'lot must be received_awaiting_testing before release'
          );
        END IF;

        -- Require an explicitly recorded received quantity (never infer from ordered).
        IF lot.quantity_received IS NULL OR lot.quantity_received <= 0 THEN
          RETURN jsonb_build_object(
            'ok', false,
            'error', 'Record quantity received before releasing inventory.'
          );
        END IF;

        v_qty := lot.quantity_received;

        SELECT handle INTO v_handle
        FROM products
        WHERE sku = lot.sku
        LIMIT 1;

        IF v_handle IS NULL THEN
          RETURN jsonb_build_object('ok', false, 'error', 'no product for sku');
        END IF;

        v_inc := inventory_increment_stock(v_handle, v_qty, lot.sku);
        IF COALESCE((v_inc->>'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_inc;
        END IF;

        UPDATE inventory_pipeline_lots
        SET
          status = 'released',
          released_at = now(),
          updated_at = now()
        WHERE id = p_lot_id
          AND status <> 'released';

        IF NOT FOUND THEN
          RETURN jsonb_build_object('ok', false, 'error', 'lot already released');
        END IF;

        RETURN jsonb_build_object(
          'ok', true,
          'handle', v_handle,
          'sku', lot.sku,
          'quantity', v_qty,
          'old_stock', (v_inc->>'old_stock')::int,
          'new_stock', (v_inc->>'new_stock')::int
        );
      END;
      $$ LANGUAGE plpgsql
    `;
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}
