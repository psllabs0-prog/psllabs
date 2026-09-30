import { X_ACCOUNT_HANDLE, X_ACCOUNT_ID, X_AUTOPILOT_ACTOR, X_LIMITS, X_TIME_ZONE } from "../constants";
import { canonicalJson, sha256Hex } from "../hash";
import { addMinutes, parsePhoenixLocal, phoenixDay } from "../time";

export { X_AUTOPILOT_ACTOR };

/**
 * The standing policy the owner authorizes once. Changing any field changes
 * the policy hash, which invalidates the existing authorization until the
 * owner reviews and authorizes the new version.
 */
export const X_AUTOPILOT_POLICY = {
  id: "psl-x-documentation-autopilot",
  version: "1",
  accountId: X_ACCOUNT_ID,
  accountHandle: X_ACCOUNT_HANDLE,
  timeZone: X_TIME_ZONE,
  windows: ["09:00", "17:00"],
  dailyCreateDispatchCap: X_LIMITS.createDispatchesPerPhoenixDay,
  capacityShared: "manual approvals and automatic authorizations share one daily cap",
  postsPerWorkflowRun: X_LIMITS.postsPerWorkflowRun,
  publicationWindowMinutes: X_LIMITS.expiryMinutesAfterScheduled,
  content: "complete post wording from the reviewed documentation library only; no model text",
  selection: "deterministic: first eligible template in library order",
  catchUp: "none: a slot is considered only inside its own publication window",
  skipWhileUnresolved: "no automatic authorization while any item needs owner review",
  retry: "none: an issued permit is consumed whatever its outcome",
  reuse: "a template is never reused once it has been dispatched or is in flight",
  nearDuplicateThreshold: 0.6,
} as const;

type Json = Parameters<typeof canonicalJson>[0];

export const X_AUTOPILOT_POLICY_HASH = sha256Hex(canonicalJson({ v: 1, policy: X_AUTOPILOT_POLICY as unknown as Json }));

export const X_AUTOPILOT_POLICY_VERSION = `${X_AUTOPILOT_POLICY.id}@${X_AUTOPILOT_POLICY.version}#${X_AUTOPILOT_POLICY_HASH.slice(0, 12)}`;

export type XAutopilotSlot = {
  /** Deterministic: repeated scheduler checks of the same slot use the same key. */
  key: string;
  day: string;
  window: string;
  slotAt: Date;
  closesAt: Date;
};

export function autopilotSlotKey(day: string, window: string): string {
  return `${X_AUTOPILOT_POLICY.id}:${day}T${window}`;
}

function slotFor(day: string, window: string): XAutopilotSlot | null {
  const slotAt = parsePhoenixLocal(`${day}T${window}`);
  if (!slotAt) return null;
  return { key: autopilotSlotKey(day, window), day, window, slotAt, closesAt: addMinutes(slotAt, X_AUTOPILOT_POLICY.publicationWindowMinutes) };
}

/** The slot whose publication window contains `now`, or null. Missed slots are never revisited. */
export function currentAutopilotSlot(now: Date): XAutopilotSlot | null {
  const day = phoenixDay(now);
  for (const w of X_AUTOPILOT_POLICY.windows) {
    const s = slotFor(day, w);
    if (s && s.slotAt.getTime() <= now.getTime() && now.getTime() < s.closesAt.getTime()) return s;
  }
  return null;
}

/** The current (open) slot, if any, followed by the next slots in time order. */
export function upcomingAutopilotSlots(now: Date, count: number): XAutopilotSlot[] {
  const out: XAutopilotSlot[] = [];
  const start = phoenixDay(now);
  const [y, m, d] = start.split("-").map(Number);
  for (let i = 0; out.length < count && i < 30; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    for (const w of X_AUTOPILOT_POLICY.windows) {
      const s = slotFor(day, w);
      if (s && s.closesAt.getTime() > now.getTime() && out.length < count) out.push(s);
    }
  }
  return out;
}
