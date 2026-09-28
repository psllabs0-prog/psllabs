import { listDecisionSignals } from "@/lib/decision-engine";
import { partitionDecisionSignals } from "@/lib/decision-engine/owner-count";
import {
  collectSystemReadinessMatrix,
  type SystemReadinessRow,
} from "@/lib/decision-engine/readiness";

import { collectOpsExceptions } from "../exceptions";
import { sortOpsExceptions, type OpsException } from "../types";
import { listActivitySyncStates } from "./projectors";
import { upcomingScheduledRuns } from "./schedule";
import type { ActivitySyncState, WorkerCard } from "./types";
import { collectWorkerCards } from "./workers";

export type PipelineItem = {
  worker: string;
  label: string;
  count: number | null;
  detail: string | null;
  href: string;
};

export type MissionControlPipeline = {
  active: PipelineItem[];
  waiting: PipelineItem[];
  blocked: PipelineItem[];
  upcoming: Array<{
    at: string;
    label: string;
    worker: string;
    path: string;
    hasRunLog: boolean;
  }>;
};

export type MissionControlSnapshot = {
  generatedAt: string;
  pipeline: MissionControlPipeline;
  workers: WorkerCard[];
  incidents: OpsException[];
  connections: SystemReadinessRow[];
  coverage: ActivitySyncState[];
  coverageErrors: string[];
};

/** Pure: derive the owner summary strictly from worker observations. */
export function buildPipeline(
  workers: WorkerCard[],
  now: Date
): MissionControlPipeline {
  const active: PipelineItem[] = workers
    .filter((w) => w.status === "running")
    .map((w) => ({
      worker: w.worker,
      label: `${w.label} running`,
      count: null,
      detail: w.detail,
      href: w.href,
    }));

  const waiting: PipelineItem[] = workers.flatMap((w) =>
    w.waiting.map((q) => ({
      worker: w.worker,
      label: q.label,
      count: q.count,
      detail: null,
      href: q.href,
    }))
  );

  const blocked: PipelineItem[] = [
    ...workers.flatMap((w) =>
      w.blocked.map((q) => ({
        worker: w.worker,
        label: q.label,
        count: q.count,
        detail: null,
        href: q.href,
      }))
    ),
    ...workers
      .filter((w) => w.status === "failed")
      .map((w) => ({
        worker: w.worker,
        label: `${w.label} failed`,
        count: null,
        detail: w.detail,
        href: w.href,
      })),
  ];

  const disabled = new Set(
    workers.filter((w) => w.status === "disabled").map((w) => w.worker as string)
  );
  const upcoming = upcomingScheduledRuns(now, 48)
    .filter((r) => !disabled.has(r.job.worker))
    .map((r) => ({
      at: r.at,
      label: r.job.label,
      worker: r.job.worker,
      path: r.job.path,
      hasRunLog: r.job.hasRunLog,
    }));

  return { active, waiting, blocked, upcoming };
}

export async function collectMissionControlSnapshot(
  now = new Date()
): Promise<MissionControlSnapshot> {
  const coverageErrors: string[] = [];
  const [exceptions, connections, decisionSignals, coverage] = await Promise.all([
    collectOpsExceptions().catch(() => {
      coverageErrors.push("Incident sources could not be read");
      return [] as OpsException[];
    }),
    collectSystemReadinessMatrix().catch(() => {
      coverageErrors.push("System readiness could not be read");
      return [] as SystemReadinessRow[];
    }),
    listDecisionSignals({ statuses: ["active"], limit: 50 }).catch(() => {
      coverageErrors.push("Decision signals could not be read");
      return [];
    }),
    listActivitySyncStates().catch(() => {
      coverageErrors.push("Activity sync state could not be read");
      return [] as ActivitySyncState[];
    }),
  ]);

  const { lukeDecisions } = partitionDecisionSignals(decisionSignals);
  const workers = await collectWorkerCards({
    exceptions,
    lukeDecisionCount: lukeDecisions.length,
    now,
  });

  return {
    generatedAt: now.toISOString(),
    pipeline: buildPipeline(workers, now),
    workers,
    incidents: sortOpsExceptions(exceptions),
    connections,
    coverage,
    coverageErrors,
  };
}
