import { NextResponse } from "next/server";

import { getMissionControlSchemaState } from "../schema";
import { createRateLimiter, getN8nIntegrationMode, verifyN8nAuthorization } from "./config";
import {
  registerN8nRun,
  reportN8nLifecycle,
  serveN8nStatus,
  type N8nResult,
} from "./runs";
import {
  isValidRunId,
  parseLifecycleBody,
  parseRegisterBody,
  parseStatusBody,
  readJsonObject,
} from "./validate";

export type N8nAction =
  | { kind: "register" }
  | { kind: "status"; runId: string }
  | { kind: "events"; runId: string };

export const N8N_REQUESTS_PER_MINUTE = 30;

const limiter = createRateLimiter(N8N_REQUESTS_PER_MINUTE, 60_000);

/** Test-only. */
export function __resetN8nRateLimiterForTests(): void {
  limiter.reset();
}

function json(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

/**
 * Machine-to-machine entry point for the n8n connection test. Order matters:
 * the integration gate and authentication run before any body parsing or
 * database access. Never accepts admin cookies or query-string credentials.
 */
export async function handleN8nRequest(
  request: Request,
  action: N8nAction,
  options: { env?: Record<string, string | undefined>; now?: Date } = {}
): Promise<Response> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();

  if (!getN8nIntegrationMode(env).enabled) {
    return json(503, { error: "n8n integration is not enabled." });
  }
  if (new URL(request.url).search !== "") {
    return json(400, { error: "Query parameters are not accepted; send credentials in the Authorization header." });
  }
  if (env.VERCEL && request.headers.get("x-forwarded-proto") !== "https") {
    return json(400, { error: "HTTPS required." });
  }
  const rate = limiter.take(now.getTime());
  if (!rate.ok) {
    return json(429, { error: "Rate limit exceeded." }, { "Retry-After": String(rate.retryAfterSeconds) });
  }
  if (!verifyN8nAuthorization(request.headers.get("authorization"), env)) {
    return json(401, { error: "Unauthorized." }, { "WWW-Authenticate": "Bearer" });
  }
  if (action.kind !== "register" && !isValidRunId(action.runId)) {
    return json(400, { error: "Invalid runId." });
  }

  try {
    const schema = await getMissionControlSchemaState();
    if (!schema.initialized) {
      return json(503, { error: "Mission Control activity tables are not initialized." });
    }

    const body = await readJsonObject(request, { allowEmpty: action.kind === "status" });
    if (!body.ok) return json(body.status, { error: body.error });

    let result: N8nResult;
    if (action.kind === "register") {
      const parsed = parseRegisterBody(body.value);
      if (!parsed.ok) return json(parsed.status, { error: parsed.error });
      result = await registerN8nRun(parsed.value, now);
    } else if (action.kind === "status") {
      const parsed = parseStatusBody(body.value);
      if (!parsed.ok) return json(parsed.status, { error: parsed.error });
      result = await serveN8nStatus(action.runId, now);
    } else {
      const parsed = parseLifecycleBody(body.value);
      if (!parsed.ok) return json(parsed.status, { error: parsed.error });
      result = await reportN8nLifecycle(action.runId, parsed.value, now);
    }
    return json(result.status, result.body);
  } catch (error) {
    console.error(
      "[mission-control:n8n] request failed:",
      error instanceof Error ? error.message : error
    );
    return json(500, { error: "Internal error." });
  }
}
