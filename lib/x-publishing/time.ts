import { X_LIMITS, X_TIME_ZONE } from "./constants";

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function zonedParts(date: Date): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: X_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const out: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}

/** Phoenix calendar day (YYYY-MM-DD) containing `date`. */
export function phoenixDay(date: Date): string {
  const p = zonedParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** `YYYY-MM-DDTHH:mm` in Phoenix time, for form inputs. */
export function toPhoenixLocalInput(date: Date): string {
  const p = zonedParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatPhoenix(date: Date): string {
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: X_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)} (Phoenix)`;
}

/**
 * Parses a Phoenix wall-clock time to UTC. Returns null for malformed or
 * non-existent local times (the round trip must reproduce the input).
 */
export function parsePhoenixLocal(value: string): Date | null {
  const m = LOCAL_RE.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = zonedParts(new Date(guess));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const result = new Date(guess - (asUtc - guess));
  return toPhoenixLocalInput(result) === value ? result : null;
}

export function isSlotAligned(date: Date): boolean {
  const p = zonedParts(date);
  return p.second === 0 && date.getUTCMilliseconds() === 0 && p.minute % X_LIMITS.slotMinutes === 0;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
