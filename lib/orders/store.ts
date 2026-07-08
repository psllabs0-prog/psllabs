import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import type { Order, OrderStatus } from "./types";

let sqlClient: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<void> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (sqlClient) return sqlClient;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "Order store is not configured: set DATABASE_URL (Vercel Postgres / Neon)."
    );
  }
  sqlClient = neon(url);
  return sqlClient;
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  const sql = getSql();
  schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS orders (
        order_id         TEXT PRIMARY KEY,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        status           TEXT NOT NULL DEFAULT 'pending',
        currency         TEXT NOT NULL DEFAULT 'USD',
        email            TEXT NOT NULL,
        shipping         JSONB NOT NULL,
        items            JSONB NOT NULL,
        subtotal         NUMERIC(10,2) NOT NULL,
        tax_rate         NUMERIC(6,4) NOT NULL DEFAULT 0,
        tax              NUMERIC(10,2) NOT NULL DEFAULT 0,
        shipping_cost    NUMERIC(10,2) NOT NULL DEFAULT 0,
        total            NUMERIC(10,2) NOT NULL,
        invoice_id       TEXT,
        paid_at          TIMESTAMPTZ,
        email_sent       BOOLEAN NOT NULL DEFAULT false,
        email_claimed_at TIMESTAMPTZ,
        email_error      TEXT
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS orders_invoice_id_idx ON orders (invoice_id)
    `;
  })();
  return schemaReady;
}

type OrderRow = {
  order_id: string;
  created_at: string;
  updated_at: string;
  status: OrderStatus;
  currency: string;
  email: string;
  shipping: Order["shipping"] | string;
  items: Order["items"] | string;
  subtotal: string | number;
  tax_rate: string | number;
  tax: string | number;
  shipping_cost: string | number;
  total: string | number;
  invoice_id: string | null;
  paid_at: string | null;
  email_sent: boolean;
  email_error: string | null;
};

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function rowToOrder(row: OrderRow): Order {
  return {
    orderId: row.order_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    status: row.status,
    currency: row.currency,
    email: row.email,
    shipping: parseJson(row.shipping),
    items: parseJson(row.items),
    subtotal: Number(row.subtotal),
    taxRate: Number(row.tax_rate),
    tax: Number(row.tax),
    shippingCost: Number(row.shipping_cost),
    total: Number(row.total),
    invoiceId: row.invoice_id ?? null,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    emailSent: row.email_sent,
    emailError: row.email_error ?? null,
  };
}

export async function createOrder(order: Order): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO orders (
      order_id, status, currency, email, shipping, items,
      subtotal, tax_rate, tax, shipping_cost, total,
      invoice_id, paid_at, email_sent, email_error
    ) VALUES (
      ${order.orderId}, ${order.status}, ${order.currency}, ${order.email},
      ${JSON.stringify(order.shipping)}::jsonb, ${JSON.stringify(order.items)}::jsonb,
      ${order.subtotal}, ${order.taxRate}, ${order.tax}, ${order.shippingCost}, ${order.total},
      ${order.invoiceId}, ${order.paidAt}, ${order.emailSent}, ${order.emailError}
    )
  `;
}

export async function getOrder(orderId: string): Promise<Order | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM orders WHERE order_id = ${orderId} LIMIT 1
  `) as OrderRow[];
  return rows.length ? rowToOrder(rows[0]) : null;
}

export async function getOrderByInvoice(
  invoiceId: string
): Promise<Order | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM orders WHERE invoice_id = ${invoiceId} LIMIT 1
  `) as OrderRow[];
  return rows.length ? rowToOrder(rows[0]) : null;
}

export async function setInvoiceId(
  orderId: string,
  invoiceId: string
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE orders SET invoice_id = ${invoiceId}, updated_at = now()
    WHERE order_id = ${orderId}
  `;
}

// Idempotent: only transitions to paid once; safe under duplicate webhooks.
export async function markPaid(
  orderId: string,
  invoiceId: string | null
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE orders
    SET status = 'paid',
        paid_at = COALESCE(paid_at, now()),
        invoice_id = COALESCE(invoice_id, ${invoiceId}),
        updated_at = now()
    WHERE order_id = ${orderId} AND status <> 'paid'
  `;
}

// Only fails/cancels an order that is still pending — never overrides a paid order.
export async function markStatusIfPending(
  orderId: string,
  status: Extract<OrderStatus, "cancelled" | "failed">
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE orders SET status = ${status}, updated_at = now()
    WHERE order_id = ${orderId} AND status = 'pending'
  `;
}

/**
 * Atomically claim the right to send this order's notification email.
 * Returns true only for the first caller (or after a stale 10-minute claim),
 * guaranteeing one email per order even with duplicate webhook deliveries.
 */
export async function claimOrderEmail(orderId: string): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE orders SET email_claimed_at = now(), updated_at = now()
    WHERE order_id = ${orderId}
      AND email_sent = false
      AND (email_claimed_at IS NULL OR email_claimed_at < now() - interval '10 minutes')
    RETURNING order_id
  `) as { order_id: string }[];
  return rows.length > 0;
}

export async function markEmailSent(orderId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE orders SET email_sent = true, email_error = NULL, updated_at = now()
    WHERE order_id = ${orderId}
  `;
}

// Release the claim after a failed send so a webhook redelivery can retry.
export async function releaseOrderEmail(
  orderId: string,
  error: string
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE orders SET email_claimed_at = NULL, email_error = ${error}, updated_at = now()
    WHERE order_id = ${orderId}
  `;
}
