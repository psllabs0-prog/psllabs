/** Offline guard validation only. No database, carrier or SMTP connections. */
import assert from "node:assert/strict";
import { assertQaBuildEnvironment, assertQaMailTarget, assertQaProviderRequest, assertQaSchemaIdentity, assertQaSql, PSL_VERCEL_PROJECT, QA_BUILD_FLAG, QA_RECIPIENT } from "./fulfillment-shipping-qa-guards";
import { buildCreatePurchaseFieldsForTest } from "../lib/btcpostage/client";
import { createQaMailAuthorization, QA_MAIL_AUTHORIZATION, QA_MAIL_MESSAGE_ID, QA_MAIL_RECIPIENT_HASH, type QaMailReceiptStatus } from "./fulfillment-shipping-qa-receipt";

let checks = 0;
const pass = (fn: () => unknown) => { fn(); checks++; };
const deny = (fn: () => unknown) => { assert.throws(fn); checks++; };
const schema = "psl_fulfillment_qa_20261016_0123456789abcdef";
pass(() => assertQaSql("UPDATE orders SET status=$1 WHERE order_id=$2"));
for (const query of ["UPDATE public.orders SET status='paid'", 'UPDATE "public"."orders" SET status=$1', "SET search_path TO public", "SET LOCAL search_path TO public", "RESET search_path", "SET ROLE other", "GRANT ALL ON orders TO public", "DROP DATABASE test", "ALTER ROLE owner SUPERUSER", "CREATE SCHEMA unexpected", "SELECT set_config('search_path','public',false)"])
  deny(() => assertQaSql(query));
pass(() => assertQaSchemaIdentity({ schema, oid: "1234", expectedOid: "1234", owned: true }));
for (const change of [{ schema: "public" }, { oid: "1235" }, { expectedOid: "9999" }, { owned: false }])
  deny(() => assertQaSchemaIdentity({ schema, oid: "1234", expectedOid: "1234", owned: true, ...change }));
pass(() => assertQaMailTarget(QA_RECIPIENT, `${schema}_email_test`, schema));
for (const [email, orderId] of [["someone@example.invalid", `${schema}_email_test`], [QA_RECIPIENT, "psl_liveorder"], [`${QA_RECIPIENT},other@example.invalid`, `${schema}_email_test`]])
  deny(() => assertQaMailTarget(email, orderId, schema));
const from = { name: "PSL Fixture", street1: "1 QA Fixture Street", city: "Phoenix", state: "AZ", zip: "85016", country: "US" };
const body = { from_street: from.street1, to_street: from.street1, from_zip: from.zip, to_zip: from.zip,
  to_city: from.city, to_state: from.state, to_country: "US", carrier: "USPS", service: "GroundAdvantage", test_mode: "true", order_notes: `PSL ${schema}_provider_test` };
const post = (values: Record<string, string>) => ({ method: "POST", redirect: "error" as const, body: new URLSearchParams(values).toString() });
pass(() => assertQaProviderRequest("https://btcpostage.com/api/create-purchase", post(body), from, schema));
deny(() => assertQaProviderRequest("https://btcpostage.com/api/create-purchase", { ...post(body), redirect: "follow" }, from, schema));
for (const change of [{ test_mode: "false" }, { test_mode: "" }, { carrier: "UPS" }, { to_street: "Unrelated Address" }, { to_zip: "10007" }, { order_notes: "PSL live-order" }])
  deny(() => assertQaProviderRequest("https://btcpostage.com/api/create-purchase", post({ ...body, ...change }), from, schema));
for (const url of ["https://btcpostage.com/api/charge-credits", "https://btcpostage.com/api/register-track", "https://untrusted.invalid/api/create-purchase", "http://btcpostage.com/api/create-purchase"])
  deny(() => assertQaProviderRequest(url, post(body), from, schema));
const standardized = { ...from, street1: "1 QA FIXTURE ST", zip: "85016-1234" };
pass(() => assertQaProviderRequest("https://btcpostage.com/api/get-rates", post({ ...body, to_street: standardized.street1, to_zip: standardized.zip }), from, schema, standardized));
const withSuite = { ...from, street2: "Suite 200" };
const orderDestination = { ...withSuite, street1: `${withSuite.street1}, ${withSuite.street2}`, street2: "" };
pass(() => assertQaProviderRequest("https://btcpostage.com/api/verify-address", post({ street1: orderDestination.street1, city: from.city, state: from.state, zip: from.zip, country: "US" }), withSuite, schema, orderDestination));
assert.equal(buildCreatePurchaseFieldsForTest({ carrier: "USPS", service: "GroundAdvantage", testMode: true }).test_mode, true); checks++;
const env = { PSL_FULFILLMENT_QA: QA_BUILD_FLAG, VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: PSL_VERCEL_PROJECT,
  PSL_FULFILLMENT_QA_EXPECTED_COMMIT: "a".repeat(40), VERCEL_GIT_COMMIT_SHA: "a".repeat(40), PSL_FULFILLMENT_QA_NONCE: "b".repeat(32) };
pass(() => assertQaBuildEnvironment(env));
for (const change of [{ VERCEL: "0" }, { VERCEL_ENV: "preview" }, { VERCEL_PROJECT_ID: "other-project" }, { VERCEL_GIT_COMMIT_SHA: "c".repeat(40) }, { PSL_FULFILLMENT_QA_NONCE: "" }, { PSL_FULFILLMENT_QA: "true" }])
  deny(() => assertQaBuildEnvironment({ ...env, ...change }));

async function receiptChecks() {
  let row: { authorization_key: string; recipient_hash: string; message_id: string; status: QaMailReceiptStatus } | null = null;
  const query = async (text: string, values: unknown[] = []) => {
    if (text.includes("CREATE SCHEMA") || text.includes("CREATE TABLE")) return { rows: [] };
    if (text.includes("FROM pg_catalog.pg_namespace")) return { rows: [{ oid: "1234", owned: true }] };
    if (text.includes("FROM pg_catalog.pg_class")) return { rows: [{ relname: "mail_authorizations", owned: true }, { relname: "mail_authorizations_pkey", owned: true }] };
    if (text.includes("FROM pg_catalog.pg_attribute")) return { rows: ["authorization_key", "claimed_at", "message_id", "recipient_hash", "status", "updated_at"].map(attname => ({ attname })) };
    if (text.includes("INSERT INTO")) {
      assert.equal(values[0], QA_MAIL_AUTHORIZATION); assert.equal(values[1], QA_MAIL_RECIPIENT_HASH); assert.equal(values[2], QA_MAIL_MESSAGE_ID);
      if (row) return { rows: [] };
      row = { authorization_key: String(values[0]), recipient_hash: String(values[1]), message_id: String(values[2]), status: "claimed" };
      return { rows: [{ authorization_key: row.authorization_key }] };
    }
    if (text.startsWith("SELECT recipient_hash")) return { rows: row ? [{ ...row }] : [] };
    if (text.includes("UPDATE") && row?.status === "claimed") row.status = text.includes("'smtp_accepted'") ? "smtp_accepted" : "needs_review";
    return { rows: [] };
  };
  const a = createQaMailAuthorization(query), b = createQaMailAuthorization(query);
  const claims = await Promise.all([a.claim(), b.claim()]);
  assert.equal(claims.filter(Boolean).length, 1); checks++;
  await a.uncertain(); assert.equal(await a.status(), "needs_review"); checks++;
  // Fresh object simulates a new process, schema, nonce or commit against the same durable DB.
  assert.equal(await createQaMailAuthorization(query).claim(), false); checks++;
  assert.equal(await a.status(), "needs_review"); checks++;
  row = null;
  const accepted = createQaMailAuthorization(query); assert.equal(await accepted.claim(), true); checks++;
  await accepted.accepted(); assert.equal(await accepted.status(), "smtp_accepted"); checks++;
  await accepted.uncertain(); assert.equal(await accepted.status(), "smtp_accepted"); checks++;
  assert.equal(await createQaMailAuthorization(query).claim(), false); checks++;
  console.log(`PASS: ${checks} offline fulfillment QA safety/authorization checks. No database, provider or mail accessed.`);
}
void receiptChecks().catch(error => { console.error(error); process.exitCode = 1; });
