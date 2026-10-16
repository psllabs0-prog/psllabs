import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { AsyncLocalStorage } from "node:async_hooks";
import { isDesignPreview } from "@/lib/design-preview";
import type { Order } from "@/lib/orders/types";

let sqlClient: NeonQueryFunction<false, false> | null = null;
type Sql = NeonQueryFunction<false, false>;
type ManualTestOptions = { allowTestEmail?: boolean; sendTrackingEmail?: (order: Order, messageId: string) => Promise<void> };
type ManualTestScope = ManualTestOptions & { sql: Sql };
const manualTestScopes = new AsyncLocalStorage<ManualTestScope>();
const schemaCaches = new WeakMap<Sql, Map<string, Promise<void>>>();

/** Server-owned request scope. Never selected by a browser order ID or query string. */
export function withManualFulfillmentTestSql<T>(sql: Sql, action: () => Promise<T>, options: ManualTestOptions = {}): Promise<T> {
  return manualTestScopes.run({ sql, ...options }, action);
}
export function getManualFulfillmentTestScope(): ManualTestOptions | null {
  const scope = manualTestScopes.getStore();
  return scope ? { allowTestEmail: scope.allowTestEmail, sendTrackingEmail: scope.sendTrackingEmail } : null;
}

/** Cache schema initialization by its actual SQL client, never across public/test scopes. */
export function ensureSqlSchema(name: string, initialize: () => Promise<void>): Promise<void> {
  const client = getSql();
  let cache = schemaCaches.get(client);
  if (!cache) { cache = new Map(); schemaCaches.set(client, cache); }
  let ready = cache.get(name);
  if (!ready) {
    ready = Promise.resolve().then(initialize).catch(error => { cache!.delete(name); throw error; });
    cache.set(name, ready);
  }
  return ready;
}

export function getSql(): NeonQueryFunction<false, false> {
  if (isDesignPreview()) throw new Error("Design previews have no access to operational databases.");
  const scoped = manualTestScopes.getStore();
  if (scoped) return scoped.sql;
  if (sqlClient) return sqlClient;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "Database is not configured: set DATABASE_URL (Vercel Postgres / Neon)."
    );
  }
  sqlClient = neon(url);
  return sqlClient;
}

/** Test-only: substitute the client so offline tests can observe every statement. */
export function __setSqlClientForTests(
  client: NeonQueryFunction<false, false> | null
): void {
  sqlClient = client;
}
