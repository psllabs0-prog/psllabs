import crypto from "crypto";

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length || ab.length === 0) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Official TagadaPay webhook verification:
 * HMAC-SHA256(secret, rawBody) hex vs X-TagadaPay-Signature after sha256=
 * @see https://docs.tagada.io/developer-tools/node-sdk/webhooks-events
 */
export function verifyTagadaWebhookSignature(
  rawBody: string,
  secret: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length).trim();
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  return safeEqualHex(expected, hmac);
}

/**
 * Official BTCPay BTCPAY-SIG verification:
 * sha256= + HMAC-SHA256(secret, rawBody bytes)
 * @see https://docs.btcpayserver.org/Development/GreenFieldExample-NodeJS/
 */
export function verifyBtcpayWebhookSignature(
  rawBody: string,
  secret: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
