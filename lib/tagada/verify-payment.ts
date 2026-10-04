import type { Order } from "@/lib/orders/types";

export type CardOrderForVerification = Pick<
  Order,
  "orderId" | "paymentMethod" | "invoiceId" | "total" | "currency"
>;

export type TagadaPaymentHints = {
  paymentId?: unknown;
  tagadaOrderId?: unknown;
  checkoutSessionId?: unknown;
};

export type TagadaCardVerification =
  | {
      ok: true;
      paymentId: string;
      providerOrderId: string;
      amountCents: number;
      currency: string;
    }
  | { ok: false; reason: string; retryable: boolean };

/** Read-only dependencies; injection keeps the regression suite fully offline. */
export type TagadaCardReads = {
  storeId: string;
  retrievePayment: (paymentId: string) => Promise<unknown>;
  retrieveOrder: (providerOrderId: string) => Promise<unknown>;
};

type RecordValue = Record<string, unknown>;
const PAYMENT_ID = /^pay(?:ment)?_[A-Za-z0-9_-]+$/;
const ORDER_ID = /^(?:ord|order)_[A-Za-z0-9_-]+$/;
const COMPLETED = new Set(["succeeded", "captured"]);
const COMPLETED_SUBSTATUS = new Set(["approved", "succeeded", "captured"]);

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function cents(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function failure(reason: string, retryable = false): TagadaCardVerification {
  return { ok: false, reason, retryable };
}

function expectedCents(order: CardOrderForVerification): number | null {
  if (!Number.isFinite(order.total) || order.total <= 0) return null;
  const amount = Math.round(order.total * 100);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function localOrderFailure(order: CardOrderForVerification): TagadaCardVerification | null {
  if (order.paymentMethod !== "card") return failure("local_payment_method_mismatch");
  if (!text(order.orderId) || !text(order.invoiceId)) return failure("missing_checkout_binding");
  if (PAYMENT_ID.test(order.invoiceId!) || ORDER_ID.test(order.invoiceId!)) {
    return failure("missing_checkout_binding");
  }
  if (order.currency !== "USD" || expectedCents(order) === null) {
    return failure("invalid_local_amount_or_currency");
  }
  return null;
}

function hintsFailure(hints: TagadaPaymentHints): TagadaCardVerification | null {
  if (hints.paymentId !== undefined &&
      (!text(hints.paymentId) || !PAYMENT_ID.test(hints.paymentId as string))) {
    return failure("invalid_payment_reference");
  }
  if (hints.tagadaOrderId !== undefined &&
      (!text(hints.tagadaOrderId) || !ORDER_ID.test(hints.tagadaOrderId as string))) {
    return failure("invalid_order_reference");
  }
  if (hints.checkoutSessionId !== undefined && !text(hints.checkoutSessionId)) {
    return failure("invalid_session_reference");
  }
  if (!hints.paymentId && !hints.tagadaOrderId) return failure("missing_provider_reference");
  return null;
}

function hasActiveAction(value: RecordValue, completedPayment = false): boolean {
  // The provider retains `redirect` after successful 3DS. Its headless SDK
  // also checks succeeded before this field. Final status plus a completed
  // charge and paid order below are the proof; this old redirect is not.
  if (completedPayment && value.requireAction === "redirect") return false;
  return value.requireAction !== undefined && value.requireAction !== null &&
    value.requireAction !== "none" && value.requireAction !== false;
}

/**
 * Validate only evidence obtained from authenticated provider reads. The local
 * invoice token is the binding; customer-editable metadata is never a proof.
 * The shape below was checked against actual Node SDK order/payment responses.
 */
export function validateTagadaCardEvidence(
  order: CardOrderForVerification,
  hints: TagadaPaymentHints,
  paymentValue: unknown,
  providerOrderValue: unknown,
  expectedStoreId: string,
): TagadaCardVerification {
  const localFailure = localOrderFailure(order) ?? hintsFailure(hints);
  if (localFailure) return localFailure;

  const payment = record(paymentValue);
  const providerOrder = record(providerOrderValue);
  if (!payment || !providerOrder) return failure("missing_provider_evidence");
  const paymentId = text(payment.id);
  const providerOrderId = text(providerOrder.id);
  if (!paymentId || !PAYMENT_ID.test(paymentId) || !providerOrderId || !ORDER_ID.test(providerOrderId)) {
    return failure("invalid_provider_identity");
  }
  if ((hints.paymentId !== undefined && hints.paymentId !== paymentId) ||
      (hints.tagadaOrderId !== undefined && hints.tagadaOrderId !== providerOrderId) ||
      payment.orderId !== providerOrderId) {
    return failure("provider_order_payment_mismatch");
  }

  const session = record(providerOrder.checkoutSession);
  if (!text(expectedStoreId) || payment.storeId !== expectedStoreId ||
      providerOrder.storeId !== expectedStoreId || session?.storeId !== expectedStoreId) {
    return failure("provider_store_mismatch");
  }
  if (!text(payment.accountId) || payment.accountId !== providerOrder.accountId) {
    return failure("provider_account_mismatch");
  }
  const sessionId = text(session?.id);
  if (!sessionId || session?.checkoutToken !== order.invoiceId ||
      providerOrder.checkoutSessionId !== sessionId ||
      (hints.checkoutSessionId !== undefined && hints.checkoutSessionId !== sessionId)) {
    return failure("checkout_binding_mismatch");
  }

  const paymentStatus = text(payment.status)?.toLowerCase();
  const subStatus = text(payment.subStatus)?.toLowerCase();
  if (!paymentStatus || !COMPLETED.has(paymentStatus) ||
      (payment.subStatus !== undefined && (!subStatus ||
        !COMPLETED_SUBSTATUS.has(subStatus))) ||
      (payment.mode !== undefined && payment.mode !== "purchase" && payment.mode !== "capture") ||
      providerOrder.status !== "paid" || hasActiveAction(payment, true) || hasActiveAction(providerOrder)) {
    return failure("payment_not_completed", paymentStatus === "pending" || paymentStatus === "authorized" ||
      (paymentStatus !== undefined && COMPLETED.has(paymentStatus) &&
        (providerOrder.status === "pending" || providerOrder.status === "open")));
  }
  if (payment.isTest === true || payment.draft === true ||
      providerOrder.isTest === true || providerOrder.draft !== false || session?.draft !== false) {
    return failure("test_or_draft_payment");
  }

  if ((payment.refundedAmount !== undefined && payment.refundedAmount !== null && payment.refundedAmount !== 0) ||
      (providerOrder.refundedAmount !== undefined && providerOrder.refundedAmount !== null && providerOrder.refundedAmount !== 0)) {
    return failure("payment_refunded_or_voided");
  }

  const amount = expectedCents(order)!;
  if (cents(payment.amount) !== amount || cents(providerOrder.paidAmount) !== amount) {
    return failure("payment_amount_mismatch");
  }
  if (payment.currency !== order.currency || providerOrder.currency !== order.currency) {
    return failure("payment_currency_mismatch");
  }

  const summaries = Array.isArray(providerOrder.summaries)
    ? providerOrder.summaries.map(record).filter((value): value is RecordValue => value !== null)
    : [];
  const matchingSummaries = summaries.filter((summary) =>
    summary.orderId === providerOrderId && summary.checkoutSessionId === sessionId &&
    summary.currency === order.currency,
  );
  if (matchingSummaries.length !== 1 || cents(matchingSummaries[0].totalAmount) !== amount) {
    return failure("order_summary_mismatch");
  }
  const payments = Array.isArray(providerOrder.payments) ? providerOrder.payments : [];
  if (!payments.some((entry) => record(entry)?.id === paymentId)) {
    return failure("payment_not_in_provider_order");
  }

  const transactions = Array.isArray(payment.transactions)
    ? payment.transactions.map(record).filter((value): value is RecordValue => value !== null)
    : [];
  if (transactions.some((transaction) =>
    ["refund", "refunded", "void", "reversal"].includes(String(transaction.type).toLowerCase()) &&
    COMPLETED.has(String(transaction.status).toLowerCase()),
  )) {
    return failure("payment_refunded_or_voided");
  }
  const completedCharge = transactions.some((transaction) =>
    (transaction.type === "purchase" || transaction.type === "capture") &&
    COMPLETED.has(String(transaction.status).toLowerCase()) &&
    transaction.isTest === false && transaction.draft === false &&
    (transaction.result === undefined || transaction.result === "approved") &&
    transaction.paymentId === paymentId && transaction.storeId === expectedStoreId &&
    transaction.accountId === payment.accountId &&
    !hasActiveAction(transaction) && cents(transaction.amount) === amount &&
    transaction.currency === order.currency,
  );
  if (!completedCharge) return failure("missing_completed_charge");

  return { ok: true, paymentId, providerOrderId, amountCents: amount, currency: order.currency };
}

async function defaultReads(): Promise<TagadaCardReads> {
  const [{ default: Tagada }, { getTagadaApiKey, getTagadaStoreId }] = await Promise.all([
    import("@tagadapay/node-sdk"),
    import("@/lib/tagada"),
  ]);
  // Two sequential GETs fit within the provider's webhook delivery window.
  // Retry the confirmation later rather than silently trusting a timeout.
  const client = new Tagada({ apiKey: getTagadaApiKey(), timeout: 4000, maxRetries: 0 });
  return {
    storeId: getTagadaStoreId(),
    retrievePayment: (paymentId) => client.payments.retrieve(paymentId),
    retrieveOrder: (providerOrderId) => client.orders.retrieve(providerOrderId),
  };
}

/** Resolve candidate IDs through secret-key SDK reads before any fulfillment. */
export async function verifyTagadaCardPayment(
  order: CardOrderForVerification,
  hints: TagadaPaymentHints,
  reads?: TagadaCardReads,
): Promise<TagadaCardVerification> {
  const invalid = localOrderFailure(order) ?? hintsFailure(hints);
  if (invalid) return invalid;

  try {
    const provider = reads ?? await defaultReads();
    let payment: unknown;
    let orderResponse: unknown;
    let paymentId = text(hints.paymentId);
    const providerOrderId = text(hints.tagadaOrderId);

    if (paymentId && providerOrderId) {
      [payment, orderResponse] = await Promise.all([
        provider.retrievePayment(paymentId),
        provider.retrieveOrder(providerOrderId),
      ]);
    } else if (paymentId) {
      payment = await provider.retrievePayment(paymentId);
      const linkedOrderId = text(record(payment)?.orderId);
      if (!linkedOrderId || !ORDER_ID.test(linkedOrderId)) return failure("missing_provider_order_reference");
      orderResponse = await provider.retrieveOrder(linkedOrderId);
    } else {
      orderResponse = await provider.retrieveOrder(providerOrderId!);
      const retrievedOrder = record(record(orderResponse)?.order);
      const candidates = Array.isArray(retrievedOrder?.payments)
        ? retrievedOrder.payments.map(record).filter((entry): entry is RecordValue =>
            !!entry && !!text(entry.id) && PAYMENT_ID.test(entry.id as string) &&
            COMPLETED.has(String(entry.status).toLowerCase()) &&
            entry.amount === expectedCents(order) && entry.currency === order.currency,
          )
        : [];
      if (candidates.length !== 1) return failure("missing_or_ambiguous_payment_reference");
      paymentId = text(candidates[0].id)!;
      payment = await provider.retrievePayment(paymentId);
    }

    const retrievedOrder = record(record(orderResponse)?.order);
    if (!retrievedOrder) return failure("missing_provider_order_evidence");
    // The retrieved object must match the ID requested, even for an order-only hint.
    const linkedOrderId = providerOrderId ?? text(record(payment)?.orderId);
    if (retrievedOrder.id !== linkedOrderId || record(payment)?.id !== paymentId) {
      return failure("provider_identity_mismatch");
    }
    return validateTagadaCardEvidence(
      order, { ...hints, paymentId }, payment, retrievedOrder, provider.storeId,
    );
  } catch {
    // Do not expose SDK error bodies: they may contain customer data or tokens.
    return failure("provider_lookup_unavailable", true);
  }
}
