import { getSql } from "@/lib/db/sql";

import type { Order, OrderStatus } from "./types";

let schemaReady: Promise<void> | null = null;

export async function ensureOrdersSchema(): Promise<void> {
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
    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS customer_email_sent BOOLEAN NOT NULL DEFAULT false
    `;
    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS customer_email_claimed_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS customer_email_error TEXT
    `;
    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS discount_code TEXT
    `;
    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0
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
  discount_code: string | null;
  discount_amount: string | number;
  tax_rate: string | number;
  tax: string | number;
  shipping_cost: string | number;
  total: string | number;
  invoice_id: string | null;
  invoice_created_at: string | null;
  paid_at: string | null;
  email_sent: boolean;
  email_error: string | null;
  customer_email_sent: boolean;
  customer_email_error: string | null;
  stock_decremented: boolean;
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
    discountCode: row.discount_code ?? null,
    discountAmount: Number(row.discount_amount ?? 0),
    taxRate: Number(row.tax_rate),
    tax: Number(row.tax),
    shippingCost: Number(row.shipping_cost),
    total: Number(row.total),
    invoiceId: row.invoice_id ?? null,
    invoiceCreatedAt: row.invoice_created_at
      ? new Date(row.invoice_created_at).toISOString()
      : null,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    emailSent: row.email_sent,
    emailError: row.email_error ?? null,
    customerEmailSent: row.customer_email_sent ?? false,
    customerEmailError: row.customer_email_error ?? null,
    stockDecremented: row.stock_decremented ?? false,
  };
}

export async function getOrder(orderId: string): Promise<Order | null> {
  await ensureOrdersSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM orders WHERE order_id = ${orderId} LIMIT 1
  `) as OrderRow[];
  return rows.length ? rowToOrder(rows[0]) : null;
}

export async function getOrderByInvoice(
  invoiceId: string
): Promise<Order | null> {
  await ensureOrdersSchema();
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
  await ensureOrdersSchema();
  const sql = getSql();
  await sql`
    UPDATE orders
    SET invoice_id = ${invoiceId},
        invoice_created_at = now(),
        updated_at = now()
    WHERE order_id = ${orderId}
  `;
}

export async function markStatusIfPending(
  orderId: string,
  status: Extract<OrderStatus, "cancelled" | "failed">
): Promise<void> {
  await ensureOrdersSchema();
  const sql = getSql();
  await sql`
    UPDATE orders SET status = ${status}, updated_at = now()
    WHERE order_id = ${orderId} AND status = 'pending'
  `;
}

export async function claimOrderEmail(orderId: string): Promise<boolean> {
  await ensureOrdersSchema();
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
  await ensureOrdersSchema();
  const sql = getSql();
  await sql`
    UPDATE orders SET email_sent = true, email_error = NULL, updated_at = now()
    WHERE order_id = ${orderId}
  `;
}

export async function releaseOrderEmail(
  orderId: string,
  error: string
): Promise<void> {
  await ensureOrdersSchema();
  const sql = getSql();
  await sql`
    UPDATE orders SET email_claimed_at = NULL, email_error = ${error}, updated_at = now()
    WHERE order_id = ${orderId}
  `;
}

export async function claimCustomerOrderEmail(
  orderId: string
): Promise<boolean> {
  await ensureOrdersSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE orders SET customer_email_claimed_at = now(), updated_at = now()
    WHERE order_id = ${orderId}
      AND customer_email_sent = false
      AND (
        customer_email_claimed_at IS NULL
        OR customer_email_claimed_at < now() - interval '10 minutes'
      )
    RETURNING order_id
  `) as { order_id: string }[];
  return rows.length > 0;
}

export async function markCustomerEmailSent(orderId: string): Promise<void> {
  await ensureOrdersSchema();
  const sql = getSql();
  await sql`
    UPDATE orders
    SET customer_email_sent = true,
        customer_email_error = NULL,
        updated_at = now()
    WHERE order_id = ${orderId}
  `;
}

export async function releaseCustomerOrderEmail(
  orderId: string,
  error: string
): Promise<void> {
  await ensureOrdersSchema();
  const sql = getSql();
  await sql`
    UPDATE orders
    SET customer_email_claimed_at = NULL,
        customer_email_error = ${error},
        updated_at = now()
    WHERE order_id = ${orderId}
  `;
}
