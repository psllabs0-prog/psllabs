/**
 * Regression: internal merchant paid-order notification links.
 * Run: npx tsx scripts/test-order-notification.ts
 */
import { readFileSync } from "fs";
import { join } from "path";

import { buildMerchantOrderNotificationLinks } from "../lib/email/order-notification";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function testMerchantLinks() {
  const links = buildMerchantOrderNotificationLinks({
    siteUrl: "https://psllabs.org",
    btcpayUrl: "https://btcpay.example.com/",
  });
  assert(
    links.adminLedgerUrl === "https://psllabs.org/admin-ledger",
    "primary action is admin ledger"
  );
  assert(
    links.btcpayRootUrl === "https://btcpay.example.com",
    "BTCPay root only (no invoice path)"
  );
  assert(
    !links.adminLedgerUrl.includes("@") &&
      !links.adminLedgerUrl.includes("order=") &&
      !/email=/i.test(links.adminLedgerUrl),
    "no customer PII in admin ledger URL"
  );
  assert(
    !`${links.adminLedgerUrl}${links.btcpayRootUrl ?? ""}`.includes("/invoices/"),
    "no /invoices/{id} in merchant links"
  );

  const noBtcpay = buildMerchantOrderNotificationLinks({
    siteUrl: "https://www.psllabs.org",
    btcpayUrl: "",
  });
  assert(noBtcpay.btcpayRootUrl === null, "missing BTCPAY_URL => no Open BTCPay");
  assert(
    noBtcpay.adminLedgerUrl.endsWith("/admin-ledger"),
    "admin ledger still present without BTCPay"
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
    "invoice ID remains visible"
  );
  assert(
    /order\.orderId/.test(merchant),
    "PSL order ID remains in merchant notification"
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
  testSourceContracts();
  console.log("[test-order-notification] all passed.");
}

main();
