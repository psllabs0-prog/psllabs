import { getSql } from "@/lib/db/sql";
import type { Order } from "@/lib/orders/types";
import { ensureOrdersSchema } from "@/lib/orders/store";
import type { StockStatus } from "@/lib/products/stock";

import {
  availabilityToStockStatus,
  INVOICE_EXPIRY_MINUTES,
  LOW_STOCK_THRESHOLD,
  PENDING_GRACE_MINUTES,
} from "./constants";

let schemaReady: Promise<void> | null = null;

export async function ensureInventorySchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await ensureOrdersSchema();
    const sql = getSql();

    await sql`
      CREATE TABLE IF NOT EXISTS products (
        handle  TEXT PRIMARY KEY,
        name    TEXT NOT NULL,
        stock   INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
      )
    `;

    await sql`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS tagada_product_id VARCHAR
    `;
    await sql`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS tagada_variant_id VARCHAR
    `;
    await sql`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS tagada_price_id VARCHAR
    `;
    await sql`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS low_stock_alert_sent_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS sku TEXT
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS products_sku_idx
      ON products (sku)
      WHERE sku IS NOT NULL
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS stock_history (
        id          BIGSERIAL PRIMARY KEY,
        handle      TEXT NOT NULL,
        sku         TEXT,
        old_stock   INTEGER NOT NULL,
        new_stock   INTEGER NOT NULL,
        changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS stock_history_changed_at_idx
      ON stock_history (changed_at DESC)
    `;

    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS invoice_created_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS stock_decremented BOOLEAN NOT NULL DEFAULT false
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS orders_pending_reservation_idx
      ON orders (status, invoice_created_at)
      WHERE status = 'pending'
    `;

    await sql`
      CREATE OR REPLACE FUNCTION inventory_reserved_qty(
        p_handle text,
        p_expiry_minutes int,
        p_grace_minutes int
      ) RETURNS int AS $$
        SELECT COALESCE(SUM((elem->>'quantity')::int), 0)::int
        FROM orders o
        CROSS JOIN LATERAL jsonb_array_elements(o.items) AS elem
        WHERE o.status = 'pending'
          AND elem->>'handle' = p_handle
          AND (
            (
              o.invoice_created_at IS NOT NULL
              AND o.invoice_created_at > now() - make_interval(mins => p_expiry_minutes)
            )
            OR (
              o.invoice_created_at IS NULL
              AND o.created_at > now() - make_interval(mins => p_grace_minutes)
            )
          );
      $$ LANGUAGE sql STABLE
    `;

    await sql`
      DROP FUNCTION IF EXISTS checkout_create_order(
        text, text, text, jsonb, jsonb,
        numeric, numeric, numeric, numeric, numeric,
        int, int
      )
    `;

    await sql`
      CREATE OR REPLACE FUNCTION checkout_create_order(
        p_order_id text,
        p_currency text,
        p_email text,
        p_shipping jsonb,
        p_items jsonb,
        p_subtotal numeric,
        p_tax_rate numeric,
        p_tax numeric,
        p_shipping_cost numeric,
        p_total numeric,
        p_discount_code text,
        p_discount_amount numeric,
        p_expiry_minutes int,
        p_grace_minutes int
      ) RETURNS jsonb AS $$
      DECLARE
        item jsonb;
        v_handle text;
        v_qty int;
        v_stock int;
        v_reserved int;
        v_available int;
        v_name text;
      BEGIN
        PERFORM p.handle
        FROM products p
        WHERE p.handle IN (
          SELECT elem->>'handle' FROM jsonb_array_elements(p_items) AS elem
        )
        FOR UPDATE;

        FOR item IN SELECT value FROM jsonb_array_elements(p_items)
        LOOP
          v_handle := item->>'handle';
          v_qty := (item->>'quantity')::int;
          v_name := item->>'name';

          IF EXISTS (SELECT 1 FROM products WHERE handle = v_handle) THEN
            SELECT stock INTO v_stock FROM products WHERE handle = v_handle;
            v_reserved := inventory_reserved_qty(
              v_handle, p_expiry_minutes, p_grace_minutes
            );
            v_available := v_stock - v_reserved;

            IF v_qty > v_available THEN
              RETURN jsonb_build_object(
                'ok', false,
                'error', format('Insufficient stock for %s.', v_name)
              );
            END IF;
          END IF;
        END LOOP;

        INSERT INTO orders (
          order_id, status, currency, email, shipping, items,
          subtotal, tax_rate, tax, shipping_cost, total,
          discount_code, discount_amount,
          invoice_id, paid_at, email_sent, email_error, stock_decremented
        ) VALUES (
          p_order_id, 'pending', p_currency, p_email, p_shipping, p_items,
          p_subtotal, p_tax_rate, p_tax, p_shipping_cost, p_total,
          p_discount_code, p_discount_amount,
          NULL, NULL, false, NULL, false
        );

        RETURN jsonb_build_object('ok', true);
      END;
      $$ LANGUAGE plpgsql
    `;

    await sql`
      CREATE OR REPLACE FUNCTION settle_paid_order(
        p_order_id text,
        p_invoice_id text
      ) RETURNS jsonb AS $$
      DECLARE
        ord orders%ROWTYPE;
        item jsonb;
        v_handle text;
        v_qty int;
        v_updated int;
        v_decrement_failed boolean := false;
        v_was_newly_paid boolean := false;
      BEGIN
        SELECT * INTO ord FROM orders WHERE order_id = p_order_id FOR UPDATE;

        IF NOT FOUND THEN
          RETURN jsonb_build_object(
            'ok', false,
            'was_newly_paid', false,
            'stock_decrement_failed', false
          );
        END IF;

        IF ord.status = 'paid' AND ord.stock_decremented THEN
          RETURN jsonb_build_object(
            'ok', true,
            'was_newly_paid', false,
            'stock_decrement_failed', false
          );
        END IF;

        IF ord.status <> 'paid' THEN
          UPDATE orders
          SET status = 'paid',
              paid_at = COALESCE(paid_at, now()),
              invoice_id = COALESCE(invoice_id, p_invoice_id),
              updated_at = now()
          WHERE order_id = p_order_id AND status <> 'paid';
          v_was_newly_paid := true;
        END IF;

        IF NOT ord.stock_decremented THEN
          PERFORM p.handle
          FROM products p
          WHERE p.handle IN (
            SELECT elem->>'handle' FROM jsonb_array_elements(ord.items) AS elem
          )
          FOR UPDATE;

          FOR item IN SELECT value FROM jsonb_array_elements(ord.items)
          LOOP
            v_handle := item->>'handle';
            v_qty := (item->>'quantity')::int;

            IF EXISTS (SELECT 1 FROM products WHERE handle = v_handle) THEN
              UPDATE products
              SET stock = stock - v_qty
              WHERE handle = v_handle AND stock >= v_qty;

              GET DIAGNOSTICS v_updated = ROW_COUNT;
              IF v_updated = 0 THEN
                v_decrement_failed := true;
              END IF;
            END IF;
          END LOOP;

          UPDATE orders
          SET stock_decremented = true, updated_at = now()
          WHERE order_id = p_order_id;
        END IF;

        RETURN jsonb_build_object(
          'ok', true,
          'was_newly_paid', v_was_newly_paid,
          'stock_decrement_failed', v_decrement_failed
        );
      END;
      $$ LANGUAGE plpgsql
    `;
  })();
  return schemaReady;
}

export type CheckoutStockResult =
  | { ok: true }
  | { ok: false; error: string };

export async function checkoutWithStockCheck(
  order: Order
): Promise<CheckoutStockResult> {
  await ensureInventorySchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT checkout_create_order(
      ${order.orderId},
      ${order.currency},
      ${order.email},
      ${JSON.stringify(order.shipping)}::jsonb,
      ${JSON.stringify(order.items)}::jsonb,
      ${order.subtotal},
      ${order.taxRate},
      ${order.tax},
      ${order.shippingCost},
      ${order.total},
      ${order.discountCode},
      ${order.discountAmount},
      ${INVOICE_EXPIRY_MINUTES},
      ${PENDING_GRACE_MINUTES}
    ) AS result
  `) as { result: { ok: boolean; error?: string } }[];

  const result = rows[0]?.result;
  if (!result?.ok) {
    return {
      ok: false,
      error: result?.error ?? "Insufficient stock.",
    };
  }

  // Attribution is attached after create so the stock-reservation function
  // signature stays stable. Best-effort; never fail checkout on attribution write.
  if (order.attribution) {
    try {
      await sql`
        UPDATE orders
        SET attribution = ${JSON.stringify(order.attribution)}::jsonb,
            updated_at = now()
        WHERE order_id = ${order.orderId}
      `;
    } catch (error) {
      console.error(
        `[inventory] attribution write failed for ${order.orderId}:`,
        error
      );
    }
  }

  return { ok: true };
}

export type SettlePaidResult = {
  ok: boolean;
  wasNewlyPaid: boolean;
  stockDecrementFailed: boolean;
};

export async function settlePaidOrder(
  orderId: string,
  invoiceId: string | null
): Promise<SettlePaidResult> {
  await ensureInventorySchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT settle_paid_order(${orderId}, ${invoiceId}) AS result
  `) as {
    result: {
      ok: boolean;
      was_newly_paid: boolean;
      stock_decrement_failed: boolean;
    };
  }[];

  const result = rows[0]?.result;
  return {
    ok: result?.ok ?? false,
    wasNewlyPaid: result?.was_newly_paid ?? false,
    stockDecrementFailed: result?.stock_decrement_failed ?? false,
  };
}

export async function ensureProductTracked(
  handle: string,
  name: string,
  sku?: string | null
): Promise<void> {
  await ensureInventorySchema();
  const sql = getSql();
  await sql`
    INSERT INTO products (handle, name, stock, sku)
    VALUES (${handle}, ${name}, 0, ${sku ?? null})
    ON CONFLICT (handle) DO UPDATE
    SET sku = COALESCE(products.sku, EXCLUDED.sku)
  `;
}

export async function setProductStock(
  handle: string,
  name: string,
  stock: number,
  sku?: string | null
): Promise<void> {
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error("Stock must be a non-negative integer.");
  }
  await ensureInventorySchema();
  const sql = getSql();

  const existing = (await sql`
    SELECT stock, sku FROM products WHERE handle = ${handle} LIMIT 1
  `) as { stock: number; sku: string | null }[];

  const oldStock = existing[0]?.stock ?? 0;
  const resolvedSku = sku ?? existing[0]?.sku ?? null;

  await sql`
    INSERT INTO products (handle, name, stock, sku)
    VALUES (${handle}, ${name}, ${stock}, ${resolvedSku})
    ON CONFLICT (handle) DO UPDATE
    SET
      name = EXCLUDED.name,
      stock = EXCLUDED.stock,
      sku = COALESCE(EXCLUDED.sku, products.sku),
      low_stock_alert_sent_at = CASE
        WHEN EXCLUDED.stock >= ${LOW_STOCK_THRESHOLD} THEN NULL
        ELSE products.low_stock_alert_sent_at
      END
  `;

  if (oldStock !== stock) {
    await sql`
      INSERT INTO stock_history (handle, sku, old_stock, new_stock)
      VALUES (${handle}, ${resolvedSku}, ${oldStock}, ${stock})
    `;
  }
}

export type StockBySkuRow = {
  handle: string;
  sku: string;
  stock: number;
};

/** Raw stock count from the database by catalog SKU. */
export async function getStockBySku(sku: string): Promise<StockBySkuRow | null> {
  await ensureInventorySchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT handle, sku, stock
    FROM products
    WHERE sku = ${sku}
    LIMIT 1
  `) as StockBySkuRow[];
  return rows[0] ?? null;
}

export async function setProductStockBySku(
  sku: string,
  stock: number
): Promise<{ handle: string; sku: string; stock: number }> {
  await ensureInventorySchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT handle, name, sku FROM products WHERE sku = ${sku} LIMIT 1
  `) as { handle: string; name: string; sku: string | null }[];

  const row = rows[0];
  if (!row) {
    throw new Error(`No product found for SKU ${sku}.`);
  }

  await setProductStock(row.handle, row.name, stock, row.sku ?? sku);
  return { handle: row.handle, sku, stock };
}

export type AdminInventoryProductRow = {
  name: string;
  sku: string;
  currentStock: number;
  status: "active" | "coming_soon" | "untracked";
};

export async function getAdminInventoryProductRows(): Promise<
  AdminInventoryProductRow[]
> {
  await ensureInventorySchema();
  const sql = getSql();
  const { catalogProducts } = await import("@/lib/products/catalog");

  const stockRows = (await sql`
    SELECT handle, name, sku, stock FROM products ORDER BY name ASC
  `) as { handle: string; name: string; sku: string | null; stock: number }[];

  const stockByHandle = new Map(stockRows.map((row) => [row.handle, row]));
  const stockBySku = new Map(
    stockRows.filter((row) => row.sku).map((row) => [row.sku!, row])
  );

  return catalogProducts.map((product) => {
    const tracked =
      stockByHandle.get(product.handle) ??
      stockBySku.get(product.sku) ??
      null;

    return {
      name: product.name,
      sku: product.sku,
      currentStock: tracked?.stock ?? 0,
      status: product.status,
    };
  });
}

export type StockHistoryRow = {
  id: string;
  handle: string;
  sku: string | null;
  oldStock: number;
  newStock: number;
  changedAt: string;
};

export async function getRecentStockHistory(
  limit = 10
): Promise<StockHistoryRow[]> {
  await ensureInventorySchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, handle, sku, old_stock, new_stock, changed_at
    FROM stock_history
    ORDER BY changed_at DESC
    LIMIT ${limit}
  `) as {
    id: string;
    handle: string;
    sku: string | null;
    old_stock: number;
    new_stock: number;
    changed_at: string;
  }[];

  return rows.map((row) => ({
    id: String(row.id),
    handle: row.handle,
    sku: row.sku,
    oldStock: row.old_stock,
    newStock: row.new_stock,
    changedAt: row.changed_at,
  }));
}

export type AdminInventoryRow = {
  handle: string;
  name: string;
  sku: string | null;
  stock: number;
};

export async function getAdminInventoryRows(): Promise<AdminInventoryRow[]> {
  await ensureInventorySchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT handle, name, sku, stock
    FROM products
    ORDER BY name ASC, handle ASC
  `) as AdminInventoryRow[];
  return rows;
}

export type LowStockProductRow = {
  handle: string;
  name: string;
  stock: number;
};

/** Active catalog products tracked in inventory with stock below threshold. */
export async function getLowStockProducts(
  threshold = LOW_STOCK_THRESHOLD
): Promise<LowStockProductRow[]> {
  await ensureInventorySchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT handle, name, stock
    FROM products
    WHERE stock < ${threshold}
    ORDER BY stock ASC, handle ASC
  `) as LowStockProductRow[];
  return rows;
}

export async function shouldSendLowStockAlert(
  handle: string,
  threshold = LOW_STOCK_THRESHOLD
): Promise<boolean> {
  await ensureInventorySchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT handle FROM products
    WHERE handle = ${handle}
      AND stock < ${threshold}
      AND (
        low_stock_alert_sent_at IS NULL
        OR low_stock_alert_sent_at < now() - interval '23 hours'
      )
    LIMIT 1
  `) as { handle: string }[];
  return rows.length > 0;
}

export async function markLowStockAlertSent(handle: string): Promise<void> {
  await ensureInventorySchema();
  const sql = getSql();
  await sql`
    UPDATE products SET low_stock_alert_sent_at = now() WHERE handle = ${handle}
  `;
}

export async function isInventoryTracked(handle: string): Promise<boolean> {
  await ensureInventorySchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT handle FROM products WHERE handle = ${handle} LIMIT 1
  `) as { handle: string }[];
  return rows.length > 0;
}

type AvailabilityQueryRow = {
  handle: string;
  tracked: boolean;
  stock: number;
  reserved: number;
};

export async function getAvailabilityForHandles(
  handles: string[],
  fallbackStatus: StockStatus = "in_stock"
): Promise<
  {
    handle: string;
    tracked: boolean;
    stock: number;
    reserved: number;
    available: number;
    status: StockStatus;
  }[]
> {
  if (handles.length === 0) return [];

  await ensureInventorySchema();
  const sql = getSql();

  const rows = (await sql`
    WITH requested AS (
      SELECT unnest(${handles}::text[]) AS handle
    ),
    tracked AS (
      SELECT r.handle, p.stock
      FROM requested r
      JOIN products p ON p.handle = r.handle
    )
    SELECT
      r.handle,
      (t.handle IS NOT NULL) AS tracked,
      COALESCE(t.stock, 0) AS stock,
      CASE
        WHEN t.handle IS NULL THEN 0
        ELSE inventory_reserved_qty(
          r.handle,
          ${INVOICE_EXPIRY_MINUTES},
          ${PENDING_GRACE_MINUTES}
        )
      END AS reserved
    FROM requested r
    LEFT JOIN tracked t ON t.handle = r.handle
  `) as {
    handle: string;
    tracked: boolean;
    stock: number;
    reserved: number;
  }[];

  return rows.map((row) => {
    const available = row.tracked
      ? Math.max(0, row.stock - row.reserved)
      : fallbackStatus === "out_of_stock"
        ? 0
        : 9999;
    const status = row.tracked
      ? availabilityToStockStatus(available, LOW_STOCK_THRESHOLD)
      : fallbackStatus;

    return {
      handle: row.handle,
      tracked: row.tracked,
      stock: row.stock,
      reserved: row.reserved,
      available,
      status,
    };
  });
}

export async function getStockLevels(
  handles: string[]
): Promise<Record<string, number | null>> {
  if (handles.length === 0) return {};

  await ensureInventorySchema();
  const sql = getSql();
  const unique = [...new Set(handles)];

  const rows = (await sql`
    SELECT handle, stock FROM products WHERE handle = ANY(${unique})
  `) as { handle: string; stock: number }[];

  const map: Record<string, number | null> = {};
  for (const handle of unique) {
    map[handle] = null;
  }
  for (const row of rows) {
    map[row.handle] = row.stock;
  }
  return map;
}
