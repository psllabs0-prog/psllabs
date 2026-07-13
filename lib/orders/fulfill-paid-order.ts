import { sendCustomerOrderConfirmation } from "@/lib/email/order-confirmation";
import { sendOrderEmail } from "@/lib/email/order-notification";
import { settlePaidOrder } from "@/lib/inventory/store";
import {
  claimCustomerOrderEmail,
  claimOrderEmail,
  getOrder,
  markCustomerEmailSent,
  markEmailSent,
  releaseCustomerOrderEmail,
  releaseOrderEmail,
} from "@/lib/orders/store";

/**
 * Mark the order paid, decrement stock, and send merchant + customer emails.
 * Same path as BTCPay InvoiceSettled — usable from sync card charges too.
 */
export async function fulfillPaidOrder(
  orderId: string,
  invoiceId: string,
  logPrefix = "[fulfill-paid-order]"
): Promise<{ ok: boolean; stockDecrementFailed: boolean }> {
  const settled = await settlePaidOrder(orderId, invoiceId);
  if (!settled.ok) {
    console.error(`${logPrefix} settle failed for ${orderId}`);
    return { ok: false, stockDecrementFailed: false };
  }
  if (settled.stockDecrementFailed) {
    console.error(`${logPrefix} stock decrement failed for ${orderId}`);
  }

  const paidOrder = await getOrder(orderId);
  if (!paidOrder) {
    console.error(`${logPrefix} order missing after settle: ${orderId}`);
    return {
      ok: settled.ok,
      stockDecrementFailed: settled.stockDecrementFailed,
    };
  }

  // Support notification and customer confirmation are independent:
  // failure or claim-skip on one must not block the other.
  if (!paidOrder.emailSent && (await claimOrderEmail(paidOrder.orderId))) {
    try {
      await sendOrderEmail(paidOrder);
      await markEmailSent(paidOrder.orderId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "email send failed";
      console.error(`${logPrefix} support order email failed:`, message);
      await releaseOrderEmail(paidOrder.orderId, message);
    }
  } else if (paidOrder.emailSent) {
    console.info(`${logPrefix} support email already sent for ${paidOrder.orderId}`);
  } else {
    console.info(
      `${logPrefix} support email claim held for ${paidOrder.orderId}`
    );
  }

  if (
    !paidOrder.customerEmailSent &&
    (await claimCustomerOrderEmail(paidOrder.orderId))
  ) {
    try {
      await sendCustomerOrderConfirmation(paidOrder);
      await markCustomerEmailSent(paidOrder.orderId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "customer email send failed";
      console.error(
        `${logPrefix} customer confirmation email failed:`,
        message
      );
      await releaseCustomerOrderEmail(paidOrder.orderId, message);
    }
  } else if (paidOrder.customerEmailSent) {
    console.info(
      `${logPrefix} customer email already sent for ${paidOrder.orderId}`
    );
  } else {
    console.info(
      `${logPrefix} customer email claim held for ${paidOrder.orderId}`
    );
  }

  return {
    ok: true,
    stockDecrementFailed: settled.stockDecrementFailed,
  };
}
