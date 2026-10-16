import assert from "node:assert/strict";
import { Pool, type PoolClient } from "pg";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { isDesignPreview } from "@/lib/design-preview";
import { getSql, withManualFulfillmentTestSql } from "@/lib/db/sql";
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

let control: Pool | null = null, isolated: Pool | null = null;
let scopedSql: NeonQueryFunction<false, false> | null = null;
export function getManualTestControl() {
  if (isDesignPreview()) throw new Error("Design previews cannot access the manual test database.");
  if (!control) {
    const value = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!value) throw new Error("Manual test database is not configured.");
    const url = new URL(value);
    assert(["postgres:", "postgresql:"].includes(url.protocol) && /^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.neon\.tech$/i.test(url.hostname) && ["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") || ""), "Manual tests require the configured TLS database endpoint.");
    // Session-scoped search_path requires the same direct Neon endpoint.
    url.hostname = url.hostname.replace(/^(ep-[a-z0-9-]+)-pooler(?=\.)/i, "$1");
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
function manualSql() {
  getManualTestControl();
  if (!scopedSql) scopedSql = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const client = await isolated!.connect();
    try { return await queryInSchema(client, parts, values); }
    finally { client.release(); }
  }) as NeonQueryFunction<false, false>;
  return scopedSql;
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
export async function inManualTestScope<T>(action: () => Promise<T>, mail?: (order: Order, messageId: string) => Promise<void>): Promise<T> {
  assert(await manualFixtureExists(), "Create the fixed manual test order first.");
  return withManualFulfillmentTestSql(manualSql(), action, { allowTestEmail: Boolean(mail), sendTrackingEmail: mail });
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
