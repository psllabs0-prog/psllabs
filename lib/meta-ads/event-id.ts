import { createHash } from "node:crypto";
/** Derive once from the verified action key; retries and browser receipts reuse it. */
export function metaEventId(name: string, actionKey: string): string {
  return createHash("sha256").update(`psl-meta:${name}:${actionKey}`).digest("hex");
}
