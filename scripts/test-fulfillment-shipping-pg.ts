/** Operator-only isolated PostgreSQL integration; plan-only unless explicitly invoked. */
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseEnv } from "node:util";
import { createContext, Script } from "node:vm";
import { Pool } from "pg";
import ts from "typescript";
import { __setSqlClientForTests } from "../lib/db/sql";
import * as orderStore from "../lib/orders/store";
import { checkoutWithStockCheck, ensureInventorySchema, settlePaidOrder } from "../lib/inventory/store";
import { ensureFinanceSchema } from "../lib/finance/schema";
import * as workflowStore from "../lib/fulfillment/store";
import { ensureFulfillmentSchema } from "../lib/fulfillment/schema";
import * as flowStore from "../lib/fulfillment/shipping-flow-store";
import * as labelStore from "../lib/btcpostage/store";
import { ensureBtcpostageSchema } from "../lib/btcpostage/schema";
import * as providerClient from "../lib/btcpostage/client";
import * as providerConfig from "../lib/btcpostage/config";
import * as guards from "../lib/btcpostage/shipping-guard";
import { DEFAULT_PACKAGE, type BtcpostageAddress, type BtcpostagePurchase, type BtcpostageRate } from "../lib/btcpostage/types";
import * as shippingPolicy from "../lib/shipping/policy";
import { isPhysicalUSShippingAddress } from "../lib/shipping/request";
import { getActiveCatalogProducts } from "../lib/products/catalog";
import { buildTrackingReadyEmail } from "../lib/email/tracking-ready";
import { buildOrderShippedEmail } from "../lib/email/order-shipped";
import { createSmtpTransport, FROM_EMAIL, SUPPORT_EMAIL } from "../lib/email/shared";
import type { Order } from "../lib/orders/types";
import { researchOperatorConnection, operatorErrorCode } from "./research-accounts-operator-database";
import { assertQaMailTarget, assertQaProviderRequest, assertQaSchemaIdentity, assertQaSql, QA_RECIPIENT, QA_SCHEMA } from "./fulfillment-shipping-qa-guards";
import { createQaMailAuthorization, QA_MAIL_AUTHORIZATION, QA_MAIL_MESSAGE_ID, QA_RECEIPT_SCHEMA } from "./fulfillment-shipping-qa-receipt";

type Env = Record<string, string | undefined>;
function load<T>(path: string, deps: Record<string, unknown>, env: Env): T {
  const code = ts.transpileModule(readFileSync(resolve(path), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const output: Record<string, unknown> = {};
  const run = new Script(`(function(require,module,exports){${code}\n})`).runInContext(createContext({ console, Error, Date, process: { env } }));
  run((name: string) => { assert(name in deps, "Unreviewed QA module dependency"); return deps[name]; }, { exports: output }, output);
  return output as T;
}
type Identity = { database: string; role: string; server: string | null; port: number | null };
const IDENTITY_SQL = "SELECT current_database() AS database, current_user AS role, inet_server_addr()::text AS server, inet_server_port() AS port";

async function main() {
  if (!process.argv.includes("--run-isolated-qa")) {
    console.log("Plan only: private random PostgreSQL schema, fake inventory/order, real application SQL, mocked carrier by default. Optional --provider-test allows only USPS no-debit test_mode to configured sender; --send-test-email sends one clearly TEST-only message exclusively to lukeghaz@gmail.com. Public orders/payment/stock untouched; owned-schema OID cleanup required.");
    return;
  }
  const envFile = process.argv.find(x => x.startsWith("--env-file="))?.slice(11);
  const environment = process.argv.includes("--environment");
  assert(Boolean(envFile) !== environment, "Choose one explicit protected configuration source.");
  const protectedEnv: Env = environment ? { ...process.env } : parseEnv(readFileSync(envFile!, "utf8"));
  const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
  const providerTest = process.argv.includes("--provider-test"), sendMail = process.argv.includes("--send-test-email");
  if (sendMail) assert(process.argv.includes(`--recipient=${QA_RECIPIENT}`), "Explicit exact test recipient required.");
  const connection = researchOperatorConnection(protectedEnv);
  const schema = `psl_fulfillment_qa_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_${crypto.randomBytes(8).toString("hex")}`;
  assert(QA_SCHEMA.test(schema));
  const reportPath = resolve(process.argv.find(x => x.startsWith("--report="))?.slice(9) || resolve(tmpdir(), `${schema}.json`));
  const control = new Pool({ connectionString: connection.connectionString, options: "-c search_path=pg_catalog", max: 1, connectionTimeoutMillis: 10000, idleTimeoutMillis: 1000 });
  const isolated = new Pool({ connectionString: connection.connectionString, options: `-c search_path=${schema}`, max: 4, connectionTimeoutMillis: 10000, idleTimeoutMillis: 1000 });
  let oid: string | null = null, schemaCreated = false, identity: Identity | null = null, stage = "preflight", checks = 0, realSmtpAttempts = 0, carrierCreates = 0, mockCreates = 0, capturedMails = 0;
  const report: Record<string, unknown> = { schema, startedAt: new Date().toISOString(), businessDataOnlyInTemporarySchema: true,
    durableReceiptRetention: "Minimal authorization metadata retained separately if the SMTP test phase is reached", publicWrites: 0, realPaymentRequests: 0,
    providerMode: providerTest ? "USPS test_mode only" : "mocked carrier", requestedTestEmail: sendMail, recipient: sendMail ? QA_RECIPIENT : null,
    testEmailSentThisRun: false, actualCustomerTrackingOrEmails: 0, fixtureDifferences: ["Payment settlement is synthetic inside a disposable schema; no real payment.", "Real USPS test labels never attach tracking or send email.", "Email/outbox case uses a mocked carrier response, not a live or test USPS shipment."] };
  const check = (v: unknown, message: string) => { assert.ok(v, message); checks++; };
  const persist = () => writeFileSync(reportPath, JSON.stringify({ ...report, stage, checks, realSmtpAttempts, carrierCreates, mockCreates, capturedMails }, null, 2));
  try {
    Object.assign(process.env, protectedEnv, { PSL_VISUAL_PREVIEW: "0" });
    let senderFieldsPresent = false, originMatchesApprovedZip = false;
    try {
      const configuredSender = providerConfig.getBtcpostageFromAddress();
      senderFieldsPresent = true;
      originMatchesApprovedZip = configuredSender.country === "US" && configuredSender.zip.slice(0, 5) === "85016";
    } catch { /* Readiness is reported without exposing sender identity or configuration. */ }
    report.configurationBeforeQaOverride = {
      btcpostageTestMode: providerConfig.isBtcpostageTestMode(),
      providerCredentialsPresent: providerConfig.isBtcpostageConfigured(),
      senderFieldsPresent, originMatchesApprovedZip,
      smtpFieldsPresent: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD),
      labelFlowEnabled: process.env.PSL_FULFILLMENT_LABEL_FLOW_ENABLED === "true",
      trackingEmailEnabled: process.env.PSL_FULFILLMENT_TRACKING_EMAIL_ENABLED === "true",
    };
    process.env.BTCPOSTAGE_TEST_MODE = "true";
    const from: BtcpostageAddress = providerTest ? providerConfig.getBtcpostageFromAddress() :
      { name: "PSL QA Fixture", street1: "1 QA Fixture Street", street2: "", city: "Phoenix", state: "AZ", zip: "85016", country: "US" };
    const qaDestination = { ...from, street1: [from.street1, from.street2].filter(Boolean).join(", "), street2: "" };
    check(from.zip.slice(0, 5) === "85016" && from.country === "US", "configured sender must match approved origin");
    if (providerTest) check(providerConfig.isBtcpostageConfigured(), "provider credentials configured");
    if (sendMail) check(Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD), "SMTP configured");
    identity = (await control.query<Identity>(IDENTITY_SQL)).rows[0];
    report.connectionIdentity = identity; report.connectionMode = connection.connectionMode;
    stage = "create-owned-isolated-schema";
    await control.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const created = (await control.query("SELECT oid::text, pg_get_userbyid(nspowner)=current_user AS owned FROM pg_namespace WHERE nspname=$1", [schema])).rows[0];
    check(created?.owned === true, "temporary schema owned by current role"); oid = created.oid;
    const isolatedIdentity = (await isolated.query<Identity>(IDENTITY_SQL)).rows[0];
    check(JSON.stringify(identity) === JSON.stringify(isolatedIdentity), "control and isolated connections identify same database/server/role");
    const sql = async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const query = parts.reduce((s, part, i) => s + (i ? `$${i}` : "") + part, "");
      assertQaSql(query);
      const client = await isolated.connect();
      try {
        const scope = (await client.query("SELECT current_schema() AS schema, current_schemas(false) AS scopes")).rows[0];
        assert(scope.schema === schema && JSON.stringify(scope.scopes) === JSON.stringify([schema]), "Application SQL must remain in the QA schema only.");
        return (await client.query(query, values)).rows;
      } finally { client.release(); }
    };
    __setSqlClientForTests(sql as never);
    stage = "apply-actual-application-schemas";
    await ensureInventorySchema(); await ensureFinanceSchema(); await ensureFulfillmentSchema(); await ensureBtcpostageSchema(); await flowStore.ensureShippingFlowSchema();
    const product = getActiveCatalogProducts().find(p => p.handle === "retatrutide")!;
    check(Boolean(product), "actual catalog product available for private fixture");
    await sql`INSERT INTO products(handle,name,stock,sku) VALUES(${product.handle},${product.name},20,${product.sku})`;
    const makeOrder = async (suffix: string) => {
      const id = `${schema}_${suffix}`;
      const fixture = { orderId: id, currency: "USD", email: QA_RECIPIENT, shipping: { firstName: "TEST", lastName: "ONLY", address: qaDestination.street1,
        city: from.city, state: from.state, zip: from.zip, country: "US", selection: shippingPolicy.standardShippingSelection() },
        items: [{ handle: product.handle, name: product.name, strength: product.strength, quantity: 1, unitPrice: product.price, lineTotal: product.price }],
        subtotal: product.price, discountCode: null, discountAmount: 0, taxRate: 0, tax: 0, shippingCost: 9.99, total: Math.round((product.price + 9.99) * 100) / 100, attribution: null } as Order;
      check((await checkoutWithStockCheck(fixture)).ok, "actual private checkout stock function creates fake order");
      const paid = await settlePaidOrder(id, null);
      check(paid.ok && paid.wasNewlyPaid && !paid.stockDecrementFailed, "synthetic settlement decrements only private fixture inventory");
      await workflowStore.upsertFulfillmentWorkflow({ orderId: id, workflowStatus: "packed", packedAt: new Date().toISOString() });
      return id;
    };
    // No unrelated fetch is allowed; provider wrapper passes this explicitly too.
    globalThis.fetch = async () => { throw new Error("Unreviewed network request is forbidden in fulfillment QA."); };
    let standardizedDestination: BtcpostageAddress = qaDestination;
    const providerFetch: typeof fetch = async (url, init) => {
      const guarded = { ...init, redirect: "error" as const, signal: AbortSignal.timeout(30000) };
      assertQaProviderRequest(url, guarded, from, schema, standardizedDestination);
      if (String(url).endsWith("/create-purchase")) carrierCreates++;
      return originalFetch(url, guarded);
    };
    let captureOnly = true;
    let emailHeldByPriorClaim = false;
    const mailAuthorization = createQaMailAuthorization((query, values) => control.query(query, values));
    const testMailer = async (order: Order, messageId: string) => {
      assertQaMailTarget(order.email, order.orderId, schema);
      const persisted = await orderStore.getOrder(order.orderId);
      check(persisted?.trackingNumber === order.trackingNumber, "database tracking saved before mail transport");
      check((await flowStore.getTrackingNotification(order.orderId))?.status === "sending", "real database exclusive notification claim precedes mail");
      const built = order.status === "shipped" ? buildOrderShippedEmail(order) : buildTrackingReadyEmail(order);
      const disclaimer = "TEST ONLY: This is a fake order and fake tracking number. No payment was charged, no postage was purchased and no package will be sent. The tracking link will not identify a real shipment.";
      const mail = { from: FROM_EMAIL, to: QA_RECIPIENT, replyTo: SUPPORT_EMAIL, messageId: sendMail && !captureOnly ? QA_MAIL_MESSAGE_ID : messageId, subject: `[TEST ONLY] ${built.subject}`,
        text: `${disclaimer}\n\n${built.text}`, html: `<p style="font-size:16px;font-weight:bold;color:#b00">${disclaimer}</p>${built.html}` };
      report.testEmailSubject = mail.subject; report.testMessageId = mail.messageId;
      if (captureOnly || !sendMail) { capturedMails++; return; }
      check(realSmtpAttempts === 0, "at most one real SMTP attempt allowed");
      report.durableReceiptSchema = QA_RECEIPT_SCHEMA; report.mailAuthorization = QA_MAIL_AUTHORIZATION;
      if (!await mailAuthorization.claim()) {
        report.durableReceiptRetained = true;
        emailHeldByPriorClaim = true;
        report.priorTestEmailStatus = await mailAuthorization.status();
        report.testEmailDelivery = report.priorTestEmailStatus === "smtp_accepted"
          ? "previously SMTP accepted for this authorization; no email sent this run; inbox arrival not verified by this run"
          : "held: this authorization was already claimed with an unconfirmed outcome; no email sent this run";
        throw new Error("QA test email authorization already claimed. Check Sent mail; no resend allowed.");
      }
      report.durableReceiptRetained = true;
      realSmtpAttempts++; report.testEmailDelivery = "attempting; do not repeat blindly"; persist();
      const transport = createSmtpTransport({ connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
      try {
        const sent = await transport.sendMail(mail);
        check(sent.accepted.length === 1 && sent.accepted[0] === QA_RECIPIENT && sent.rejected.length === 0, "SMTP accepted exact allowlisted recipient only");
        await mailAuthorization.accepted();
        report.testEmailDelivery = "SMTP accepted; inbox arrival not yet verified";
        report.testEmailSentThisRun = true;
      } catch (error) {
        await mailAuthorization.uncertain().catch(() => undefined);
        throw error;
      } finally { transport.close(); }
    };
    const dispatcher = load<typeof import("../lib/fulfillment/tracking-notification")>("lib/fulfillment/tracking-notification.ts", {
      "@/lib/orders/store": orderStore, "@/lib/email/order-shipped": { sendOrderShippedEmail: testMailer }, "@/lib/email/tracking-ready": { sendTrackingReadyEmail: testMailer }, "./shipping-flow-store": flowStore,
    }, {});
    const createFlow = (realUspsTest: boolean, logicalTestMode: boolean) => {
      const config = { getBtcpostageFromAddress: () => from, isBtcpostageTestMode: () => logicalTestMode,
        getBtcpostagePublicConfig: () => ({ configured: true, testMode: logicalTestMode }) };
      const mockRates: BtcpostageRate[] = [{ carrier: "USPS", service: "GroundAdvantage", serviceDisplay: "USPS Ground Advantage", currency: "USD", rate: "6.32", estDeliveryDays: 2 }];
      const mockClient = { BtcpostageApiError: providerClient.BtcpostageApiError,
        verifyAddress: async (address: BtcpostageAddress) => ({ isValid: true, standardized: address, errors: [], raw: { fixture: true } }),
        getRates: async () => mockRates,
        createPurchase: async (input: Parameters<typeof providerClient.createPurchase>[0]): Promise<BtcpostagePurchase> => {
          assert(input.orderNotes?.startsWith(`PSL ${schema}_`)); mockCreates++;
          return { orderId: `mock_${crypto.randomBytes(8).toString("hex")}`, orderNotes: input.orderNotes!, orderTimestamp: null, remainingCredits: null,
            items: [{ shipmentId: "TEST-ONLY", carrier: "usps", service: input.service, price: "6.32", currency: "USD", filename: "https://example.invalid/TEST-NO-LABEL.pdf", trackingNo: "TEST-NOT-A-SHIPMENT", toName: "TEST ONLY" }] };
        },
        retrievePurchase: async () => { throw new Error("Mock retrieval not required in this integration run."); },
      };
      const client = realUspsTest ? { ...providerClient,
        verifyAddress: async (address: BtcpostageAddress) => {
          const verified = await providerClient.verifyAddress(address, providerFetch);
          if (verified.isValid && verified.standardized) {
            assert(verified.standardized.zip.slice(0, 5) === from.zip.slice(0, 5) && verified.standardized.state.toUpperCase() === from.state.toUpperCase(), "Verified QA destination must remain the configured sender location.");
            standardizedDestination = verified.standardized;
          }
          return verified;
        },
        getRates: (input: Parameters<typeof providerClient.getRates>[0]) => providerClient.getRates({ ...input, fetchImpl: providerFetch }),
        createPurchase: (input: Parameters<typeof providerClient.createPurchase>[0]) => {
          assert(input.testMode === true && input.carrier === "USPS", "Actual carrier calls must be no-debit USPS tests.");
          return providerClient.createPurchase({ ...input, fetchImpl: providerFetch });
        },
      } : mockClient;
      const service = load<typeof import("../lib/btcpostage/service")>("lib/btcpostage/service.ts", {
        "@/lib/orders/store": orderStore, "@/lib/shipping/policy": shippingPolicy, "@/lib/shipping/request": { isPhysicalUSShippingAddress },
        "./client": client, "./config": config, "./store": labelStore, "./types": { DEFAULT_PACKAGE }, "./shipping-guard": guards,
      }, {});
      return load<typeof import("../lib/fulfillment/shipping-flow")>("lib/fulfillment/shipping-flow.ts", {
        "node:crypto": crypto, "@/lib/orders/store": orderStore, "@/lib/btcpostage/config": config, "@/lib/btcpostage/service": service,
        "@/lib/btcpostage/store": labelStore, "@/lib/btcpostage/client": client, "@/lib/btcpostage/shipping-guard": guards,
        "@/lib/shipping/policy": shippingPolicy, "@/lib/shipping/request": { isPhysicalUSShippingAddress }, "./store": workflowStore,
        "./shipping-flow-store": flowStore, "./tracking-notification": dispatcher,
      }, { PSL_FULFILLMENT_LABEL_FLOW_ENABLED: "true", PSL_FULFILLMENT_TRACKING_EMAIL_ENABLED: "true" });
    };
    stage = providerTest ? "actual-usps-no-debit-test-label" : "mock-test-label-isolation";
    const testId = await makeOrder("provider_test"), testFlow = createFlow(providerTest, true);
    const preview = (await testFlow.prepareFulfillmentLabel(testId)).preview;
    check(preview.canPurchase && preview.token, "actual DB preview prepared");
    const testResult = await testFlow.purchaseFulfillmentLabel({ orderId: testId, previewToken: preview.token!, confirmPurchase: true });
    check(testResult.testMode && !testResult.trackingSaved, "provider test label never attaches customer tracking");
    check(!(await orderStore.getOrder(testId))?.trackingNumber && !(await flowStore.getTrackingNotification(testId)), "test order/outbox remain unnotified");
    check(realSmtpAttempts === 0 && capturedMails === 0, "test labels cannot reach even the QA mail transport");
    report.uspsTestLabelCreated = providerTest; report.testLabelPurchaseId = testResult.label.btcpOrderId;
    stage = "mock-carrier-real-pg-outbox-and-allowlisted-mail";
    const emailId = await makeOrder("email_test"), fullFlow = createFlow(false, false);
    captureOnly = false;
    const mailPreview = (await fullFlow.prepareFulfillmentLabel(emailId)).preview;
    check(mailPreview.canPurchase && mailPreview.token, "mock carrier quote bound to real DB preview");
    const mailResult = await fullFlow.purchaseFulfillmentLabel({ orderId: emailId, previewToken: mailPreview.token!, confirmPurchase: true });
    check(mailResult.trackingSaved && (emailHeldByPriorClaim ? mailResult.notification?.status === "needs_review" : mailResult.notification?.status === "sent"), "actual tracking/outbox workflow completed or explicitly held by the prior authorization");
    check(!emailHeldByPriorClaim || report.priorTestEmailStatus === "smtp_accepted", "Prior SMTP claim has an unconfirmed outcome. QA needs review; no new test email was sent.");
    check((await orderStore.getOrder(emailId))?.status === "paid", "label does not mark carrier handoff");
    const before = { realSmtpAttempts, capturedMails, mockCreates };
    await Promise.all([fullFlow.completeFulfillmentTracking(emailId), fullFlow.completeFulfillmentTracking(emailId)]);
    check(realSmtpAttempts === before.realSmtpAttempts && capturedMails === before.capturedMails && mockCreates === before.mockCreates, "real DB completion replay neither repurchases nor emails twice");
    const board = await workflowStore.collectFulfillmentBoard();
    check(board.labeled.some(row => row.orderId === emailId), "saved tracking remains visible for carrier handoff");
    check((await orderStore.getOrdersNeedingTracking()).some(row => row.orderId === emailId), "ledger handoff queue retains the paid labeled order");
    const order = (await orderStore.getOrder(emailId))!;
    await flowStore.saveTrackingAndQueue({ orderId: emailId, trackingNumber: order.trackingNumber!, carrier: "USPS", recipientEmail: QA_RECIPIENT,
      recipientHash: flowStore.privateDigest(QA_RECIPIENT), markShipped: true });
    await dispatcher.dispatchTrackingNotification(emailId, true);
    check((await orderStore.getOrder(emailId))?.status === "shipped", "actual private ledger handoff update works");
    check(realSmtpAttempts === before.realSmtpAttempts && capturedMails === before.capturedMails, "handoff does not duplicate tracking notification");
    const stock = await sql`SELECT stock FROM products WHERE handle=${product.handle}`;
    check(stock[0].stock === 18, "only two fake orders decrement isolated stock exactly once");
    report.passed = true; report.testOrderIds = [testId, emailId];
  } catch (error) {
    report.passed = false; report.failedStage = stage; report.errorCode = operatorErrorCode(error);
    report.failure = error instanceof assert.AssertionError ? error.message : "Guarded QA could not complete. Provider/SMTP/database details are not printed.";
    if (realSmtpAttempts > 0 && report.testEmailDelivery !== "SMTP accepted; inbox arrival not yet verified") report.testEmailDelivery = "unconfirmed; check Sent mail before another attempt";
    process.exitCode = 1;
  } finally {
    __setSqlClientForTests(null); globalThis.fetch = originalFetch;
    await isolated.end();
    if (schemaCreated && !oid) {
      report.passed = false; report.cleanupVerified = false; report.cleanupNeedsReview = true; process.exitCode = 1;
    }
    if (oid) {
      stage = "guarded-owned-schema-cleanup";
      try {
        const nowIdentity = (await control.query<Identity>(IDENTITY_SQL)).rows[0];
        assert(JSON.stringify(identity) === JSON.stringify(nowIdentity), "Control database identity changed.");
        const current = (await control.query("SELECT oid::text,pg_get_userbyid(nspowner)=current_user AS owned FROM pg_namespace WHERE nspname=$1", [schema])).rows[0];
        assertQaSchemaIdentity({ schema, oid: current?.oid, expectedOid: oid, owned: current?.owned });
        await control.query(`DROP SCHEMA "${schema}" CASCADE`);
        report.cleanupVerified = (await control.query("SELECT to_regnamespace($1) IS NULL AS absent", [schema])).rows[0].absent === true;
      } catch { report.passed = false; report.cleanupVerified = false; report.cleanupNeedsReview = true; process.exitCode = 1; }
    }
    await control.end();
    for (const name of Object.keys(process.env)) if (!(name in originalEnv)) delete process.env[name];
    Object.assign(process.env, originalEnv);
    report.finishedAt = new Date().toISOString(); persist();
    console.log(JSON.stringify({ ...report, checks, realSmtpAttempts, carrierCreates, mockCreates, capturedMails }, null, 2));
  }
}
void main().catch(() => { console.error("Guarded fulfillment QA stopped before execution or during cleanup; no private connection details printed."); process.exitCode = 1; });
