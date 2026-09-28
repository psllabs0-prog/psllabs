import {
  collectSystemReadinessMatrix,
  type SystemReadinessRow,
} from "@/lib/decision-engine/readiness";

import { collectOpsExceptions } from "../exceptions";
import { sortOpsExceptions, type OpsException } from "../types";
import type { MissionControlWriteMode } from "./config";
import { listActivitySyncStates } from "./projectors";
import { upcomingScheduledRuns } from "./schedule";
import type { MissionControlSchemaState } from "./schema";
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
  /** Null when not loaded (read-only mode); see `incidentsNote`. */
  incidents: OpsException[] | null;
  connections: SystemReadinessRow[] | null;
  incidentsNote: string | null;
  coverage: ActivitySyncState[];
  coverageErrors: string[];
};

export const INCIDENTS_READ_ONLY_NOTE =
  "Not loaded in read-only mode: the shared Ops incident collector runs its modules' schema checks, so Mission Control only calls it when MISSION_CONTROL_SYNC_ENABLED is true. Open the Overview tab for incidents.";

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

export async function collectMissionControlSnapshot(input: {
  writeMode: MissionControlWriteMode;
  schema: MissionControlSchemaState;
  now?: Date;
}): Promise<MissionControlSnapshot> {
  const now = input.now ?? new Date();
  const coverageErrors: string[] = [];

  const collectorsAllowed = input.writeMode.enabled;
  const [workers, exceptions, connections, coverage] = await Promise.all([
    collectWorkerCards({ now }),
    collectorsAllowed
      ? collectOpsExceptions().catch(() => {
          coverageErrors.push("Incident sources could not be read");
          return [] as OpsException[];
        })
      : Promise.resolve(null),
    collectorsAllowed
      ? collectSystemReadinessMatrix().catch(() => {
          coverageErrors.push("System readiness could not be read");
          return [] as SystemReadinessRow[];
        })
      : Promise.resolve(null),
    input.schema.initialized
      ? listActivitySyncStates().catch(() => {
          coverageErrors.push("Activity sync state could not be read");
          return [] as ActivitySyncState[];
        })
      : Promise.resolve([] as ActivitySyncState[]),
  ]);

  return {
    generatedAt: now.toISOString(),
    pipeline: buildPipeline(workers, now),
    workers,
    incidents: exceptions ? sortOpsExceptions(exceptions) : null,
    connections,
    incidentsNote: collectorsAllowed ? null : INCIDENTS_READ_ONLY_NOTE,
    coverage,
    coverageErrors,
  };
}
