import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import {
  listActivityEventsAfter,
  listRecentActivityEvents,
  parseActivityCursor,
} from "@/lib/ops/mission-control/events";
import { syncActivityFromSources } from "@/lib/ops/mission-control/projectors";
import { collectMissionControlSnapshot } from "@/lib/ops/mission-control/snapshot";
import { MISSION_CONTROL_SYNC_HEADER } from "@/lib/ops/mission-control/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  const url = new URL(request.url);
  const afterRaw = url.searchParams.get("after");
  const cursor = parseActivityCursor(afterRaw);
  if (afterRaw !== null && cursor === null) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }
  const wantSnapshot = url.searchParams.get("snapshot") === "1";
  const allowSync = request.headers.get(MISSION_CONTROL_SYNC_HEADER) === "1";

  try {
    let sync: { ran: boolean; inserted: number; errors: number } | null = null;
    if (wantSnapshot && allowSync) {
      try {
        const result = await syncActivityFromSources();
        sync = {
          ran: result.ran,
          inserted: result.inserted,
          errors: result.sources.filter((s) => s.error).length,
        };
      } catch (error) {
        console.error("[admin/ops/mission-control] sync", error);
        sync = { ran: false, inserted: 0, errors: -1 };
      }
    }

    const events =
      cursor === null
        ? await listRecentActivityEvents(100)
        : await listActivityEventsAfter(cursor);
    const nextCursor = events.reduce(
      (max, e) => (e.id > max ? e.id : max),
      cursor ?? 0
    );

    const snapshot = wantSnapshot ? await collectMissionControlSnapshot() : null;

    return NextResponse.json(
      {
        serverTime: new Date().toISOString(),
        cursor: nextCursor,
        events,
        sync,
        snapshot,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("[admin/ops/mission-control] GET", error);
    return NextResponse.json(
      { error: "Unable to load Mission Control." },
      { status: 500, headers: NO_STORE }
    );
  }
}
