export type MissionControlWriteMode = {
  enabled: boolean;
  reason: string;
};

function isTrue(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "true" || v === "1";
}

/**
 * Server-side gate for every Mission Control database write: activity
 * backfill, sync-state rows, and the shared Ops collectors (which run their
 * modules' schema checks). Disabled unless deliberately enabled; preview
 * deployments need a second explicit opt-in so an "all environments" value
 * cannot turn writes on in previews by accident.
 */
export function getMissionControlWriteMode(
  env: Record<string, string | undefined> = process.env
): MissionControlWriteMode {
  if (!isTrue(env.MISSION_CONTROL_SYNC_ENABLED)) {
    return {
      enabled: false,
      reason: "MISSION_CONTROL_SYNC_ENABLED is not true (read-only)",
    };
  }
  if (env.VERCEL_ENV === "preview" && !isTrue(env.MISSION_CONTROL_SYNC_ALLOW_PREVIEW)) {
    return {
      enabled: false,
      reason: "Preview deployment — MISSION_CONTROL_SYNC_ALLOW_PREVIEW is not true (read-only)",
    };
  }
  return { enabled: true, reason: "Writes enabled" };
}
