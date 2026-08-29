import { getSql } from "@/lib/db/sql";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import type { Order } from "@/lib/orders/types";

export type LedgerRecordType = "SALE" | "EXPENSE";

export type LedgerRow = {
  id: number;
  createdAt: string;
  recordType: LedgerRecordType;
  orderId: string | null;
  sku: string | null;
  quantity: number | null;
  grossRevenueUsd: number;
  transactionFees: number;
  expenseName: string | null;
  notes: string | null;
};

export type LedgerKpi = {
  totalRevenue: number;
  totalExpenses: number;
  netMargin: number;
  marginPercentage: number | null;
};

let schemaReady: Promise<void> | null = null;

export async function ensureLedgerSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS financial_ledger (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        record_type VARCHAR(20) NOT NULL,
        order_id VARCHAR(255),
        sku VARCHAR(50),
        quantity INTEGER,
        gross_revenue_usd NUMERIC(10,2),
        transaction_fees NUMERIC(10,2) NOT NULL DEFAULT 0,
        expense_name VARCHAR(255),
        notes TEXT
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS financial_ledger_created_at_idx
      ON financial_ledger (created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS financial_ledger_order_sale_idx
      ON financial_ledger (order_id)
      WHERE record_type = 'SALE'
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS financial_ledger_sale_order_unique
      ON financial_ledger (order_id)
      WHERE record_type = 'SALE' AND order_id IS NOT NULL
    `;
  })();
  return schemaReady;
}

function rowToLedger(row: {
  id: number;
  created_at: string;
  record_type: string;
  order_id: string | null;
  sku: string | null;
  quantity: number | null;
  gross_revenue_usd: string | number;
  transaction_fees: string | number;
  expense_name: string | null;
  notes: string | null;
}): LedgerRow {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).toISOString(),
    recordType: row.record_type as LedgerRecordType,
    orderId: row.order_id,
    sku: row.sku,
    quantity: row.quantity,
    grossRevenueUsd: Number(row.gross_revenue_usd),
    transactionFees: Number(row.transaction_fees),
    expenseName: row.expense_name,
    notes: row.notes,
  };
}

function orderSkuSummary(order: Order): { sku: string; quantity: number } {
  const skus = order.items.map((item) => {
    const catalog = getCatalogProductByHandle(item.handle);
    return catalog?.sku ?? item.handle.toUpperCase();
  });
  const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return {
    sku: skus.join(", "),
    quantity,
  };
}

export async function hasSaleForOrder(orderId: string): Promise<boolean> {
  await ensureLedgerSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id FROM financial_ledger
    WHERE record_type = 'SALE' AND order_id = ${orderId}
    LIMIT 1
  `) as { id: number }[];
  return rows.length > 0;
}

/** Idempotent — skips if a SALE row already exists for this order. */
export async function logSaleIfNew(
  order: Order,
  payment: "bitcoin" | "card"
): Promise<boolean> {
  await ensureLedgerSchema();

  if (await hasSaleForOrder(order.orderId)) {
    return false;
  }

  const { sku, quantity } = orderSkuSummary(order);
  const sql = getSql();

  const rows = (await sql`
    INSERT INTO financial_ledger (
      record_type,
      order_id,
      sku,
      quantity,
      gross_revenue_usd,
      transaction_fees,
      expense_name,
      notes
    )
    SELECT
      'SALE',
      ${order.orderId},
      ${sku},
      ${quantity},
      ${order.total},
      0,
      NULL,
      ${payment === "bitcoin" ? "Bitcoin payment" : "Card payment"}
    WHERE NOT EXISTS (
      SELECT 1 FROM financial_ledger
      WHERE record_type = 'SALE' AND order_id = ${order.orderId}
    )
    RETURNING id
  `) as { id: number }[];

  return rows.length > 0;
}

export async function insertExpense(params: {
  expenseName: string;
  costUsd: number;
  notes?: string | null;
}): Promise<LedgerRow> {
  await ensureLedgerSchema();
  const sql = getSql();

  const rows = (await sql`
    INSERT INTO financial_ledger (
      record_type,
      order_id,
      sku,
      quantity,
      gross_revenue_usd,
      transaction_fees,
      expense_name,
      notes
    ) VALUES (
      'EXPENSE',
      NULL,
      NULL,
      NULL,
      ${params.costUsd},
      0,
      ${params.expenseName},
      ${params.notes ?? null}
    )
    RETURNING *
  `) as Array<{
    id: number;
    created_at: string;
    record_type: string;
    order_id: string | null;
    sku: string | null;
    quantity: number | null;
    gross_revenue_usd: string | number;
    transaction_fees: string | number;
    expense_name: string | null;
    notes: string | null;
  }>;

  return rowToLedger(rows[0]);
}

export async function getLedgerRows(): Promise<LedgerRow[]> {
  await ensureLedgerSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT *
    FROM financial_ledger
    ORDER BY created_at DESC
  `) as Array<{
    id: number;
    created_at: string;
    record_type: string;
    order_id: string | null;
    sku: string | null;
    quantity: number | null;
    gross_revenue_usd: string | number;
    transaction_fees: string | number;
    expense_name: string | null;
    notes: string | null;
  }>;

  return rows.map(rowToLedger);
}

export async function getLedgerKpi(): Promise<LedgerKpi> {
  await ensureLedgerSchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT
      COALESCE(SUM(gross_revenue_usd) FILTER (WHERE record_type = 'SALE'), 0) AS total_revenue,
      COALESCE(SUM(gross_revenue_usd) FILTER (WHERE record_type = 'EXPENSE'), 0) AS total_expenses
    FROM financial_ledger
  `) as { total_revenue: string | number; total_expenses: string | number }[];

  const totalRevenue = Number(rows[0]?.total_revenue ?? 0);
  const totalExpenses = Number(rows[0]?.total_expenses ?? 0);
  const netMargin = totalRevenue - totalExpenses;
  const marginPercentage =
    totalRevenue > 0 ? (netMargin / totalRevenue) * 100 : null;

  return {
    totalRevenue,
    totalExpenses,
    netMargin,
    marginPercentage,
  };
}
