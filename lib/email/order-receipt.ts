/**
 * @deprecated Use sendCustomerOrderConfirmation from order-confirmation.ts.
 * Kept so older imports resolve during transition.
 */
export {
  sendCustomerOrderConfirmation as sendOrderReceiptEmail,
} from "./order-confirmation";
