const SENSITIVE_KEY =
  /^(cvv|cvc|cid|card_?number|pan|primary_?account|account_?number|opaque_?data|payment_?token|client_?secret|private_?key|seed|mnemonic|wallet_?secret|password|api_?key|authorization|btcpay_?api|tagada_?api)$/i;

const PARTIAL_SENSITIVE =
  /(number|secret|token|password|private.?key|seed|cvv|cvc|opaque)/i;

/** Deep-clone JSON and redact keys that may hold payment secrets. */
export function sanitizeProviderPayload(raw: unknown): unknown {
  return sanitizeValue(raw, null);
}

function sanitizeValue(value: unknown, parentKey: string | null): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, parentKey));
  }
  if (typeof value !== "object") {
    if (
      parentKey &&
      PARTIAL_SENSITIVE.test(parentKey) &&
      typeof value === "string" &&
      value.length > 4
    ) {
      return "[redacted]";
    }
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key) || PARTIAL_SENSITIVE.test(key)) {
      // Keep non-sensitive card metadata when nested under paymentInstrument.card
      if (
        key.toLowerCase() === "card" &&
        child &&
        typeof child === "object" &&
        !Array.isArray(child)
      ) {
        const card = child as Record<string, unknown>;
        out[key] = {
          last4: typeof card.last4 === "string" ? card.last4 : undefined,
          brand: typeof card.brand === "string" ? card.brand : undefined,
          expYear: card.expYear ?? undefined,
          expMonth: card.expMonth ?? undefined,
        };
        continue;
      }
      out[key] = "[redacted]";
      continue;
    }
    out[key] = sanitizeValue(child, key);
  }
  return out;
}
