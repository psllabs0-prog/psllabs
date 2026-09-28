import { getMissionControlWriteMode, type MissionControlWriteMode } from "./config";
import {
  listActivityEventsAfter,
  listRecentActivityEvents,
  parseActivityCursor,
} from "./events";
import { syncActivityFromSources } from "./projectors";
import { getMissionControlSchemaState } from "./schema";
import {
  collectMissionControlSnapshot,
  type MissionControlSnapshot,
} from "./snapshot";
import { MISSION_CONTROL_SYNC_HEADER, type ActivityEvent } from "./types";

export const MIGRATION_REQUIRED_MESSAGE =
  "Mission Control activity tables are not initialized in this database. Run the explicit migration (npm run migrate-ops) to create them.";

export type MissionControlResponseBody = {
  serverTime: string;
  initialized: boolean;
  migrationRequired: string | null;
  missingTables: string[];
  writeMode: MissionControlWriteMode;
  cursor: number;
  events: ActivityEvent[];
  sync: { ran: boolean; inserted: number; errors: number; reason: string | null } | null;
  snapshot: MissionControlSnapshot | null;
};

/**
 * Admin-authenticated request handler (auth is enforced by the route).
 * Reads never create schema. Activity backfill only runs when writes are
 * enabled server-side AND the client asks via the custom header AND the
 * tables already exist — the header alone can never cause a write.
 */
export async function handleMissionControlGet(input: {
  url: URL;
  headers: Headers;
  now?: Date;
}): Promise<{ status: number; body: MissionControlResponseBody | { error: string } }> {
  const afterRaw = input.url.searchParams.get("after");
  const cursor = parseActivityCursor(afterRaw);
  if (afterRaw !== null && cursor === null) {
    return { status: 400, body: { error: "Invalid cursor" } };
  }
  const wantSnapshot = input.url.searchParams.get("snapshot") === "1";
  const syncRequested = input.headers.get(MISSION_CONTROL_SYNC_HEADER) === "1";
  const writeMode = getMissionControlWriteMode();
  const schema = await getMissionControlSchemaState();

  let sync: MissionControlResponseBody["sync"] = null;
  if (wantSnapshot && syncRequested && writeMode.enabled && schema.initialized) {
    try {
      const result = await syncActivityFromSources();
      sync = {
        ran: result.ran,
        inserted: result.inserted,
        errors: result.sources.filter((s) => s.error).length,
        reason: result.reason,
      };
    } catch (error) {
      console.error(
        "[mission-control] sync failed:",
        error instanceof Error ? error.message : error
      );
      sync = { ran: false, inserted: 0, errors: -1, reason: "Sync failed" };
    }
  }

  const events = schema.initialized
    ? cursor === null
      ? await listRecentActivityEvents(100)
      : await listActivityEventsAfter(cursor)
    : [];
  const nextCursor = events.reduce((max, e) => (e.id > max ? e.id : max), cursor ?? 0);

  const snapshot = wantSnapshot
    ? await collectMissionControlSnapshot({ writeMode, schema, now: input.now })
    : null;

  return {
    status: 200,
    body: {
      serverTime: (input.now ?? new Date()).toISOString(),
      initialized: schema.initialized,
      migrationRequired: schema.initialized ? null : MIGRATION_REQUIRED_MESSAGE,
      missingTables: schema.missing,
      writeMode,
      cursor: nextCursor,
      events,
      sync,
      snapshot,
    },
  };
}
