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

export async function setProductStock(
  handle: string,
  name: string,
  stock: number
): Promise<void> {
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error("Stock must be a non-negative integer.");
  }
  await ensureInventorySchema();
  const sql = getSql();
  await sql`
    INSERT INTO products (handle, name, stock)
    VALUES (${handle}, ${name}, ${stock})
    ON CONFLICT (handle) DO UPDATE
    SET name = EXCLUDED.name, stock = EXCLUDED.stock
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
