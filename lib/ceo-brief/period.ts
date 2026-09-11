import type { CeoLukeAction, CeoBriefSectionKey } from "./types";

export type BriefPeriod = {
  periodStart: Date;
  periodEnd: Date;
  /** Inclusive display label for period_end - 1 day when end is exclusive midnight. */
  labelStart: string;
  labelEnd: string;
};

function utcDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Last completed UTC calendar week (Monday 00:00 → next Monday 00:00 exclusive).
 * Monday morning cron covers the previous Mon–Sun window.
 */
export function getLastCompletedWeekUtc(asOf: Date = new Date()): BriefPeriod {
  const dayStart = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  );
  const day = dayStart.getUTCDay(); // 0=Sun … 6=Sat
  const daysSinceMonday = (day + 6) % 7;
  const thisMonday = new Date(dayStart);
  thisMonday.setUTCDate(dayStart.getUTCDate() - daysSinceMonday);

  const periodEnd = thisMonday;
  const periodStart = new Date(thisMonday);
  periodStart.setUTCDate(thisMonday.getUTCDate() - 7);

  const labelEndDate = new Date(periodEnd);
  labelEndDate.setUTCDate(periodEnd.getUTCDate() - 1);

  return {
    periodStart,
    periodEnd,
    labelStart: utcDateOnly(periodStart),
    labelEnd: utcDateOnly(labelEndDate),
  };
}

export function previousWeekPeriod(period: BriefPeriod): BriefPeriod {
  const periodEnd = period.periodStart;
  const periodStart = new Date(period.periodStart);
  periodStart.setUTCDate(period.periodStart.getUTCDate() - 7);
  const labelEndDate = new Date(periodEnd);
  labelEndDate.setUTCDate(periodEnd.getUTCDate() - 1);
  return {
    periodStart,
    periodEnd,
    labelStart: utcDateOnly(periodStart),
    labelEnd: utcDateOnly(labelEndDate),
  };
}

export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export function formatPctChange(
  current: number,
  previous: number
): string | null {
  // Avoid nonsense when both periods are effectively zero.
  if (Math.abs(current) < 0.005 && Math.abs(previous) < 0.005) return null;
  if (Math.abs(previous) < 0.005) {
    return current > 0 ? "new activity vs prior zero" : null;
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}% vs prior 7d`;
}

export type ActionCandidate = {
  priority: number; // 1 = highest
  action: string;
  why: string;
  urgency: string | null;
  section: CeoBriefSectionKey;
};

/** Rank candidates and return at most three Luke actions. */
export function selectLukeActions(
  candidates: ActionCandidate[],
  max = 3
): CeoLukeAction[] {
  const sorted = [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.action.localeCompare(b.action);
  });
  return sorted.slice(0, max).map((c, i) => ({
    rank: i + 1,
    action: c.action,
    why: c.why,
    urgency: c.urgency,
  }));
}

/** Test helper: RED customer issues outrank SEO opportunities. */
export function priorityRankLegalOrCustomer(): number {
  return 2;
}

export function priorityRankSeo(): number {
  return 7;
}
