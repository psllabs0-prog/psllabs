import type { Order } from "@/lib/orders/types";

export type BtcpayTerminalStatus = "Settled" | "Expired" | "Invalid";
export type BtcpayOrderSnapshot = Pick<Order, "orderId" | "invoiceId" | "paymentMethod" | "status" | "total" | "currency">;
export type BtcpayInvoiceVerification =
  | { ok: true; invoiceId: string; total: number; currency: string }
  | { ok: false; status: 409 | 503; reason: string };

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Decimal strings are parsed without rounding an underpayment up to a cent. */
function minorUnits(value: unknown, exact = false): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,18})(?:\.(\d{1,18}))?$/.exec(value);
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (exact && /[1-9]/.test(fraction.slice(2))) return null;
  const cents = BigInt(match[1]) * BigInt(100) + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

/**
 * Read the exact store-scoped invoice using the server API key. No provider or
 * local writes occur here. A signed callback is notification, not payment proof.
 * @see https://docs.btcpayserver.org/API/Greenfield/v1/
 */
export async function verifyBtcpayInvoice(
  order: BtcpayOrderSnapshot,
  invoiceId: string,
  expectedStatus: BtcpayTerminalStatus
): Promise<BtcpayInvoiceVerification> {
  const reject = (reason: string): BtcpayInvoiceVerification => ({ ok: false, status: 409, reason });
  const serverUrl = process.env.BTCPAY_URL?.trim();
  const apiKey = process.env.BTCPAY_API_KEY?.trim();
  const storeId = process.env.BTCPAY_STORE_ID?.trim();
  if (!serverUrl || !apiKey || !storeId) {
    return { ok: false, status: 503, reason: "provider_lookup_not_configured" };
  }
  const totalCents = Math.round(order.total * 100);
  if (!invoiceId || order.invoiceId !== invoiceId || order.paymentMethod !== "bitcoin" ||
      !["pending", "paid", "shipped"].includes(order.status) ||
      !Number.isFinite(order.total) || !Number.isSafeInteger(totalCents) || totalCents <= 0 ||
      Math.abs(order.total * 100 - totalCents) > 0.000001 || !/^[A-Z]{3}$/.test(order.currency)) {
    return reject("invalid_local_invoice_binding");
  }

  let raw: unknown;
  try {
    const url = new URL(`${serverUrl.replace(/\/+$/, "")}/api/v1/stores/${encodeURIComponent(storeId)}/invoices/${encodeURIComponent(invoiceId)}`);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      return { ok: false, status: 503, reason: "invalid_provider_configuration" };
    }
    const response = await fetch(url, {
      method: "GET", headers: { Accept: "application/json", Authorization: `token ${apiKey}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { ok: false, status: 503, reason: "provider_lookup_unavailable" };
    raw = await response.json();
  } catch {
    // Never echo provider response bodies, API keys, invoice metadata or URLs.
    return { ok: false, status: 503, reason: "provider_lookup_unavailable" };
  }

  const invoice = object(raw);
  if (!invoice || invoice.id !== invoiceId || invoice.storeId !== storeId ||
      invoice.currency !== order.currency || minorUnits(invoice.amount, true) !== totalCents ||
      object(invoice.metadata)?.orderId !== order.orderId) {
    return reject("provider_invoice_binding_mismatch");
  }
  if (invoice.status !== expectedStatus) return reject("provider_invoice_status_mismatch");
  if (expectedStatus === "Settled") {
    const paidCents = minorUnits(invoice.paidAmount);
    if (paidCents === null || paidCents < totalCents ||
        !["None", "PaidOver", "PaidLate"].includes(String(invoice.additionalStatus))) {
      return reject("provider_payment_not_confirmed");
    }
  }
  return { ok: true, invoiceId, total: order.total, currency: order.currency };
}
