import { getTagadaApiKey } from "@/lib/tagada";

const TAGADA_API_BASE = "https://api.tagada.io";

async function tagadaGet(path: string): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
}> {
  const apiKey = getTagadaApiKey();
  const response = await fetch(`${TAGADA_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  const rawText = await response.text();
  let data: unknown = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = { raw: rawText.slice(0, 200) };
  }
  return { ok: response.ok, status: response.status, data };
}

export type TagadaPaymentLookup = {
  id: string;
  status: string | null;
  amountCents: number | null;
  currency: string | null;
};

export type TagadaOrderLookup = {
  id: string;
  status: string | null;
  totalCents: number | null;
  currency: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

/** GET /api/public/v1/payments/{paymentId} */
export async function lookupTagadaPayment(
  paymentId: string
): Promise<TagadaPaymentLookup | null> {
  const res = await tagadaGet(
    `/api/public/v1/payments/${encodeURIComponent(paymentId)}`
  );
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Tagada payment lookup failed (${res.status})`);
  }
  const root = asRecord(res.data) ?? {};
  const payment = asRecord(root.payment) ?? root;
  const id = pickString(payment.id, paymentId);
  if (!id) return null;
  return {
    id,
    status: pickString(payment.status),
    amountCents: pickNumber(payment.amount, payment.totalAmount),
    currency: pickString(payment.currency),
  };
}

/** GET /api/public/v1/orders/{orderId} */
export async function lookupTagadaOrder(
  orderId: string
): Promise<TagadaOrderLookup | null> {
  const res = await tagadaGet(
    `/api/public/v1/orders/${encodeURIComponent(orderId)}`
  );
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Tagada order lookup failed (${res.status})`);
  }
  const root = asRecord(res.data) ?? {};
  const order = asRecord(root.order) ?? root;
  const id = pickString(order.id, orderId);
  if (!id) return null;
  return {
    id,
    status: pickString(order.status),
    totalCents: pickNumber(order.totalAmount, order.total, order.amount),
    currency: pickString(order.currency),
  };
}

export function isSuccessfulTagadaStatus(status: string | null): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return (
    normalized === "succeeded" ||
    normalized === "paid" ||
    normalized === "success" ||
    normalized === "captured" ||
    normalized === "completed"
  );
}
