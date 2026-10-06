import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";

import { getSql } from "@/lib/db/sql";

let schemaReady: Promise<void> | null = null;

export async function ensureRequestRateLimitSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS request_rate_limits (
          scope TEXT NOT NULL,
          client_key TEXT NOT NULL,
          attempts INTEGER NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (scope, client_key)
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS request_rate_limits_expiry_idx ON request_rate_limits (expires_at)`;
      await sql`DELETE FROM request_rate_limits WHERE expires_at < now() - interval '1 day'`;
    })().catch((error) => { schemaReady = null; throw error; });
  }
  await schemaReady;
}

export function rateLimitClientKey(request: Request): string | null {
  const secret = process.env.REQUEST_RATE_LIMIT_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (!secret) return null;
  // Vercel overwrites these forwarding headers. Never trust arbitrary forwarded
  // headers on a local/custom server. Deployment to another host needs an adapter.
  const address = process.env.VERCEL === "1"
    ? (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for"))?.split(",")[0]?.trim()
    : process.env.NODE_ENV !== "production" ? "127.0.0.1" : null;
  if (!address || !isIP(address)) return null;
  return createHmac("sha256", secret).update(`request-rate-limit:v1:${address}`).digest("hex");
}

export async function consumeRequestLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<NextResponse | null> {
  const clientKey = rateLimitClientKey(request);
  if (!clientKey) {
    return NextResponse.json({ error: "Request protection is unavailable. Please try again later." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
  try {
    await ensureRequestRateLimitSchema();
    const sql = getSql();
    // One atomic upsert serializes concurrent attempts across serverless instances.
    const rows = await sql`
      INSERT INTO request_rate_limits (scope, client_key, attempts, expires_at)
      VALUES (${scope}, ${clientKey}, 1, now() + ${windowSeconds} * interval '1 second')
      ON CONFLICT (scope, client_key) DO UPDATE SET
        attempts = CASE WHEN request_rate_limits.expires_at <= now() THEN 1
          ELSE least(request_rate_limits.attempts + 1, ${limit + 1}) END,
        expires_at = CASE WHEN request_rate_limits.expires_at <= now()
          THEN now() + ${windowSeconds} * interval '1 second'
          ELSE request_rate_limits.expires_at END
      RETURNING attempts, greatest(1, ceil(extract(epoch FROM (expires_at - now())))) AS retry_after
    `;
    const result = rows[0];
    if (!result || !Number.isFinite(Number(result.attempts))) throw new Error("Invalid counter result");
    if (Number(result.attempts) <= limit) return null;
    return NextResponse.json({ error: "Too many requests. Please wait and try again." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(Math.max(1, Math.ceil(Number(result.retry_after) || windowSeconds))) } });
  } catch {
    console.error("[request-protection] Durable counter unavailable; request rejected.");
    return NextResponse.json({ error: "Request protection is temporarily unavailable. Please try again later." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
}
