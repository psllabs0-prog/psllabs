import { listRecentCompletedOrders } from "@/lib/orders/store";
import { BTCPayProcessor } from "@/lib/payments/btcpay";
import { isTagadaConfigured } from "@/lib/tagada";

import { ensureFinanceTransactionForPaidOrder } from "./record";
import { syncPendingFinanceTransactionsToSheet } from "./sheets-sync";
import {
  finishFinanceJobRun,
  findDuplicateProviderPaymentIds,
  resolveReconciliationWarning,
  startFinanceJobRun,
  upsertReconciliationWarning,
} from "./store";
import {
  isSuccessfulTagadaStatus,
  lookupTagadaOrder,
  lookupTagadaPayment,
} from "./tagada-lookup";

function centsToUsd(cents: number): number {
  return Math.round(cents) / 100;
}

function amountsMatch(expectedUsd: number, providerUsd: number): boolean {
  return Math.abs(expectedUsd - providerUsd) <= 0.02;
}

export type ReconciliationSummary = {
  ordersChecked: number;
  financeBackfilled: number;
  warningsCreated: number;
  warningsResolved: number;
  sheetSync: { synced: number; failed: number; skipped: number };
};

async function resolveIfOpen(warningKey: string): Promise<boolean> {
  return resolveReconciliationWarning(warningKey);
}

/**
 * Daily backup integrity check. Tagada card payments are primarily recorded
 * at successful checkout; this job re-checks via authenticated Tagada API
 * using stored pay_/ord_ identifiers. A Tagada webhook is not required.
 */
export async function runFinanceReconciliation(): Promise<ReconciliationSummary> {
  const runId = await startFinanceJobRun("finance_reconciliation");
  const summary: ReconciliationSummary = {
    ordersChecked: 0,
    financeBackfilled: 0,
    warningsCreated: 0,
    warningsResolved: 0,
    sheetSync: { synced: 0, failed: 0, skipped: 0 },
  };

  try {
    const orders = await listRecentCompletedOrders(14, 150);
    summary.ordersChecked = orders.length;

    let btcpay: BTCPayProcessor | null = null;
    try {
      if (process.env.BTCPAY_URL && process.env.BTCPAY_API_KEY) {
        btcpay = new BTCPayProcessor();
      }
    } catch {
      btcpay = null;
    }

    for (const order of orders) {
      try {
        await ensureFinanceTransactionForPaidOrder(order);
        summary.financeBackfilled += 1;
      } catch (error) {
        console.error(
          `[finance/reconcile] backfill failed for ${order.orderId}:`,
          error instanceof Error ? error.message : error
        );
      }

      const invoiceId = order.invoiceId?.trim() ?? "";
      if (!invoiceId) continue;

      const isBitcoin =
        order.paymentMethod === "bitcoin" ||
        (!order.paymentMethod &&
          !invoiceId.startsWith("pay_") &&
          !invoiceId.startsWith("ord_"));

      if (isBitcoin && btcpay) {
        const notSettledKey = `psl_paid_provider_not_settled:btcpay:${order.orderId}`;
        const lookupFailedKey = `provider_lookup_failed:btcpay:${order.orderId}`;
        try {
          const invoice = await btcpay.getInvoiceStatus(invoiceId);
          // Lookup succeeded — clear prior lookup-failure for this exact order.
          if (await resolveIfOpen(lookupFailedKey)) {
            summary.warningsResolved += 1;
          }
          if (invoice.status === "settled") {
            if (await resolveIfOpen(notSettledKey)) {
              summary.warningsResolved += 1;
            }
          } else {
            await upsertReconciliationWarning({
              warningKey: notSettledKey,
              warningType: "psl_paid_provider_not_settled",
              pslOrderId: order.orderId,
              provider: "btcpay",
              providerPaymentId: invoiceId,
              message: `PSL order is ${order.status} but BTCPay invoice status is ${invoice.status}`,
              details: { invoiceStatus: invoice.status },
            });
            summary.warningsCreated += 1;
          }
        } catch (error) {
          await upsertReconciliationWarning({
            warningKey: lookupFailedKey,
            warningType: "provider_lookup_failed",
            pslOrderId: order.orderId,
            provider: "btcpay",
            providerPaymentId: invoiceId,
            message: `BTCPay invoice lookup failed: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          });
          summary.warningsCreated += 1;
        }
        continue;
      }

      if (!isTagadaConfigured()) continue;

      const notSettledKey = `psl_paid_provider_not_settled:tagada:${order.orderId}`;
      const lookupFailedKey = `provider_lookup_failed:tagada:${order.orderId}`;
      const amountKey = `amount_mismatch:tagada:${order.orderId}`;
      const currencyKey = `currency_mismatch:tagada:${order.orderId}`;

      try {
        if (invoiceId.startsWith("pay_")) {
          const payment = await lookupTagadaPayment(invoiceId);
          if (!payment) {
            await upsertReconciliationWarning({
              warningKey: notSettledKey,
              warningType: "psl_paid_provider_not_settled",
              pslOrderId: order.orderId,
              provider: "tagada",
              providerPaymentId: invoiceId,
              message: `PSL order is ${order.status} but Tagada payment was not found`,
            });
            summary.warningsCreated += 1;
            continue;
          }

          if (await resolveIfOpen(lookupFailedKey)) {
            summary.warningsResolved += 1;
          }

          if (isSuccessfulTagadaStatus(payment.status)) {
            if (await resolveIfOpen(notSettledKey)) {
              summary.warningsResolved += 1;
            }
          } else {
            await upsertReconciliationWarning({
              warningKey: notSettledKey,
              warningType: "psl_paid_provider_not_settled",
              pslOrderId: order.orderId,
              provider: "tagada",
              providerPaymentId: invoiceId,
              message: `PSL order is ${order.status} but Tagada payment status is ${payment.status}`,
              details: { paymentStatus: payment.status },
            });
            summary.warningsCreated += 1;
          }

          if (payment.amountCents === null) {
            // Amount not available from provider — do not invent a pass/fail resolve.
          } else if (amountsMatch(order.total, centsToUsd(payment.amountCents))) {
            if (await resolveIfOpen(amountKey)) {
              summary.warningsResolved += 1;
            }
          } else {
            await upsertReconciliationWarning({
              warningKey: amountKey,
              warningType: "amount_mismatch",
              pslOrderId: order.orderId,
              provider: "tagada",
              providerPaymentId: invoiceId,
              message: `Order total ${order.total} does not match Tagada payment ${centsToUsd(payment.amountCents)}`,
              details: {
                orderTotal: order.total,
                providerAmount: centsToUsd(payment.amountCents),
              },
            });
            summary.warningsCreated += 1;
          }

          if (!payment.currency) {
            // Currency unavailable — leave any prior currency warning untouched.
          } else if (
            payment.currency.toUpperCase() === order.currency.toUpperCase()
          ) {
            if (await resolveIfOpen(currencyKey)) {
              summary.warningsResolved += 1;
            }
          } else {
            await upsertReconciliationWarning({
              warningKey: currencyKey,
              warningType: "currency_mismatch",
              pslOrderId: order.orderId,
              provider: "tagada",
              providerPaymentId: invoiceId,
              message: `Currency mismatch: order ${order.currency} vs Tagada ${payment.currency}`,
            });
            summary.warningsCreated += 1;
          }
        } else if (
          invoiceId.startsWith("ord_") ||
          invoiceId.startsWith("order_")
        ) {
          const tagadaOrder = await lookupTagadaOrder(invoiceId);
          if (!tagadaOrder) {
            await upsertReconciliationWarning({
              warningKey: notSettledKey,
              warningType: "psl_paid_provider_not_settled",
              pslOrderId: order.orderId,
              provider: "tagada",
              providerPaymentId: invoiceId,
              message: `PSL order is ${order.status} but Tagada order was not found`,
            });
            summary.warningsCreated += 1;
            continue;
          }

          if (await resolveIfOpen(lookupFailedKey)) {
            summary.warningsResolved += 1;
          }

          if (isSuccessfulTagadaStatus(tagadaOrder.status)) {
            if (await resolveIfOpen(notSettledKey)) {
              summary.warningsResolved += 1;
            }
          } else {
            await upsertReconciliationWarning({
              warningKey: notSettledKey,
              warningType: "psl_paid_provider_not_settled",
              pslOrderId: order.orderId,
              provider: "tagada",
              providerPaymentId: invoiceId,
              message: `PSL order is ${order.status} but Tagada order status is ${tagadaOrder.status}`,
              details: { tagadaStatus: tagadaOrder.status },
            });
            summary.warningsCreated += 1;
          }

          if (tagadaOrder.totalCents === null) {
            // Amount unavailable — do not resolve amount warnings blindly.
          } else if (
            amountsMatch(order.total, centsToUsd(tagadaOrder.totalCents))
          ) {
            if (await resolveIfOpen(amountKey)) {
              summary.warningsResolved += 1;
            }
          } else {
            await upsertReconciliationWarning({
              warningKey: amountKey,
              warningType: "amount_mismatch",
              pslOrderId: order.orderId,
              provider: "tagada",
              providerPaymentId: invoiceId,
              message: `Order total ${order.total} does not match Tagada order ${centsToUsd(tagadaOrder.totalCents)}`,
            });
            summary.warningsCreated += 1;
          }
        }
        // checkoutSessionId-style refs: no reliable public lookup → skip provider check
      } catch (error) {
        await upsertReconciliationWarning({
          warningKey: lookupFailedKey,
          warningType: "provider_lookup_failed",
          pslOrderId: order.orderId,
          provider: "tagada",
          providerPaymentId: invoiceId,
          message: `Tagada lookup failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        });
        summary.warningsCreated += 1;
      }
    }

    const duplicates = await findDuplicateProviderPaymentIds();
    for (const dup of duplicates) {
      await upsertReconciliationWarning({
        warningKey: `duplicate_provider_payment_id:${dup.providerPaymentId}`,
        warningType: "duplicate_provider_payment_id",
        providerPaymentId: dup.providerPaymentId,
        message: `Provider payment id appears on multiple PSL orders: ${dup.orderIds.join(", ")}`,
        details: { orderIds: dup.orderIds },
      });
      summary.warningsCreated += 1;
    }

    summary.sheetSync = await syncPendingFinanceTransactionsToSheet(40);

    await finishFinanceJobRun(runId, "ok", summary);
    return summary;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reconciliation failed";
    await finishFinanceJobRun(runId, "error", summary, message);
    throw error;
  }
}
