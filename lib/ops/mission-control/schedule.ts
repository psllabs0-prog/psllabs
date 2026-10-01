import type { MissionControlWorker } from "./types";

export type ScheduledJob = {
  path: string;
  schedule: string;
  worker: MissionControlWorker;
  label: string;
  /** False when the job writes no run record Mission Control can observe. */
  hasRunLog: boolean;
};

/** Mirrors `vercel.json` crons (UTC). `npm run test:mission-control` guards drift. */
export const SCHEDULED_JOBS: ScheduledJob[] = [
  {
    path: "/api/cron/customer-intelligence",
    schedule: "0 10 * * 0",
    worker: "customer_intelligence",
    label: "Customer intelligence snapshot",
    hasRunLog: true,
  },
  {
    path: "/api/cron/paid-acquisition-sync",
    schedule: "0 11 * * *",
    worker: "data_sync",
    label: "Paid acquisition sync",
    hasRunLog: true,
  },
  {
    path: "/api/cron/search-console-sync",
    schedule: "0 13 * * *",
    worker: "data_sync",
    label: "Search Console sync",
    hasRunLog: true,
  },
  {
    path: "/api/cron/retention-30d",
    schedule: "0 12 * * *",
    worker: "retention",
    label: "Retention 30-day emails",
    hasRunLog: true,
  },
  {
    path: "/api/cron/delivery-followup",
    schedule: "0 14 * * *",
    worker: "fulfillment",
    label: "Delivery follow-up emails",
    hasRunLog: false,
  },
  {
    path: "/api/cron/inventory-monitor",
    schedule: "0 15 * * *",
    worker: "inventory",
    label: "Inventory monitor",
    hasRunLog: true,
  },
  {
    path: "/api/cron/finance-reconcile",
    schedule: "30 15 * * *",
    worker: "finance",
    label: "Finance reconciliation",
    hasRunLog: true,
  },
  {
    path: "/api/cron/support-inbox",
    schedule: "0 16 * * *",
    worker: "support",
    label: "Support inbox",
    hasRunLog: true,
  },
  {
    path: "/api/cron/decision-engine",
    schedule: "0 17 * * *",
    worker: "decision_engine",
    label: "Decision engine",
    hasRunLog: true,
  },
  {
    path: "/api/cron/newsletter-welcome",
    schedule: "0 18 * * *",
    worker: "retention",
    label: "Newsletter welcome emails",
    hasRunLog: false,
  },
  {
    path: "/api/cron/weekly-ceo-brief",
    schedule: "0 15 * * 1",
    worker: "ceo_brief",
    label: "Weekly CEO brief",
    hasRunLog: true,
  },
];

function parseField(raw: string, min: number, max: number): number | "*" | null {
  if (raw === "*") return "*";
  if (!/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

/**
 * Next UTC run for simple `M H * * D` crons (numbers or `*`).
 * Returns null for anything more complex rather than guessing.
 */
export function nextCronRun(schedule: string, from: Date): Date | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [mRaw, hRaw, domRaw, monRaw, dowRaw] = parts;
  if (domRaw !== "*" || monRaw !== "*") return null;
  const minute = parseField(mRaw, 0, 59);
  const hour = parseField(hRaw, 0, 23);
  const dowParsed = parseField(dowRaw, 0, 7);
  if (minute === null || hour === null || dowParsed === null) return null;
  if (minute === "*" || hour === "*") return null;
  const dow = dowParsed === 7 ? 0 : dowParsed;

  const start = new Date(from.getTime());
  start.setUTCSeconds(0, 0);
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate() + dayOffset,
        hour,
        minute
      )
    );
    if (candidate.getTime() <= from.getTime()) continue;
    if (dow !== "*" && candidate.getUTCDay() !== dow) continue;
    return candidate;
  }
  return null;
}

/** Interval between runs in minutes for simple daily/weekly crons. */
export function cronIntervalMinutes(schedule: string): number | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  if (parts[2] !== "*" || parts[3] !== "*") return null;
  if (!/^\d{1,2}$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1])) return null;
  return parts[4] === "*" ? 24 * 60 : 7 * 24 * 60;
}

export function jobsForWorker(worker: MissionControlWorker): ScheduledJob[] {
  return SCHEDULED_JOBS.filter((j) => j.worker === worker);
}

export function nextRunForWorker(
  worker: MissionControlWorker,
  from: Date
): { at: string; job: ScheduledJob } | null {
  let best: { at: Date; job: ScheduledJob } | null = null;
  for (const job of jobsForWorker(worker)) {
    const at = nextCronRun(job.schedule, from);
    if (at && (!best || at < best.at)) best = { at, job };
  }
  return best ? { at: best.at.toISOString(), job: best.job } : null;
}

export function upcomingScheduledRuns(
  from: Date,
  withinHours = 48
): Array<{ at: string; job: ScheduledJob }> {
  const horizon = from.getTime() + withinHours * 60 * 60 * 1000;
  return SCHEDULED_JOBS.map((job) => ({ job, at: nextCronRun(job.schedule, from) }))
    .filter((r): r is { job: ScheduledJob; at: Date } => r.at !== null)
    .filter((r) => r.at.getTime() <= horizon)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((r) => ({ at: r.at.toISOString(), job: r.job }));
}
