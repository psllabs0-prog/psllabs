import type { PaymentProcessor } from "./index";

const cachedProcessors = new Map<string, PaymentProcessor>();

export function getPaymentProcessor(
  provider = process.env.PAYMENT_PROCESSOR ?? "btcpay"
): PaymentProcessor {
  const cached = cachedProcessors.get(provider);
  if (cached) return cached;

  let processor: PaymentProcessor;

  switch (provider) {
    case "btcpay": {
      const { BTCPayProcessor } = require("./btcpay") as typeof import("./btcpay");
      processor = new BTCPayProcessor();
      break;
    }
    case "card": {
      const { CardProcessor } = require("./authnet") as typeof import("./authnet");
      processor = new CardProcessor();
      break;
    }
    default:
      throw new Error(
        `Unknown payment processor "${provider}". Supported: btcpay, card`
      );
  }

  cachedProcessors.set(provider, processor);
  return processor;
}
