import { getOrder } from "@/lib/orders/store";
import { sendOrderShippedEmail } from "@/lib/email/order-shipped";
import { sendTrackingReadyEmail } from "@/lib/email/tracking-ready";
import { claimTrackingNotification, finishTrackingNotification, getTrackingNotification, privateDigest, reviewTrackingNotification, shippingPaymentBlocked } from "./shipping-flow-store";
import { getManualFulfillmentTestScope } from "@/lib/db/sql";

/** Outbox is persisted by the caller first. A failed/uncertain SMTP call is held, not retried. */
export async function dispatchTrackingNotification(orderId: string, allowSend: boolean) {
  const status = await getTrackingNotification(orderId);
  if (!allowSend || !status || status.status !== "pending") return status;
  const order = await getOrder(orderId);
  if (!order || !order.trackingNumber || !["paid", "shipped"].includes(order.status) || await shippingPaymentBlocked(orderId)) return status;
  const claimed = await claimTrackingNotification(orderId, order.trackingNumber, privateDigest(order.email.trim().toLowerCase()), order.email);
  if (!claimed) return getTrackingNotification(orderId);
  try {
    const current = await getOrder(orderId);
    if (!current || current.email !== order.email || current.trackingNumber !== order.trackingNumber ||
      !["paid", "shipped"].includes(current.status) || await shippingPaymentBlocked(orderId)) {
      await reviewTrackingNotification(orderId);
      return getTrackingNotification(orderId);
    }
    const messageId = `<psl-tracking-${privateDigest([orderId, order.trackingNumber])}@psllabs.org>`;
    const manualTest = getManualFulfillmentTestScope();
    if (manualTest) {
      if (!manualTest.allowTestEmail || !manualTest.sendTrackingEmail) throw new Error("Manual test mail requires its explicit action.");
      await manualTest.sendTrackingEmail(current, messageId);
    } else if (current.status === "shipped") await sendOrderShippedEmail(current, messageId);
    else await sendTrackingReadyEmail(current, messageId);
    await finishTrackingNotification(orderId);
  } catch {
    // SMTP may have accepted before a timeout, and persistence may fail after send.
    // Keep the unique claim; a later status read will also flag a stale send.
    await reviewTrackingNotification(orderId).catch(() => undefined);
  }
  return getTrackingNotification(orderId);
}
