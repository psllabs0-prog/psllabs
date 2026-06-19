import type { PaymentProcessor } from "./index";

let cachedProcessor: PaymentProcessor | null = null;

export function getPaymentProcessor(): PaymentProcessor {
  if (cachedProcessor) return cachedProcessor;

  const provider = process.env.PAYMENT_PROCESSOR ?? "btcpay";

  switch (provider) {
    case "btcpay": {
      const { BTCPayProcessor } = require("./btcpay") as typeof import("./btcpay");
      cachedProcessor = new BTCPayProcessor();
      return cachedProcessor;
    }
    default:
      throw new Error(
        `Unknown payment processor "${provider}". Supported: btcpay`
      );
  }
}
