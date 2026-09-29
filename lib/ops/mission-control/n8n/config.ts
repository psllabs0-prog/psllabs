import crypto from "node:crypto";

import { getMissionControlWriteMode } from "../config";

type Env = Record<string, string | undefined>;

export const N8N_TOKEN_MIN_LENGTH = 32;

export type N8nIntegrationMode = {
  enabled: boolean;
  reason: string;
};

function isTrue(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "true" || v === "1";
}

const OTHER_SECRET_NAME_RE = /SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE|DATABASE_URL|POSTGRES/i;

/** The n8n credential must not double as an admin, cron, database, or payment secret. */
function reusesAnotherSecret(token: string, env: Env): boolean {
  return Object.entries(env).some(([name, value]) => {
    if (name === "MISSION_CONTROL_N8N_TOKEN" || !OTHER_SECRET_NAME_RE.test(name)) return false;
    const v = value?.trim();
    return Boolean(v) && (v === token || v!.includes(token));
  });
}

/**
 * Server-side gate for the n8n bridge. Fails closed: disabled unless the
 * integration is explicitly enabled, has its own sufficiently long credential,
 * and Mission Control writes are enabled. Previews need a further n8n-specific
 * opt-in on top of MISSION_CONTROL_SYNC_ALLOW_PREVIEW.
 */
export function getN8nIntegrationMode(env: Env = process.env): N8nIntegrationMode {
  if (!isTrue(env.MISSION_CONTROL_N8N_ENABLED)) {
    return { enabled: false, reason: "MISSION_CONTROL_N8N_ENABLED is not true" };
  }
  const token = env.MISSION_CONTROL_N8N_TOKEN?.trim() ?? "";
  if (token.length < N8N_TOKEN_MIN_LENGTH) {
    return {
      enabled: false,
      reason: `MISSION_CONTROL_N8N_TOKEN is missing or shorter than ${N8N_TOKEN_MIN_LENGTH} characters`,
    };
  }
  if (reusesAnotherSecret(token, env)) {
    return {
      enabled: false,
      reason: "MISSION_CONTROL_N8N_TOKEN reuses another configured secret",
    };
  }
  if (env.VERCEL_ENV === "preview" && !isTrue(env.MISSION_CONTROL_N8N_ALLOW_PREVIEW)) {
    return {
      enabled: false,
      reason: "Preview deployment — MISSION_CONTROL_N8N_ALLOW_PREVIEW is not true",
    };
  }
  const writes = getMissionControlWriteMode(env);
  if (!writes.enabled) {
    return { enabled: false, reason: `Mission Control writes disabled: ${writes.reason}` };
  }
  return { enabled: true, reason: "n8n connection tests enabled" };
}

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

/** Accepts only `Authorization: Bearer <token>`; constant-time comparison. */
export function verifyN8nAuthorization(
  header: string | null,
  env: Env = process.env
): boolean {
  const token = env.MISSION_CONTROL_N8N_TOKEN?.trim() ?? "";
  if (token.length < N8N_TOKEN_MIN_LENGTH || !header) return false;
  const match = /^Bearer ([^\s]+)$/.exec(header.trim());
  if (!match) return false;
  return crypto.timingSafeEqual(digest(match[1]), digest(token));
}

/**
 * Per-instance sliding-window limiter. A first line of defence before any
 * database work; registration also has a database-backed limit.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  let hits: number[] = [];
  return {
    take(now: number): { ok: true } | { ok: false; retryAfterSeconds: number } {
      hits = hits.filter((t) => now - t < windowMs);
      if (hits.length >= limit) {
        return {
          ok: false,
          retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)),
        };
      }
      hits.push(now);
      return { ok: true };
    },
    reset() {
      hits = [];
    },
  };
}
