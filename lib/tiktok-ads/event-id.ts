import { createHash } from "node:crypto";

/** Stable internal action key; never send the order ID or customer identity itself. */
export function tikTokEventId(name: string, actionKey: string): string {
  return createHash("sha256").update(`psl-tiktok:${name}:${actionKey}`).digest("hex");
}
