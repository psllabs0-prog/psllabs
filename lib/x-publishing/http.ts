import { NextResponse } from "next/server";

export type Parsed<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export function fail(status: number, error: string): { ok: false; status: number; error: string } {
  return { ok: false, status, error };
}

export function json(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Reads at most `maxBytes`; never buffers an oversized body. Requires a JSON object. */
export async function readJsonObject(
  request: Request,
  maxBytes: number
): Promise<Parsed<Record<string, unknown>>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return fail(413, `Body exceeds ${maxBytes} bytes.`);
  const type = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.startsWith("application/json")) return fail(415, "Content-Type must be application/json.");
  if (!request.body) return fail(400, "JSON body required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return fail(413, `Body exceeds ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(merged);
  } catch {
    return fail(400, "Body is not valid UTF-8.");
  }
  if (text.trim() === "") return fail(400, "JSON body required.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail(400, "Body is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail(400, "Body must be a JSON object.");
  return { ok: true, value: parsed as Record<string, unknown> };
}

export function unexpectedKeys(body: Record<string, unknown>, allowed: readonly string[]): string | null {
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  return extra.length > 0 ? `Unexpected field(s): ${extra.slice(0, 5).join(", ")}.` : null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
