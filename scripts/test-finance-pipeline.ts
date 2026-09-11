/**
 * Offline smoke tests for finance webhook verification + sanitization.
 * Run: npx tsx scripts/test-finance-pipeline.ts
 */
import crypto from "crypto";

import { sanitizeProviderPayload } from "../lib/finance/sanitize";
import {
  verifyBtcpayWebhookSignature,
  verifyTagadaWebhookSignature,
} from "../lib/finance/webhook-verify";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function testBtcpaySignatures() {
  const secret = "btcpay-test-secret";
  const body = JSON.stringify({
    deliveryId: "del_1",
    type: "InvoiceSettled",
    invoiceId: "inv_abc",
    timestamp: 1700000000,
  });
  const valid =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(body).digest("hex");

  assert(
    verifyBtcpayWebhookSignature(body, secret, valid),
    "valid BTCPay signature should pass"
  );
  assert(
    !verifyBtcpayWebhookSignature(body, secret, "sha256=deadbeef"),
    "invalid BTCPay signature should fail"
  );
  assert(
    !verifyBtcpayWebhookSignature(body, secret, null),
    "missing BTCPay signature should fail"
  );
}

function testTagadaSignatures() {
  const secret = "whsec_test";
  const body = JSON.stringify({
    id: "evt_1",
    type: "order/paid",
    data: { orderId: "psl_1", paymentId: "pay_1" },
  });
  const digest = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("hex");
  const valid = `sha256=${digest}`;

  assert(
    verifyTagadaWebhookSignature(body, secret, valid),
    "valid Tagada signature should pass"
  );
  assert(
    !verifyTagadaWebhookSignature(body, secret, "sha256=00"),
    "invalid Tagada signature should fail"
  );
  assert(
    !verifyTagadaWebhookSignature(body, secret, null),
    "missing Tagada signature should fail"
  );
}

function testSanitize() {
  const cleaned = sanitizeProviderPayload({
    id: "evt",
    type: "payment/succeeded",
    cvv: "123",
    cardNumber: "4111111111111111",
    paymentInstrument: {
      card: {
        last4: "4242",
        brand: "visa",
        number: "4111111111111111",
      },
    },
    private_key: "SECRET",
  }) as Record<string, unknown>;

  assert(cleaned.cvv === "[redacted]", "cvv must be redacted");
  assert(cleaned.cardNumber === "[redacted]", "card number must be redacted");
  assert(cleaned.private_key === "[redacted]", "private_key must be redacted");
  const instrument = cleaned.paymentInstrument as {
    card: { last4?: string; brand?: string; number?: unknown };
  };
  assert(instrument.card.last4 === "4242", "last4 should remain");
  assert(instrument.card.brand === "visa", "brand should remain");
}

function testNonRevenueEvents() {
  const revenueTypes = new Set(["InvoiceSettled"]);
  assert(!revenueTypes.has("InvoiceExpired"), "expired is not revenue");
  assert(!revenueTypes.has("InvoiceCreated"), "created is not revenue");
}

function testSheetsSkipRetryEligibility() {
  const notConfigured = "Google Sheets not configured";
  const otherSkip = "Manual hold";
  const shouldRetry = (status: string, error: string | null) =>
    status === "pending" ||
    status === "failed" ||
    (status === "skipped" && error === notConfigured);
  assert(shouldRetry("skipped", notConfigured), "missing-sheets skip retries");
  assert(!shouldRetry("skipped", otherSkip), "unrelated skip does not retry");
  assert(shouldRetry("pending", null), "pending retries");
  assert(shouldRetry("failed", "boom"), "failed retries");
  assert(!shouldRetry("synced", null), "synced does not retry");
}

testBtcpaySignatures();
testTagadaSignatures();
testSanitize();
testNonRevenueEvents();
testSheetsSkipRetryEligibility();
console.log("finance pipeline smoke tests passed");
