export const N8N_MAX_BODY_BYTES = 2048;
export const N8N_WORKFLOW_ID = "psl-mission-control-connection-test";

export const N8N_FAILURE_REASONS = [
  "registration_response_invalid",
  "status_request_failed",
  "unexpected_response",
  "workflow_error",
] as const;

export type N8nFailureReason = (typeof N8N_FAILURE_REASONS)[number];

/** Upper bound on systems a status summary can list; the registry is far smaller. */
export const N8N_MAX_SYSTEMS = 50;

const RUN_ID_RE =
  /^n8n_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,99}$/;
const EXECUTION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export type N8nRegisterRequest = {
  requestId: string;
  workflow: typeof N8N_WORKFLOW_ID;
  n8nExecutionId: string | null;
};

export type N8nLifecycleReport =
  | { phase: "started" }
  | { phase: "completed"; systemsReceived: number }
  | { phase: "failed"; reason: N8nFailureReason };

export type Parsed<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

function fail(status: number, error: string): { ok: false; status: number; error: string } {
  return { ok: false, status, error };
}

export function isValidRunId(value: string): boolean {
  return RUN_ID_RE.test(value);
}

/** Reads at most N8N_MAX_BODY_BYTES; never buffers an oversized body. */
async function readBoundedText(request: Request): Promise<Parsed<string>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > N8N_MAX_BODY_BYTES) {
    return fail(413, `Body exceeds ${N8N_MAX_BODY_BYTES} bytes.`);
  }
  if (!request.body) return { ok: true, value: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > N8N_MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return fail(413, `Body exceeds ${N8N_MAX_BODY_BYTES} bytes.`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(merged) };
  } catch {
    return fail(400, "Body is not valid UTF-8.");
  }
}

/**
 * JSON object body. `allowEmpty` lets bodiless POSTs through as `{}` (status
 * requests carry no parameters).
 */
export async function readJsonObject(
  request: Request,
  options: { allowEmpty?: boolean } = {}
): Promise<Parsed<Record<string, unknown>>> {
  const text = await readBoundedText(request);
  if (!text.ok) return text;
  if (text.value.trim() === "") {
    return options.allowEmpty ? { ok: true, value: {} } : fail(400, "JSON body required.");
  }
  const type = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.startsWith("application/json")) {
    return fail(415, "Content-Type must be application/json.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.value);
  } catch {
    return fail(400, "Body is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail(400, "Body must be a JSON object.");
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

function unexpectedKeys(body: Record<string, unknown>, allowed: string[]): string | null {
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  return extra.length > 0 ? `Unexpected field(s): ${extra.slice(0, 5).join(", ")}.` : null;
}

export function parseRegisterBody(body: Record<string, unknown>): Parsed<N8nRegisterRequest> {
  const extra = unexpectedKeys(body, ["requestId", "workflow", "n8nExecutionId"]);
  if (extra) return fail(400, extra);
  if (body.workflow !== N8N_WORKFLOW_ID) {
    return fail(400, `workflow must be "${N8N_WORKFLOW_ID}".`);
  }
  if (typeof body.requestId !== "string" || !REQUEST_ID_RE.test(body.requestId)) {
    return fail(400, "requestId must be 8-100 characters of [A-Za-z0-9_.:-].");
  }
  let n8nExecutionId: string | null = null;
  if (body.n8nExecutionId !== undefined && body.n8nExecutionId !== null) {
    if (typeof body.n8nExecutionId !== "string" || !EXECUTION_ID_RE.test(body.n8nExecutionId)) {
      return fail(400, "n8nExecutionId must be 1-64 characters of [A-Za-z0-9_-].");
    }
    n8nExecutionId = body.n8nExecutionId;
  }
  return {
    ok: true,
    value: { requestId: body.requestId, workflow: N8N_WORKFLOW_ID, n8nExecutionId },
  };
}

export function parseStatusBody(body: Record<string, unknown>): Parsed<Record<string, never>> {
  const extra = unexpectedKeys(body, []);
  return extra ? fail(400, extra) : { ok: true, value: {} };
}

export function parseLifecycleBody(body: Record<string, unknown>): Parsed<N8nLifecycleReport> {
  switch (body.phase) {
    case "started": {
      const extra = unexpectedKeys(body, ["phase"]);
      return extra ? fail(400, extra) : { ok: true, value: { phase: "started" } };
    }
    case "completed": {
      const extra = unexpectedKeys(body, ["phase", "systemsReceived"]);
      if (extra) return fail(400, extra);
      const n = body.systemsReceived;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > N8N_MAX_SYSTEMS) {
        return fail(400, `systemsReceived must be an integer from 1 to ${N8N_MAX_SYSTEMS}.`);
      }
      return { ok: true, value: { phase: "completed", systemsReceived: n } };
    }
    case "failed": {
      const extra = unexpectedKeys(body, ["phase", "reason"]);
      if (extra) return fail(400, extra);
      if (!(N8N_FAILURE_REASONS as readonly unknown[]).includes(body.reason)) {
        return fail(400, `reason must be one of: ${N8N_FAILURE_REASONS.join(", ")}.`);
      }
      return { ok: true, value: { phase: "failed", reason: body.reason as N8nFailureReason } };
    }
    default:
      return fail(400, 'phase must be "started", "completed", or "failed".');
  }
}
