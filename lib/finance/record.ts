import { getCatalogProductByHandle } from "@/lib/products/catalog";
import type { Order } from "@/lib/orders/types";
import { logSaleIfNew } from "@/lib/ledger/store";

import { sanitizeProviderPayload } from "./sanitize";
import {
  insertPaymentEventIdempotent,
  markPaymentEventProcessed,
  upsertFinanceTransaction,
} from "./store";
import type { PaymentProvider } from "./types";

function productsSummary(order: Order): { products: string; quantities: string } {
  const products = order.items
    .map((item) => {
      const catalog = getCatalogProductByHandle(item.handle);
      return catalog?.sku ?? item.handle;
    })
    .join(", ");
  const quantities = order.items.map((item) => String(item.quantity)).join(", ");
  return { products, quantities };
}

function providerFromOrder(order: Order): PaymentProvider {
  if (order.paymentMethod === "bitcoin") return "btcpay";
  if (order.paymentMethod === "card") return "tagada";
  return "tagada";
}

export type RecordProviderEventInput = {
  provider: PaymentProvider;
  providerEventId: string;
  eventType: string;
  rawEvent: unknown;
  providerPaymentId?: string | null;
  providerOrderId?: string | null;
  pslOrderId?: string | null;
  eventTimestamp?: string | Date | null;
  amount?: number | null;
  currency?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  processingStatus?: "received" | "processed" | "ignored" | "failed";
  processingError?: string | null;
};

/** Persist a provider webhook/API event idempotently (Neon is source of truth). */
export async function recordProviderEvent(
  input: RecordProviderEventInput
): Promise<{ eventId: number; created: boolean }> {
  const { event, created } = await insertPaymentEventIdempotent({
    provider: input.provider,
    providerEventId: input.providerEventId,
    providerPaymentId: input.providerPaymentId,
    providerOrderId: input.providerOrderId,
    pslOrderId: input.pslOrderId,
    eventType: input.eventType,
    eventTimestamp: input.eventTimestamp,
    amount: input.amount,
    currency: input.currency,
    paymentStatus: input.paymentStatus,
    paymentMethod: input.paymentMethod,
    rawEventJson: sanitizeProviderPayload(input.rawEvent),
    processingStatus: input.processingStatus ?? "received",
    processingError: input.processingError,
  });
  return { eventId: event.id, created };
}

/**
 * Upsert a normalized finance transaction for a paid/shipped order.
 * Also mirrors into the existing financial_ledger SALE row (idempotent).
 * Never throws into checkout — callers should still try/catch.
 */
export async function ensureFinanceTransactionForPaidOrder(
  order: Order,
  options?: {
    provider?: PaymentProvider;
    providerPaymentId?: string | null;
    sourcePaymentEventId?: number | null;
    processorFee?: number | null;
  }
): Promise<void> {
  if (order.status !== "paid" && order.status !== "shipped") {
    return;
  }

  const provider = options?.provider ?? providerFromOrder(order);
  const { products, quantities } = productsSummary(order);
  const attribution = order.attribution;
  const paymentId =
    options?.providerPaymentId ?? order.invoiceId ?? null;

  await upsertFinanceTransaction({
    pslOrderId: order.orderId,
    provider,
    providerPaymentId: paymentId,
    paymentMethod: order.paymentMethod,
    eventTimestamp: order.paidAt ?? order.createdAt,
    grossAmount: order.total,
    currency: order.currency || "USD",
    // Unknown fees stay null — never invent 0.
    // Legacy financial_ledger.transaction_fees DEFAULT 0 is not a verified fee.
    processorFee:
      options?.processorFee === undefined ? null : options.processorFee,
    products,
    quantities,
    utmSource: attribution?.utmSource ?? null,
    utmMedium: attribution?.utmMedium ?? null,
    utmCampaign: attribution?.utmCampaign ?? null,
    utmContent: attribution?.utmContent ?? null,
    landingPage: attribution?.landingPage ?? null,
    sourcePaymentEventId: options?.sourcePaymentEventId ?? null,
  });

  const payment =
    order.paymentMethod === "bitcoin"
      ? "bitcoin"
      : order.paymentMethod === "card"
        ? "card"
        : provider === "btcpay"
          ? "bitcoin"
          : "card";

  await logSaleIfNew(order, payment);

  if (options?.sourcePaymentEventId) {
    await markPaymentEventProcessed(options.sourcePaymentEventId, "processed");
  }
}

/**
 * Best-effort finance side effects after a successful fulfill.
 * Must never throw into payment fulfillment callers.
 */
export async function safeRecordPaidOrderFinance(
  order: Order,
  options?: {
    provider?: PaymentProvider;
    providerPaymentId?: string | null;
    sourcePaymentEventId?: number | null;
    syntheticEvent?: RecordProviderEventInput | null;
  }
): Promise<void> {
  try {
    let eventId = options?.sourcePaymentEventId ?? null;
    if (options?.syntheticEvent) {
      const recorded = await recordProviderEvent(options.syntheticEvent);
      eventId = recorded.eventId;
    }
    await ensureFinanceTransactionForPaidOrder(order, {
      provider: options?.provider,
      providerPaymentId: options?.providerPaymentId,
      sourcePaymentEventId: eventId,
    });
  } catch (error) {
    console.error(
      "[finance] failed to record paid-order finance (order unaffected):",
      error instanceof Error ? error.message : error
    );
  }
}
