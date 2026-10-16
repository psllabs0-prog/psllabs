import assert from "node:assert/strict";
import { getManualFulfillmentTestScope } from "@/lib/db/sql";
import { isBtcpostageConfigured } from "@/lib/btcpostage/config";
import { getOrderLabelPublic, recoverOrderPurchase } from "@/lib/btcpostage/service";
import { getFulfillmentShippingStatus, prepareFulfillmentLabel, purchaseFulfillmentLabel } from "./shipping-flow";
import { createManualTestFixture, getManualTestControl, inManualTestScope, manualFixtureExists, manualTestSenderFingerprint, manualTestAddressEditable, updateManualTestAddress } from "./manual-test-db";
import { MANUAL_TEST_ORDER, MANUAL_TEST_PACKAGE, MANUAL_TEST_RECIPIENT } from "./manual-test-constants";
import { getOrder } from "@/lib/orders/store";
import { dispatchTrackingNotification } from "./tracking-notification";
import { privateDigest, saveTrackingAndQueue } from "./shipping-flow-store";
import { buildTrackingReadyEmail } from "@/lib/email/tracking-ready";
import { createSmtpTransport, FROM_EMAIL, SUPPORT_EMAIL } from "@/lib/email/shared";
import { createQaMailAuthorization, QA_MAIL_AUTHORIZATION, QA_MAIL_MESSAGE_ID, QA_MAIL_RECIPIENT_HASH } from "./test-mail-authorization";
import type { Order } from "@/lib/orders/types";
import type { ManualFulfillmentTestReply, ManualFulfillmentTestStatus } from "./manual-test-types";
import { manualTestDestination } from "./manual-test-destination";

function authorization() {
  return createQaMailAuthorization((query, values) => getManualTestControl().query(query, values));
}
async function readMailStatus(): Promise<ManualFulfillmentTestStatus["testEmail"]["status"]> {
  const db = getManualTestControl();
  const table = (await db.query("SELECT to_regclass('psl_fulfillment_qa_receipts.mail_authorizations') IS NOT NULL AS present")).rows[0];
  // GET never creates a mail authorization or touches SMTP.
  if (!table?.present) return "none";
  const row = (await db.query('SELECT recipient_hash,message_id,status FROM "psl_fulfillment_qa_receipts".mail_authorizations WHERE authorization_key=$1', [QA_MAIL_AUTHORIZATION])).rows[0];
  if (!row) return "none";
  assert(row.recipient_hash === QA_MAIL_RECIPIENT_HASH && row.message_id === QA_MAIL_MESSAGE_ID && ["claimed", "smtp_accepted", "needs_review"].includes(row.status), "The fixed test-mail authorization needs review.");
  return row.status;
}
export async function manualTestStatus(): Promise<ManualFulfillmentTestStatus> {
  let senderReady = false;
  try { manualTestSenderFingerprint(); senderReady = true; } catch { /* Boolean only; never expose sender identity. */ }
  const exists = await manualFixtureExists();
  const details = exists ? await inManualTestScope(async () => {
    const order = await getOrder(MANUAL_TEST_ORDER);
    assert(order, "The fixed manual test order is missing.");
    const destination = manualTestDestination(order);
    assert(destination, "The manual destination needs review.");
    return { shippingStatus: await getFulfillmentShippingStatus(MANUAL_TEST_ORDER), canEditTestAddress: await manualTestAddressEditable(),
      testAddress: { address: destination.street1, street2: destination.street2 || "", city: destination.city, state: destination.state, zip: destination.zip } };
  }) : { shippingStatus: null, canEditTestAddress: false, testAddress: null };
  return { exists, testOnly: true, orderId: MANUAL_TEST_ORDER, recipient: MANUAL_TEST_RECIPIENT, package: { ...MANUAL_TEST_PACKAGE },
    serviceName: "USPS Ground Advantage", providerConfigured: isBtcpostageConfigured(), senderReady,
    smtpReady: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD),
    ...details,
    testEmail: { status: await readMailStatus() } };
}
async function sendTestMail(order: Order) {
  assert(getManualFulfillmentTestScope()?.allowTestEmail && order.orderId === MANUAL_TEST_ORDER && order.email === MANUAL_TEST_RECIPIENT,
    "A test email requires the fixed private fixture and explicit owner action.");
  const receipt = authorization();
  assert(await receipt.claim(), "This test email authorization was already used. Check Sent mail; no resend is allowed.");
  const built = buildTrackingReadyEmail(order);
  const note = "TEST ONLY: This is a fake order and a USPS test label. No payment was charged, no paid postage was purchased and no package will be sent. This tracking number is not a real shipment.";
  const transport = createSmtpTransport({ connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
  try {
    const sent = await transport.sendMail({ from: FROM_EMAIL, to: MANUAL_TEST_RECIPIENT, replyTo: SUPPORT_EMAIL, messageId: QA_MAIL_MESSAGE_ID,
      subject: `[TEST ONLY] ${built.subject}`, text: `${note}\n\n${built.text}`, html: `<p style="font-weight:bold;color:#b00">${note}</p>${built.html}` });
    assert(sent.accepted.length === 1 && sent.accepted[0] === MANUAL_TEST_RECIPIENT && sent.rejected.length === 0, "The test recipient was not confirmed by SMTP.");
    await receipt.accepted();
  } catch (error) { await receipt.uncertain().catch(() => undefined); throw error; }
  finally { transport.close(); }
}
export async function manualTestAction(action: string, input: { previewToken?: string; confirmPurchase?: boolean; testAddress?: unknown }): Promise<ManualFulfillmentTestReply> {
  if (action === "create_test_order") {
    await createManualTestFixture();
    return manualTestStatus();
  }
  if (action === "prepare") {
    const result = await inManualTestScope(() => prepareFulfillmentLabel(MANUAL_TEST_ORDER));
    return { ...await manualTestStatus(), preview: result.preview };
  }
  if (action === "update_test_address") {
    await updateManualTestAddress(input.testAddress);
    return manualTestStatus();
  }
  if (action === "purchase") {
    await inManualTestScope(() => purchaseFulfillmentLabel({ orderId: MANUAL_TEST_ORDER, previewToken: input.previewToken || "", confirmPurchase: input.confirmPurchase === true }));
  } else if (action === "retrieve") {
    await inManualTestScope(async () => {
      const label = await getOrderLabelPublic(MANUAL_TEST_ORDER);
      assert(label?.btcpOrderId, "No saved test purchase is available to retrieve.");
      await recoverOrderPurchase({ orderId: MANUAL_TEST_ORDER, btcpOrderId: label.btcpOrderId });
    });
  } else if (action === "send_test_email") {
    await inManualTestScope(async () => {
      const order = await getOrder(MANUAL_TEST_ORDER), label = await getOrderLabelPublic(MANUAL_TEST_ORDER);
      assert(order && label?.purchaseStatus === "purchased" && label.testMode && label.trackingNumber && label.service === "GroundAdvantage", "A saved USPS test label is required before the explicit test email.");
      assert(order.email === MANUAL_TEST_RECIPIENT, "Test recipient changed.");
      await saveTrackingAndQueue({ orderId: MANUAL_TEST_ORDER, trackingNumber: label.trackingNumber, carrier: "USPS", recipientEmail: MANUAL_TEST_RECIPIENT, recipientHash: privateDigest(MANUAL_TEST_RECIPIENT) });
      await dispatchTrackingNotification(MANUAL_TEST_ORDER, true);
    }, sendTestMail);
  } else throw new Error("Unknown manual test action.");
  return manualTestStatus();
}
