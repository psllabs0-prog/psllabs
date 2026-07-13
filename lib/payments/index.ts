export type CheckoutSession = {
  id: string;
  url: string;
  processor: string;
};

export type InvoiceItem = {
  productId: string;
  name: string;
  quantity: number;
};

export type CreateInvoiceInput = {
  amount: number;
  currency: string;
  orderId: string;
  redirectPath: string;
  items: InvoiceItem[];
  buyerEmail?: string;
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

export type ChargeCardInput = {
  amount: number;
  currency: string;
  orderId: string;
  opaqueDataDescriptor: string;
  opaqueDataValue: string;
  buyerEmail?: string;
  billTo?: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
};

export type ChargeCardResult = {
  transactionId: string;
  authCode?: string;
  processor: string;
};

export interface PaymentProcessor {
  readonly name: string;

  createCheckoutSession(
    productId: string,
    quantity: number
  ): Promise<CheckoutSession>;

  createInvoice(input: CreateInvoiceInput): Promise<CheckoutSession>;

  verifyWebhook(
    payload: string,
    signature: string
  ): Promise<WebhookEvent>;

  getInvoiceStatus(invoiceId: string): Promise<InvoiceStatusResult>;

  /** Tokenized card charge (Accept.js / Accept UI opaqueData). */
  chargeCard?(input: ChargeCardInput): Promise<ChargeCardResult>;
}

export { getPaymentProcessor } from "./factory";
