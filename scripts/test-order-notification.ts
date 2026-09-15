/**
 * Regression: internal merchant paid-order notification links + payment labels.
 * Run: npx tsx scripts/test-order-notification.ts
 */
import { readFileSync } from "fs";
import { join } from "path";

import {
  buildMerchantOrderNotificationLinks,
  buildMerchantPaymentNotificationFields,
} from "../lib/email/order-notification";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function testMerchantLinks() {
  const bitcoinLinks = buildMerchantOrderNotificationLinks({
    siteUrl: "https://psllabs.org",
    btcpayUrl: "https://btcpay.example.com/",
    paymentMethod: "bitcoin",
  });
  assert(
    bitcoinLinks.adminLedgerUrl === "https://psllabs.org/admin-ledger",
    "primary action is admin ledger"
  );
  assert(
    bitcoinLinks.btcpayRootUrl === "https://btcpay.example.com",
    "BTCPay root only (no invoice path) for bitcoin"
  );
  assert(
    !bitcoinLinks.adminLedgerUrl.includes("@") &&
      !bitcoinLinks.adminLedgerUrl.includes("order=") &&
      !/email=/i.test(bitcoinLinks.adminLedgerUrl),
    "no customer PII in admin ledger URL"
  );
  assert(
    !`${bitcoinLinks.adminLedgerUrl}${bitcoinLinks.btcpayRootUrl ?? ""}`.includes(
      "/invoices/"
    ),
    "no /invoices/{id} in merchant links"
  );

  const cardLinks = buildMerchantOrderNotificationLinks({
    siteUrl: "https://psllabs.org",
    btcpayUrl: "https://btcpay.example.com/",
    paymentMethod: "card",
  });
  assert(
    cardLinks.adminLedgerUrl === "https://psllabs.org/admin-ledger",
    "card orders still get admin ledger"
  );
  assert(
    cardLinks.btcpayRootUrl === null,
    "card orders must not get BTCPay link"
  );

  const noBtcpay = buildMerchantOrderNotificationLinks({
    siteUrl: "https://www.psllabs.org",
    btcpayUrl: "",
    paymentMethod: "bitcoin",
  });
  assert(noBtcpay.btcpayRootUrl === null, "missing BTCPAY_URL => no Open BTCPay");
  assert(
    noBtcpay.adminLedgerUrl.endsWith("/admin-ledger"),
    "admin ledger still present without BTCPay"
  );
}

function testPaymentAwareCopy() {
  const bitcoin = buildMerchantPaymentNotificationFields({
    paymentMethod: "bitcoin",
    invoiceId: "btc-inv-123",
  });
  assert(bitcoin.paymentMethodDisplay === "Bitcoin", "bitcoin method label");
  assert(
    bitcoin.paymentIdLabel === "BTCPay invoice ID",
    "bitcoin uses BTCPay invoice terminology"
  );
  assert(bitcoin.paymentIdValue === "btc-inv-123", "bitcoin shows invoice id");
  assert(bitcoin.showBtcpayLink === true, "bitcoin may show BTCPay link");
  assert(
    /BTCPay/.test(bitcoin.paymentIdLabel),
    "bitcoin email copy mentions BTCPay"
  );

  const card = buildMerchantPaymentNotificationFields({
    paymentMethod: "card",
    invoiceId: "tagada-txn-456",
  });
  assert(card.paymentMethodDisplay === "Card", "card method label");
  assert(
    card.paymentIdLabel === "Payment / transaction ID",
    "card uses generic payment/transaction ID label"
  );
  assert(
    card.paymentIdValue === "tagada-txn-456",
    "card email still shows its payment/transaction ID"
  );
  assert(card.showBtcpayLink === false, "card must not show BTCPay link");
  assert(
    !/BTCPay/i.test(card.paymentIdLabel) &&
      !/BTCPay/i.test(card.paymentMethodDisplay),
    "card email does not mention BTCPay"
  );
}

function testSourceContracts() {
  const root = process.cwd();
  const merchant = readFileSync(
    join(root, "lib/email/order-notification.ts"),
    "utf8"
  );
  const customer = readFileSync(
    join(root, "lib/email/order-confirmation.ts"),
    "utf8"
  );
  const fulfill = readFileSync(
    join(root, "lib/orders/fulfill-paid-order.ts"),
    "utf8"
  );
  const webhook = readFileSync(
    join(root, "app/api/btcpay-webhook/route.ts"),
    "utf8"
  );
  const inventory = readFileSync(
    join(root, "lib/inventory/store.ts"),
    "utf8"
  );

  assert(
    !/\/invoices\/\$\{/.test(merchant) &&
      !/`\$\{[^}]+\}\/invoices\//.test(merchant),
    "merchant notification must not build /invoices/{id}"
  );
  assert(/admin-ledger/.test(merchant), "merchant links to admin-ledger");
  assert(/Open BTCPay/.test(merchant), "optional Open BTCPay label present");
  assert(
    /BTCPay invoice ID|invoiceId/.test(merchant),
    "invoice ID remains visible for bitcoin"
  );
  assert(
    /Payment \/ transaction ID/.test(merchant),
    "card generic payment ID label present"
  );
  assert(
    /Payment method:/.test(merchant),
    "payment method line present in merchant notification"
  );
  assert(
    /order\.orderId/.test(merchant),
    "PSL order ID remains in merchant notification"
  );
  assert(
    /buildMerchantPaymentNotificationFields/.test(merchant),
    "payment-aware fields helper is used"
  );

  assert(
    !/\/invoices\//.test(customer),
    "customer confirmation has no /invoices/ link"
  );
  assert(
    !/admin-ledger/.test(customer),
    "customer confirmation has no admin ledger link"
  );
  assert(
    !/BTCPAY_URL/.test(customer),
    "customer confirmation does not use BTCPAY_URL"
  );

  assert(/settlePaidOrder/.test(fulfill), "fulfill still settles paid order");
  assert(/sendOrderEmail/.test(fulfill), "fulfill still sends merchant email");
  assert(
    /sendCustomerOrderConfirmation/.test(fulfill),
    "fulfill still sends customer confirmation"
  );
  assert(
    /claimOrderEmail/.test(fulfill) && /claimCustomerOrderEmail/.test(fulfill),
    "email sends remain claim-gated (exactly-once intent)"
  );

  assert(
    /InvoiceSettled/.test(webhook) && /fulfillPaidOrder|settlePaidOrder/.test(webhook),
    "InvoiceSettled webhook path unchanged in shape"
  );
  assert(
    /settle_paid_order/.test(inventory),
    "stock decrement still via settle_paid_order (DB once-semantics)"
  );
}

function main() {
  console.log("[test-order-notification] running…");
  testMerchantLinks();
  testPaymentAwareCopy();
  testSourceContracts();
  console.log("[test-order-notification] all passed.");
}

main();
