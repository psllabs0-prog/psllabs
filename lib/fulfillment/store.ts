import { getSql } from "@/lib/db/sql";
import { ensureOrdersSchema, getOrder } from "@/lib/orders/store";
import type { Order, OrderItem } from "@/lib/orders/types";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { listOpenReconciliationWarnings } from "@/lib/finance/store";

import {
  ensureFulfillmentSchema,
  type FulfillmentWorkflowStatus,
} from "./schema";

export type FulfillmentCard = {
  orderId: string;
  createdAt: string;
  paidAt: string | null;
  paymentMethod: string | null;
  status: string;
  email: string;
  customerName: string;
  items: Array<{
    handle: string;
    name: string;
    strength: string;
    sku: string | null;
    quantity: number;
  }>;
  shipping: Order["shipping"];
  workflowStatus: FulfillmentWorkflowStatus;
  holdReason: string | null;
  ownerNote: string | null;
  packingStartedAt: string | null;
  packedAt: string | null;
  blocker: string | null;
  bucket: "ready" | "hold" | "packed";
};

export type WarehouseSummary = {
  readyOrders: number;
  unitsToPick: number;
  holds: number;
  packedWaitingTracking: number;
};

function itemSku(item: OrderItem): string | null {
  const product = getCatalogProductByHandle(item.handle);
  return product?.sku ?? null;
}

function customerName(order: Order): string {
  return `${order.shipping.firstName} ${order.shipping.lastName}`.trim();
}

export async function upsertFulfillmentWorkflow(input: {
  orderId: string;
  workflowStatus: FulfillmentWorkflowStatus;
  holdReason?: string | null;
  ownerNote?: string | null;
  packingStartedAt?: string | null;
  packedAt?: string | null;
}): Promise<void> {
  await ensureFulfillmentSchema();
  const sql = getSql();
  await sql`
    INSERT INTO fulfillment_workflow (
      order_id, workflow_status, hold_reason, packing_started_at, packed_at, owner_note, updated_at
    ) VALUES (
      ${input.orderId},
      ${input.workflowStatus},
      ${input.holdReason ?? null},
      ${input.packingStartedAt ?? null}::timestamptz,
      ${input.packedAt ?? null}::timestamptz,
      ${input.ownerNote ?? null},
      now()
    )
    ON CONFLICT (order_id) DO UPDATE SET
      workflow_status = EXCLUDED.workflow_status,
      hold_reason = EXCLUDED.hold_reason,
      packing_started_at = COALESCE(EXCLUDED.packing_started_at, fulfillment_workflow.packing_started_at),
      packed_at = COALESCE(EXCLUDED.packed_at, fulfillment_workflow.packed_at),
      owner_note = CASE
        WHEN EXCLUDED.owner_note IS NULL THEN fulfillment_workflow.owner_note
        ELSE EXCLUDED.owner_note
      END,
      updated_at = now()
  `;
}

/**
 * Legitimate paid orders needing fulfillment (not shipped, not QA-excluded).
 * Payment state from Neon orders only.
 */
export async function listFulfillmentEligibleOrders(
  limit = 100
): Promise<Order[]> {
  await ensureOrdersSchema();
  await ensureFulfillmentSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT o.order_id
    FROM orders o
    WHERE o.status = 'paid'
      AND (o.tracking_number IS NULL OR trim(o.tracking_number) = '')
      AND NOT EXISTS (
        SELECT 1 FROM finance_transactions ft
        WHERE ft.psl_order_id = o.order_id
          AND ft.reporting_excluded = true
      )
    ORDER BY o.paid_at ASC NULLS LAST, o.created_at ASC
    LIMIT ${limit}
  `) as Array<{ order_id: string }>;

  const orders: Order[] = [];
  for (const row of rows) {
    const order = await getOrder(row.order_id);
    if (order) orders.push(order);
  }
  return orders;
}

export async function getFulfillmentWorkflow(
  orderId: string
): Promise<{
  workflowStatus: FulfillmentWorkflowStatus;
  holdReason: string | null;
  packingStartedAt: string | null;
  packedAt: string | null;
  ownerNote: string | null;
} | null> {
  await ensureFulfillmentSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM fulfillment_workflow WHERE order_id = ${orderId} LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    workflowStatus: String(row.workflow_status) as FulfillmentWorkflowStatus,
    holdReason: row.hold_reason ? String(row.hold_reason) : null,
    packingStartedAt: row.packing_started_at
      ? new Date(String(row.packing_started_at)).toISOString()
      : null,
    packedAt: row.packed_at
      ? new Date(String(row.packed_at)).toISOString()
      : null,
    ownerNote: row.owner_note ? String(row.owner_note) : null,
  };
}

export async function collectFulfillmentBoard(): Promise<{
  ready: FulfillmentCard[];
  hold: FulfillmentCard[];
  packed: FulfillmentCard[];
  summary: WarehouseSummary;
  pickList: Array<{ label: string; quantity: number }>;
}> {
  const orders = await listFulfillmentEligibleOrders(150);
  const warnings = await listOpenReconciliationWarnings(100).catch(() => []);
  const warnByOrder = new Map<string, string>();
  for (const w of warnings) {
    if (w.pslOrderId) {
      warnByOrder.set(
        w.pslOrderId,
        `Payment reconciliation: ${w.warningType}`
      );
    }
  }

  const ready: FulfillmentCard[] = [];
  const hold: FulfillmentCard[] = [];
  const packed: FulfillmentCard[] = [];
  const pickMap = new Map<string, number>();

  for (const order of orders) {
    const wf = await getFulfillmentWorkflow(order.orderId);
    const autoBlocker = warnByOrder.get(order.orderId) ?? null;
    let workflowStatus: FulfillmentWorkflowStatus = wf?.workflowStatus ?? "ready";
    let holdReason = wf?.holdReason ?? null;
    let blocker = autoBlocker;

    if (autoBlocker && workflowStatus !== "packed") {
      workflowStatus = "hold";
      holdReason = holdReason ?? autoBlocker;
      blocker = autoBlocker;
    }

    const card: FulfillmentCard = {
      orderId: order.orderId,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      paymentMethod: order.paymentMethod,
      status: order.status,
      email: order.email,
      customerName: customerName(order),
      items: order.items.map((it) => ({
        handle: it.handle,
        name: it.name,
        strength: it.strength,
        sku: itemSku(it),
        quantity: it.quantity,
      })),
      shipping: order.shipping,
      workflowStatus,
      holdReason,
      ownerNote: wf?.ownerNote ?? null,
      packingStartedAt: wf?.packingStartedAt ?? null,
      packedAt: wf?.packedAt ?? null,
      blocker,
      bucket:
        workflowStatus === "hold"
          ? "hold"
          : workflowStatus === "packed"
            ? "packed"
            : "ready",
    };

    if (card.bucket === "hold") hold.push(card);
    else if (card.bucket === "packed") packed.push(card);
    else {
      ready.push(card);
      for (const it of card.items) {
        const label = `${it.name}${it.strength ? ` ${it.strength}` : ""}`.trim();
        pickMap.set(label, (pickMap.get(label) ?? 0) + it.quantity);
      }
    }
  }

  const pickList = [...pickMap.entries()]
    .map(([label, quantity]) => ({ label, quantity }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const unitsToPick = pickList.reduce((s, p) => s + p.quantity, 0);

  return {
    ready,
    hold,
    packed,
    summary: {
      readyOrders: ready.length,
      unitsToPick,
      holds: hold.length,
      packedWaitingTracking: packed.length,
    },
    pickList,
  };
}

export async function startPacking(orderId: string): Promise<boolean> {
  const order = await getOrder(orderId);
  if (!order || order.status !== "paid") return false;
  await upsertFulfillmentWorkflow({
    orderId,
    workflowStatus: "packing",
    packingStartedAt: new Date().toISOString(),
  });
  return true;
}

export async function markPacked(orderId: string): Promise<boolean> {
  const order = await getOrder(orderId);
  if (!order || order.status !== "paid") return false;
  await upsertFulfillmentWorkflow({
    orderId,
    workflowStatus: "packed",
    packedAt: new Date().toISOString(),
  });
  return true;
}

export async function placeManualHold(
  orderId: string,
  reason: string
): Promise<boolean> {
  const order = await getOrder(orderId);
  if (!order || order.status !== "paid") return false;
  await upsertFulfillmentWorkflow({
    orderId,
    workflowStatus: "hold",
    holdReason: reason.slice(0, 500) || "Manual hold",
  });
  return true;
}

export async function removeManualHold(orderId: string): Promise<boolean> {
  const order = await getOrder(orderId);
  if (!order || order.status !== "paid") return false;
  const warnings = await listOpenReconciliationWarnings(50).catch(() => []);
  const stillBlocked = warnings.some((w) => w.pslOrderId === orderId);
  if (stillBlocked) {
    await upsertFulfillmentWorkflow({
      orderId,
      workflowStatus: "hold",
      holdReason: "Payment reconciliation still open",
    });
    return false;
  }
  await upsertFulfillmentWorkflow({
    orderId,
    workflowStatus: "ready",
    holdReason: null,
  });
  return true;
}

/** When tracking is set, workflow row is operationally resolved (order SoT wins). */
export function isFulfillmentResolvedByShipping(order: {
  status: string;
  trackingNumber: string | null;
}): boolean {
  if (order.status === "shipped") return true;
  if (order.trackingNumber && order.trackingNumber.trim()) return true;
  return false;
}

export function aggregatePickList(
  orders: Array<{ items: Array<{ name: string; strength: string; quantity: number }> }>
): Array<{ label: string; quantity: number }> {
  const map = new Map<string, number>();
  for (const o of orders) {
    for (const it of o.items) {
      const label = `${it.name}${it.strength ? ` ${it.strength}` : ""}`.trim();
      map.set(label, (map.get(label) ?? 0) + it.quantity);
    }
  }
  return [...map.entries()]
    .map(([label, quantity]) => ({ label, quantity }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
