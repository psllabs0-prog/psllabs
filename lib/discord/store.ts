import { createHmac } from "node:crypto";

import { getSql } from "@/lib/db/sql";
import { getDiscordConfig } from "./config";

let schemaReady: Promise<void> | null = null;

export async function ensureDiscordSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS discord_interactions (
          id BIGSERIAL PRIMARY KEY,
          discord_interaction_id TEXT NOT NULL UNIQUE,
          command TEXT NOT NULL DEFAULT '',
          category TEXT,
          risk_level TEXT,
          outcome TEXT,
          response_source TEXT,
          reporting_excluded BOOLEAN NOT NULL DEFAULT false,
          user_hash TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS discord_interactions_created_idx
        ON discord_interactions (created_at DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS discord_rate_limits (
          user_hash TEXT NOT NULL,
          window_start TIMESTAMPTZ NOT NULL,
          hit_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_hash, window_start)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS discord_command_registrations (
          id BIGSERIAL PRIMARY KEY,
          scope TEXT NOT NULL,
          registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          command_count INTEGER NOT NULL DEFAULT 0,
          ok BOOLEAN NOT NULL DEFAULT false,
          error_summary TEXT
        )
      `;
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  await schemaReady;
}

export function hashDiscordUserId(userId: string): string | null {
  const secret = process.env.DISCORD_ANALYTICS_HASH_SECRET?.trim();
  if (!secret || !userId) return null;
  return createHmac("sha256", secret).update(userId).digest("hex");
}

export async function recordDiscordInteraction(input: {
  discordInteractionId: string;
  command: string;
  category: string | null;
  riskLevel: string | null;
  outcome: string;
  responseSource: string;
  reportingExcluded: boolean;
  userHash: string | null;
}): Promise<{ inserted: boolean; id: number | null }> {
  await ensureDiscordSchema();
  const sql = getSql();
  try {
    const rows = (await sql`
      INSERT INTO discord_interactions (
        discord_interaction_id, command, category, risk_level,
        outcome, response_source, reporting_excluded, user_hash
      ) VALUES (
        ${input.discordInteractionId},
        ${input.command},
        ${input.category},
        ${input.riskLevel},
        ${input.outcome},
        ${input.responseSource},
        ${input.reportingExcluded},
        ${input.userHash}
      )
      ON CONFLICT (discord_interaction_id) DO NOTHING
      RETURNING id
    `) as Array<{ id: number }>;
    if (rows[0]) return { inserted: true, id: Number(rows[0].id) };
    return { inserted: false, id: null };
  } catch {
    return { inserted: false, id: null };
  }
}

export async function setDiscordInteractionReportingExcluded(input: {
  id: number;
  excluded: boolean;
}): Promise<void> {
  await ensureDiscordSchema();
  const sql = getSql();
  await sql`
    UPDATE discord_interactions
    SET reporting_excluded = ${input.excluded}
    WHERE id = ${input.id}
  `;
}

/** Durable per-minute rate limit using hashed user id. */
export async function checkDiscordRateLimit(userHash: string | null): Promise<{
  allowed: boolean;
  count: number;
}> {
  if (!userHash) return { allowed: true, count: 0 };
  await ensureDiscordSchema();
  const sql = getSql();
  const limit = getDiscordConfig().rateLimitPerMinute;
  const windowStart = new Date();
  windowStart.setUTCSeconds(0, 0);

  const rows = (await sql`
    INSERT INTO discord_rate_limits (user_hash, window_start, hit_count)
    VALUES (${userHash}, ${windowStart.toISOString()}::timestamptz, 1)
    ON CONFLICT (user_hash, window_start) DO UPDATE SET
      hit_count = discord_rate_limits.hit_count + 1
    RETURNING hit_count
  `) as Array<{ hit_count: number }>;

  const count = Number(rows[0]?.hit_count ?? 1);
  return { allowed: count <= limit, count };
}

export async function getDiscordAnalyticsSummary(): Promise<{
  interactionCount: number;
  restrictedCount: number;
  rateLimitedCount: number;
  lastInteractionAt: string | null;
  lastRegistration: {
    at: string;
    scope: string;
    ok: boolean;
    commandCount: number;
  } | null;
}> {
  await ensureDiscordSchema();
  const sql = getSql();
  const counts = (await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE risk_level = 'restricted')::int AS restricted,
      COUNT(*) FILTER (WHERE outcome = 'rate_limited')::int AS rate_limited,
      MAX(created_at) AS last_at
    FROM discord_interactions
  `) as Array<{
    total: number;
    restricted: number;
    rate_limited: number;
    last_at: string | Date | null;
  }>;
  const reg = (await sql`
    SELECT registered_at, scope, ok, command_count
    FROM discord_command_registrations
    ORDER BY registered_at DESC
    LIMIT 1
  `) as Array<{
    registered_at: string | Date;
    scope: string;
    ok: boolean;
    command_count: number;
  }>;

  const c = counts[0];
  return {
    interactionCount: Number(c?.total ?? 0),
    restrictedCount: Number(c?.restricted ?? 0),
    rateLimitedCount: Number(c?.rate_limited ?? 0),
    lastInteractionAt: c?.last_at
      ? c.last_at instanceof Date
        ? c.last_at.toISOString()
        : String(c.last_at)
      : null,
    lastRegistration: reg[0]
      ? {
          at:
            reg[0].registered_at instanceof Date
              ? reg[0].registered_at.toISOString()
              : String(reg[0].registered_at),
          scope: reg[0].scope,
          ok: reg[0].ok,
          commandCount: Number(reg[0].command_count),
        }
      : null,
  };
}

export async function recordCommandRegistration(input: {
  scope: string;
  ok: boolean;
  commandCount: number;
  errorSummary?: string;
}): Promise<void> {
  await ensureDiscordSchema();
  const sql = getSql();
  await sql`
    INSERT INTO discord_command_registrations (
      scope, ok, command_count, error_summary
    ) VALUES (
      ${input.scope},
      ${input.ok},
      ${input.commandCount},
      ${input.errorSummary ?? null}
    )
  `;
}
