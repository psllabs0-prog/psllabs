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
