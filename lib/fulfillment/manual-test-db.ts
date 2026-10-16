import assert from "node:assert/strict";
import { Pool, type PoolClient } from "pg";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { isDesignPreview } from "@/lib/design-preview";
import { getManualFulfillmentTestScope, getSql, withManualFulfillmentTestSql } from "@/lib/db/sql";
import { getBtcpostageFromAddress } from "@/lib/btcpostage/config";
import { ensureBtcpostageSchema } from "@/lib/btcpostage/schema";
import { ensureInventorySchema, checkoutWithStockCheck, settlePaidOrder } from "@/lib/inventory/store";
import { ensureFinanceSchema } from "@/lib/finance/schema";
import { ensureFulfillmentSchema } from "./schema";
import { upsertFulfillmentWorkflow } from "./store";
import { ensureShippingFlowSchema, privateDigest } from "./shipping-flow-store";
import { getOrder } from "@/lib/orders/store";
import { getActiveCatalogProducts } from "@/lib/products/catalog";
import { standardShippingSelection } from "@/lib/shipping/policy";
import type { Order } from "@/lib/orders/types";
import { MANUAL_TEST_ORDER, MANUAL_TEST_RECIPIENT, MANUAL_TEST_SCHEMA } from "./manual-test-constants";
import { manualFixtureFailure, type ManualFixtureStage } from "./manual-test-diagnostics";
import { parseManualTestAddress } from "./manual-test-address";
import type { ManualFulfillmentTestAddress } from "./manual-test-types";
import { QA_MAIL_AUTHORIZATION } from "./test-mail-authorization";

let control: Pool | null = null, isolated: Pool | null = null;
const clientSqls = new WeakMap<PoolClient, NeonQueryFunction<false, false>>();
export function getManualTestControl() {
  if (isDesignPreview()) throw new Error("Design previews cannot access the manual test database.");
  if (!control) {
    const value = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!value) throw new Error("Manual test database is not configured.");
    const url = new URL(value);
    assert(["postgres:", "postgresql:"].includes(url.protocol) && /^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.neon\.tech$/i.test(url.hostname) && ["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") || ""), "Manual tests require the configured TLS database endpoint.");
    // Session-scoped search_path requires the same direct Neon endpoint.
    url.hostname = url.hostname.replace(/^(ep-[a-z0-9-]+)-pooler(?=\.)/i, "$1");
    url.searchParams.set("sslmode", "verify-full");
    const options = { connectionString: url.toString(), max: 2, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000 };
    control = new Pool({ ...options, options: "-c search_path=pg_catalog" });
    isolated = new Pool({ ...options, options: `-c search_path=${MANUAL_TEST_SCHEMA}` });
  }
  return control;
}
async function assertOwnedSchema(): Promise<boolean> {
  const row = (await getManualTestControl().query("SELECT pg_get_userbyid(nspowner)=current_user AS owned FROM pg_catalog.pg_namespace WHERE nspname=$1", [MANUAL_TEST_SCHEMA])).rows[0];
  if (!row) return false;
  assert(row.owned === true, "Manual test schema must belong to the current application role.");
  return true;
}
function manualSql(client: PoolClient) {
  let sql = clientSqls.get(client);
  if (!sql) {
    sql = ((parts: TemplateStringsArray, ...values: unknown[]) => queryInSchema(client, parts, values)) as NeonQueryFunction<false, false>;
    clientSqls.set(client, sql);
  }
  return sql;
}
async function queryInSchema(client: PoolClient, parts: TemplateStringsArray, values: unknown[]) {
  const query = parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, "");
  assert(!/\bpublic\b|\b(?:SET|RESET)\s+(?:(?:LOCAL|SESSION)\s+)?(?:search_path|ROLE|SESSION\s+AUTHORIZATION)|\b(?:ALTER|DROP|CREATE)\s+(?:DATABASE|ROLE|USER|SCHEMA)\b|\b(?:GRANT|REVOKE)\b|\bset_config\s*\(/i.test(query), "Manual fixture SQL cannot access public data or change its scope.");
  // pg leaves name[] as a raw string; cast to its supported text[] decoder.
  const scope = (await client.query("SELECT current_schema() AS schema,current_schemas(false)::text[] AS scopes")).rows[0];
  assert(scope.schema === MANUAL_TEST_SCHEMA && JSON.stringify(scope.scopes) === JSON.stringify([MANUAL_TEST_SCHEMA]), "Manual fixture SQL scope differs from its fixed private schema.");
  return (await client.query(query, values)).rows;
}
export function manualTestSenderFingerprint() {
  const from = getBtcpostageFromAddress();
  assert(from.country === "US" && from.zip.slice(0, 5) === "85016", "The manual test requires the existing approved sender.");
  return privateDigest(from);
}
export async function manualFixtureExists(): Promise<boolean> {
  if (!await assertOwnedSchema()) return false;
  const marker = (await getManualTestControl().query("SELECT to_regclass($1) IS NOT NULL AS present", [`${MANUAL_TEST_SCHEMA}.manual_fixture_identity`])).rows[0];
  if (!marker?.present) return false;
  const rows = (await getManualTestControl().query(`SELECT order_id,recipient_hash,sender_fingerprint FROM "${MANUAL_TEST_SCHEMA}".manual_fixture_identity WHERE order_id=$1`, [MANUAL_TEST_ORDER])).rows;
  if (!rows.length) return false;
  assert(rows.length === 1 && rows[0].recipient_hash === privateDigest(MANUAL_TEST_RECIPIENT) && rows[0].sender_fingerprint === manualTestSenderFingerprint(), "Manual test fixture identity or configured sender changed; review before running it.");
  return true;
}
async function savedTestAddress(sql: NeonQueryFunction<false, false>): Promise<ManualFulfillmentTestAddress | undefined> {
  const table = (await sql`SELECT to_regclass(${`${MANUAL_TEST_SCHEMA}.manual_fixture_address`}) IS NOT NULL AS present`)[0];
  if (!table?.present) return undefined;
  const row = (await sql`SELECT address FROM manual_fixture_address WHERE order_id=${MANUAL_TEST_ORDER}`)[0];
  if (!row) return undefined;
  const address = parseManualTestAddress(row.address);
  assert(address, "The saved manual test address needs review.");
  return address;
}
async function withLockedManualScope<T>(action: (client: PoolClient, sql: NeonQueryFunction<false, false>) => Promise<T>, mail?: (order: Order, messageId: string) => Promise<void>): Promise<T> {
  assert(await manualFixtureExists(), "Create the fixed manual test order first.");
  // This is the isolated pool, separate from control/receipt queries. Scoped SQL reuses
  // this checked-out connection, so a second lock waiter cannot starve the first action.
  const client = await isolated!.connect();
  let locked = false, discard = false;
  try {
    await client.query("SELECT pg_catalog.pg_advisory_lock(pg_catalog.hashtext($1))", [MANUAL_TEST_ORDER]);
    locked = true;
    const sql = manualSql(client), testAddress = await savedTestAddress(sql);
    // Autocommit preserves label claims across provider timeouts. Only an address
    // update starts its own transaction; no network work is enclosed by it.
    return await withManualFulfillmentTestSql(sql, () => action(client, sql), { allowTestEmail: Boolean(mail), sendTrackingEmail: mail, testAddress });
  } finally {
    if (locked) {
      try { discard = (await client.query("SELECT pg_catalog.pg_advisory_unlock(pg_catalog.hashtext($1)) AS unlocked", [MANUAL_TEST_ORDER])).rows[0]?.unlocked !== true; }
      catch { discard = true; }
    } else discard = true;
    client.release(discard);
  }
}
export async function inManualTestScope<T>(action: () => Promise<T>, mail?: (order: Order, messageId: string) => Promise<void>): Promise<T> {
  return withLockedManualScope(() => action(), mail);
}
async function testMailAuthorizationUnused(): Promise<boolean> {
  const db = getManualTestControl();
  const table = (await db.query("SELECT to_regclass('psl_fulfillment_qa_receipts.mail_authorizations') IS NOT NULL AS present")).rows[0];
  if (!table?.present) return true;
  return (await db.query('SELECT 1 FROM "psl_fulfillment_qa_receipts".mail_authorizations WHERE authorization_key=$1', [QA_MAIL_AUTHORIZATION])).rows.length === 0;
}
/** The same gate is enforced again while holding the fixed fixture lock before updates. */
export async function manualTestAddressEditable(): Promise<boolean> {
  assert(getManualFulfillmentTestScope(), "Test address availability requires the private fixture scope.");
  const sql = getSql();
  const rows = await sql`SELECT o.order_id FROM orders o LEFT JOIN btcpostage_labels l ON l.psl_order_id=o.order_id
    WHERE o.order_id=${MANUAL_TEST_ORDER} AND o.email=${MANUAL_TEST_RECIPIENT} AND o.status='paid'
      AND (o.tracking_number IS NULL OR trim(o.tracking_number)='') AND o.tracking_saved_at IS NULL
      AND o.shipped_at IS NULL AND o.tracking_email_sent=false
      AND (l.psl_order_id IS NULL OR (l.purchase_status IN ('none','failed') AND l.btcp_order_id IS NULL
        AND l.purchase_claimed_at IS NULL AND l.raw_response IS NULL AND l.tracking_number IS NULL
        AND l.shipment_id IS NULL AND l.label_url IS NULL AND l.purchased_at IS NULL))
      AND NOT EXISTS(SELECT 1 FROM fulfillment_tracking_outbox n WHERE n.order_id=o.order_id)`;
  return rows.length === 1 && await testMailAuthorizationUnused();
}
/** Explicit owner action only. Never buys a label, changes sender settings, or sends mail. */
export async function updateManualTestAddress(raw: unknown): Promise<void> {
  const address = parseManualTestAddress(raw);
  assert(address, "Enter a valid physical U.S. test address.");
  await withLockedManualScope(async (client, sql) => {
    let stage: ManualFixtureStage = "check_unused", transactionStarted = false;
    try {
      await client.query("BEGIN"); transactionStarted = true;
      await sql`SELECT order_id FROM orders WHERE order_id=${MANUAL_TEST_ORDER} FOR UPDATE`;
      await sql`SELECT psl_order_id FROM btcpostage_labels WHERE psl_order_id=${MANUAL_TEST_ORDER} FOR UPDATE`;
      assert(await manualTestAddressEditable(), "The test address is locked after a label or email attempt. Review the existing shipment.");
      const order = await getOrder(MANUAL_TEST_ORDER);
      assert(order?.email === MANUAL_TEST_RECIPIENT, "The fixed manual test order identity needs review.");
      stage = "write_address";
      await sql`CREATE TABLE IF NOT EXISTS manual_fixture_address(order_id TEXT PRIMARY KEY,address JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
      await sql`INSERT INTO manual_fixture_address(order_id,address) VALUES(${MANUAL_TEST_ORDER},${JSON.stringify(address)}::jsonb)
        ON CONFLICT(order_id) DO UPDATE SET address=EXCLUDED.address,updated_at=now()`;
      const shipping = { ...order.shipping, address: [address.address, address.street2].filter(Boolean).join("\n"),
        city: address.city, state: address.state, zip: address.zip, country: "US" };
      const updated = await sql`UPDATE orders SET shipping=${JSON.stringify(shipping)}::jsonb,updated_at=now()
        WHERE order_id=${MANUAL_TEST_ORDER} AND email=${MANUAL_TEST_RECIPIENT} RETURNING order_id`;
      assert(updated.length === 1, "The fixed test address was not saved.");
      stage = "clear_address_cache";
      await sql`UPDATE btcpostage_labels SET verified_street1=NULL,verified_street2=NULL,verified_city=NULL,
        verified_state=NULL,verified_zip=NULL,verified_country=NULL,updated_at=now() WHERE psl_order_id=${MANUAL_TEST_ORDER}`;
      await sql`DELETE FROM fulfillment_label_previews WHERE order_id=${MANUAL_TEST_ORDER}`;
      stage = "commit"; await client.query("COMMIT"); transactionStarted = false;
    } catch (error) {
      let rollbackSucceeded: boolean | null = null;
      if (transactionStarted) {
        try { await client.query("ROLLBACK"); rollbackSucceeded = true; } catch { rollbackSucceeded = false; }
      }
      throw manualFixtureFailure(stage, error, rollbackSucceeded);
    }
  });
}

/** Authenticated explicit action only. No carrier, payment provider, or SMTP calls. */
export async function createManualTestFixture() {
  let stage: ManualFixtureStage = "validate_sender";
  let client: PoolClient | null = null, transactionStarted = false;
  try {
    const fingerprint = manualTestSenderFingerprint();
    stage = "connect_control";
    const db = getManualTestControl();
    stage = "create_schema";
    await db.query(`CREATE SCHEMA IF NOT EXISTS "${MANUAL_TEST_SCHEMA}"`);
    stage = "verify_owner";
    assert(await assertOwnedSchema());
    stage = "connect_fixture";
    client = await isolated!.connect();
    const transactionSql = ((parts: TemplateStringsArray, ...values: unknown[]) => queryInSchema(client!, parts, values)) as NeonQueryFunction<false, false>;
    stage = "begin";
    await client.query("BEGIN");
    transactionStarted = true;
    stage = "lock";
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext($1))", [MANUAL_TEST_ORDER]);
    await withManualFulfillmentTestSql(transactionSql, async () => {
    stage = "inventory_schema"; await ensureInventorySchema();
    stage = "finance_schema"; await ensureFinanceSchema();
    stage = "workflow_schema"; await ensureFulfillmentSchema();
    stage = "label_schema"; await ensureBtcpostageSchema();
    stage = "shipping_schema"; await ensureShippingFlowSchema();
    const sql = getSql();
    stage = "identity_schema";
    await sql`CREATE TABLE IF NOT EXISTS manual_fixture_identity(order_id TEXT PRIMARY KEY,recipient_hash TEXT NOT NULL,sender_fingerprint TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    stage = "existing_fixture";
    const existing = await getOrder(MANUAL_TEST_ORDER);
    if (existing) {
      const marker = (await sql`SELECT recipient_hash,sender_fingerprint FROM manual_fixture_identity WHERE order_id=${MANUAL_TEST_ORDER}`)[0];
      assert(existing.email === MANUAL_TEST_RECIPIENT && marker?.recipient_hash === privateDigest(MANUAL_TEST_RECIPIENT) && marker.sender_fingerprint === fingerprint, "Existing manual fixture identity could not be verified.");
      return;
    }
    stage = "catalog";
    const product = getActiveCatalogProducts().find(item => item.handle === "retatrutide");
    assert(product, "Manual fixture catalog product missing.");
    const from = getBtcpostageFromAddress();
    stage = "seed_product";
    await sql`INSERT INTO products(handle,name,stock,sku) VALUES(${product.handle},${product.name},10,${product.sku}) ON CONFLICT(handle) DO NOTHING`;
    const order = { orderId: MANUAL_TEST_ORDER, currency: "USD", email: MANUAL_TEST_RECIPIENT,
      shipping: { firstName: "TEST", lastName: "ONLY", address: [from.street1, from.street2].filter(Boolean).join(", "), city: from.city, state: from.state, zip: from.zip, country: "US", selection: standardShippingSelection() },
      items: [{ handle: product.handle, name: product.name, strength: product.strength, quantity: 1, unitPrice: product.price, lineTotal: product.price }],
      subtotal: product.price, discountCode: null, discountAmount: 0, taxRate: 0, tax: 0, shippingCost: 9.99, total: Math.round((product.price + 9.99) * 100) / 100, attribution: null } as Order;
    stage = "checkout";
    assert((await checkoutWithStockCheck(order)).ok, "Manual fixture order creation failed.");
    stage = "settlement";
    const paid = await settlePaidOrder(MANUAL_TEST_ORDER, null);
    assert(paid.ok && !paid.stockDecrementFailed, "Manual fixture synthetic settlement failed.");
    stage = "workflow";
    await upsertFulfillmentWorkflow({ orderId: MANUAL_TEST_ORDER, workflowStatus: "packed", packedAt: new Date().toISOString() });
    stage = "identity_marker";
    await sql`INSERT INTO manual_fixture_identity(order_id,recipient_hash,sender_fingerprint) VALUES(${MANUAL_TEST_ORDER},${privateDigest(MANUAL_TEST_RECIPIENT)},${fingerprint})`;
    });
    stage = "commit";
    await client.query("COMMIT");
    transactionStarted = false;
  } catch (error) {
    let rollbackSucceeded: boolean | null = null;
    if (client && transactionStarted) {
      try { await client.query("ROLLBACK"); rollbackSucceeded = true; }
      catch { rollbackSucceeded = false; }
    }
    throw manualFixtureFailure(stage, error, rollbackSucceeded);
  } finally { client?.release(); }
}
