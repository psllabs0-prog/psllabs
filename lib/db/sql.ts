import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sqlClient: NeonQueryFunction<false, false> | null = null;

export function getSql(): NeonQueryFunction<false, false> {
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
