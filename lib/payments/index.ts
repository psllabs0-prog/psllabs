export type CheckoutSession = {
  id: string;
  url: string;
  processor: string;
};

export type InvoiceStatus =
  | "new"
  | "processing"
  | "settled"
  | "expired"
  | "invalid";

export type InvoiceStatusResult = {
  id: string;
  status: InvoiceStatus;
  processor: string;
  metadata?: Record<string, unknown>;
};

export type WebhookEvent = {
  type: string;
  invoiceId: string;
  status: InvoiceStatus;
  raw: unknown;
};

export interface PaymentProcessor {
  readonly name: string;

  createCheckoutSession(
    productId: string,
    quantity: number
  ): Promise<CheckoutSession>;

  verifyWebhook(
    payload: string,
    signature: string
  ): Promise<WebhookEvent>;

  getInvoiceStatus(invoiceId: string): Promise<InvoiceStatusResult>;
}

export { getPaymentProcessor } from "./factory";
