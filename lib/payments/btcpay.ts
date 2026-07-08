import crypto from "crypto";

import { SITE_URL } from "@/lib/seo";
import type {
  CheckoutSession,
  CreateInvoiceInput,
  InvoiceStatus,
  InvoiceStatusResult,
  PaymentProcessor,
  WebhookEvent,
} from "./index";
import { getCheckoutProduct } from "./products";

function getServerUrl(): string {
  const url = process.env.BTCPAY_URL;
  if (!url) throw new Error("BTCPAY_URL is not set");
  return url.replace(/\/+$/, "");
}

function getApiKey(): string {
  const key = process.env.BTCPAY_API_KEY;
  if (!key) throw new Error("BTCPAY_API_KEY is not set");
  return key;
}

function getStoreId(): string {
  const id = process.env.BTCPAY_STORE_ID;
  if (!id) throw new Error("BTCPAY_STORE_ID is not set");
  return id;
}

function getWebhookSecret(): string {
  const secret = process.env.BTCPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("BTCPAY_WEBHOOK_SECRET is not set");
  return secret;
}

function mapBTCPayStatus(status: string): InvoiceStatus {
  switch (status) {
    case "New":
      return "new";
    case "Processing":
      return "processing";
    case "Settled":
      return "settled";
    case "Expired":
      return "expired";
    case "Invalid":
      return "invalid";
    default:
      return "new";
  }
}

function mapWebhookType(type: string): InvoiceStatus {
  switch (type) {
    case "InvoiceCreated":
      return "new";
    case "InvoiceReceivedPayment":
    case "InvoiceProcessing":
    case "InvoicePaymentSettled":
      return "processing";
    case "InvoiceSettled":
      return "settled";
    case "InvoiceExpired":
      return "expired";
    case "InvoiceInvalid":
      return "invalid";
    default:
      return "new";
  }
}

type BTCPayInvoiceResponse = {
  id: string;
  checkoutLink: string;
  status: string;
  metadata?: Record<string, unknown>;
};

async function btcpayFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${getServerUrl()}/api/v1${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `token ${getApiKey()}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`BTCPay API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export class BTCPayProcessor implements PaymentProcessor {
  readonly name = "btcpay";

  async createCheckoutSession(
    productId: string,
    quantity: number
  ): Promise<CheckoutSession> {
    const product = getCheckoutProduct(productId);
    if (!product) {
      throw new Error(`Unknown product: ${productId}`);
    }

    const totalUsd = Number((product.priceUsd * quantity).toFixed(2));

    const siteUrl =
      SITE_URL;

    const storeId = getStoreId();

    const invoice = await btcpayFetch<BTCPayInvoiceResponse>(
      `/stores/${storeId}/invoices`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: totalUsd,
          currency: "USD",
          metadata: {
            productId,
            productName: product.name,
            quantity,
          },
          checkout: {
            redirectURL: `${siteUrl}/success`,
            redirectAutomatically: true,
            defaultLanguage: "en",
          },
          receipt: {
            enabled: true,
          },
        }),
      }
    );

    return {
      id: invoice.id,
      url: invoice.checkoutLink,
      processor: this.name,
    };
  }

  async createInvoice(input: CreateInvoiceInput): Promise<CheckoutSession> {
    const storeId = getStoreId();

    const invoice = await btcpayFetch<BTCPayInvoiceResponse>(
      `/stores/${storeId}/invoices`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: input.amount.toFixed(2),
          currency: input.currency,
          checkout: {
            redirectURL: `${SITE_URL}${input.redirectPath}`,
            redirectAutomatically: true,
            defaultLanguage: "en",
          },
          metadata: {
            orderId: input.orderId,
            items: input.items,
          },
          receipt: {
            enabled: true,
          },
        }),
      }
    );

    return {
      id: invoice.id,
      url: invoice.checkoutLink,
      processor: this.name,
    };
  }

  async verifyWebhook(
    payload: string,
    signature: string
  ): Promise<WebhookEvent> {
    const secret = getWebhookSecret();

    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const sigBuffer = Buffer.from(signature.replace(/^sha256=/, ""));
    const expectedBuffer = Buffer.from(expectedSig);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new Error("Invalid webhook signature");
    }

    const body = JSON.parse(payload) as {
      type: string;
      invoiceId: string;
      metadata?: Record<string, unknown>;
    };

    return {
      type: body.type,
      invoiceId: body.invoiceId,
      status: mapWebhookType(body.type),
      raw: body,
    };
  }

  async getInvoiceStatus(
    invoiceId: string
  ): Promise<InvoiceStatusResult> {
    const storeId = getStoreId();

    const invoice = await btcpayFetch<BTCPayInvoiceResponse>(
      `/stores/${storeId}/invoices/${invoiceId}`
    );

    return {
      id: invoice.id,
      status: mapBTCPayStatus(invoice.status),
      processor: this.name,
      metadata: invoice.metadata,
    };
  }
}
