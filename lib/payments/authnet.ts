import type {
  ChargeCardInput,
  ChargeCardResult,
  CheckoutSession,
  CreateInvoiceInput,
  InvoiceStatusResult,
  PaymentProcessor,
  WebhookEvent,
} from "./index";

export type AuthNetEnvironment = "sandbox" | "production";

function getApiLoginId(): string {
  const id = process.env.AUTHNET_API_LOGIN_ID;
  if (!id) throw new Error("AUTHNET_API_LOGIN_ID is not set");
  return id;
}

function getTransactionKey(): string {
  const key = process.env.AUTHNET_TRANSACTION_KEY;
  if (!key) throw new Error("AUTHNET_TRANSACTION_KEY is not set");
  return key;
}

function getClientKey(): string {
  const key = process.env.AUTHNET_CLIENT_KEY;
  if (!key) throw new Error("AUTHNET_CLIENT_KEY is not set");
  return key;
}

export function getAuthNetEnvironment(): AuthNetEnvironment {
  const raw = (process.env.AUTHNET_ENVIRONMENT ?? "").trim().toLowerCase();
  if (raw === "sandbox" || raw === "production") return raw;
  throw new Error(
    'AUTHNET_ENVIRONMENT must be "sandbox" or "production"'
  );
}

/** Card checkout is intentionally sandbox-only until production go-live. */
export function isCardCheckoutEnabled(): boolean {
  try {
    if (getAuthNetEnvironment() !== "sandbox") return false;
    getApiLoginId();
    getTransactionKey();
    getClientKey();
    return true;
  } catch {
    return false;
  }
}

export function getAuthNetPublicConfig(): {
  enabled: boolean;
  apiLoginId: string | null;
  clientKey: string | null;
  environment: AuthNetEnvironment | null;
  acceptUiScriptUrl: string | null;
} {
  if (!isCardCheckoutEnabled()) {
    return {
      enabled: false,
      apiLoginId: null,
      clientKey: null,
      environment: null,
      acceptUiScriptUrl: null,
    };
  }

  return {
    enabled: true,
    apiLoginId: getApiLoginId(),
    clientKey: getClientKey(),
    environment: "sandbox",
    acceptUiScriptUrl: "https://jstest.authorize.net/v1/AcceptUI.js",
  };
}

function getApiEndpoint(environment: AuthNetEnvironment): string {
  return environment === "production"
    ? "https://api.authorize.net/xml/v1/request.api"
    : "https://apitest.authorize.net/xml/v1/request.api";
}

type AuthNetMessage = { code?: string; text?: string; description?: string };

type AuthNetTransactionResponse = {
  responseCode?: string;
  transId?: string;
  authCode?: string;
  messages?: AuthNetMessage[];
  errors?: AuthNetMessage[];
};

type AuthNetCreateTransactionResponse = {
  messages?: {
    resultCode?: string;
    message?: AuthNetMessage[];
  };
  transactionResponse?: AuthNetTransactionResponse;
};

function firstMessageText(
  messages: AuthNetMessage[] | undefined
): string | null {
  const msg = messages?.[0];
  if (!msg) return null;
  return msg.text ?? msg.description ?? msg.code ?? null;
}

export class CardProcessor implements PaymentProcessor {
  readonly name = "card";

  async createCheckoutSession(
    _productId: string,
    _quantity: number
  ): Promise<CheckoutSession> {
    throw new Error("Card processor does not create redirect checkout sessions");
  }

  async createInvoice(_input: CreateInvoiceInput): Promise<CheckoutSession> {
    throw new Error("Card processor does not create invoices");
  }

  async verifyWebhook(
    _payload: string,
    _signature: string
  ): Promise<WebhookEvent> {
    throw new Error("Card processor does not verify BTCPay-style webhooks");
  }

  async getInvoiceStatus(_invoiceId: string): Promise<InvoiceStatusResult> {
    throw new Error("Card processor does not look up invoices");
  }

  async chargeCard(input: ChargeCardInput): Promise<ChargeCardResult> {
    // Hard gate: never charge live until we deliberately lift this.
    const environment = getAuthNetEnvironment();
    if (environment !== "sandbox") {
      throw new Error(
        "Card charges are disabled outside AUTHNET_ENVIRONMENT=sandbox"
      );
    }

    if (!input.opaqueDataDescriptor || !input.opaqueDataValue) {
      throw new Error("Missing payment nonce from Accept.js");
    }

    const amount = Number(input.amount.toFixed(2));
    if (!(amount > 0)) {
      throw new Error("Charge amount must be greater than zero");
    }

    const body = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: getApiLoginId(),
          transactionKey: getTransactionKey(),
        },
        refId: input.orderId.slice(0, 20),
        transactionRequest: {
          transactionType: "authCaptureTransaction",
          amount: amount.toFixed(2),
          payment: {
            opaqueData: {
              dataDescriptor: input.opaqueDataDescriptor,
              dataValue: input.opaqueDataValue,
            },
          },
          order: {
            invoiceNumber: input.orderId.slice(0, 20),
            description: `PSL Labs order ${input.orderId}`,
          },
          customer: input.buyerEmail
            ? { email: input.buyerEmail }
            : undefined,
          billTo: input.billTo
            ? {
                firstName: input.billTo.firstName.slice(0, 50),
                lastName: input.billTo.lastName.slice(0, 50),
                address: input.billTo.address.slice(0, 60),
                city: input.billTo.city.slice(0, 40),
                state: input.billTo.state.slice(0, 40),
                zip: input.billTo.zip.slice(0, 20),
                country: input.billTo.country.slice(0, 60),
              }
            : undefined,
          shipTo: input.billTo
            ? {
                firstName: input.billTo.firstName.slice(0, 50),
                lastName: input.billTo.lastName.slice(0, 50),
                address: input.billTo.address.slice(0, 60),
                city: input.billTo.city.slice(0, 40),
                state: input.billTo.state.slice(0, 40),
                zip: input.billTo.zip.slice(0, 20),
                country: input.billTo.country.slice(0, 60),
              }
            : undefined,
        },
      },
    };

    const res = await fetch(getApiEndpoint(environment), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    let data: AuthNetCreateTransactionResponse;
    try {
      data = JSON.parse(rawText) as AuthNetCreateTransactionResponse;
    } catch {
      throw new Error(
        `Authorize.net returned a non-JSON response (${res.status})`
      );
    }

    const tx = data.transactionResponse;
    const responseCode = tx?.responseCode;
    const transactionId = tx?.transId?.trim() ?? "";

    if (responseCode === "1" && transactionId) {
      return {
        transactionId,
        authCode: tx?.authCode,
        processor: this.name,
      };
    }

    const declineText =
      firstMessageText(tx?.errors) ??
      firstMessageText(tx?.messages) ??
      firstMessageText(data.messages?.message) ??
      "Card payment was declined.";

    const err = new Error(declineText) as Error & {
      declined?: boolean;
      responseCode?: string;
    };
    err.declined = responseCode === "2" || responseCode === "3";
    err.responseCode = responseCode;
    throw err;
  }
}
