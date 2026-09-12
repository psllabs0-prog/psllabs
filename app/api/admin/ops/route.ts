import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { collectOpsExceptions } from "@/lib/ops/exceptions";
import { collectOpsSystemStatuses } from "@/lib/ops/status";
import { topOpsActions } from "@/lib/ops/types";
import { acknowledgeOpsException } from "@/lib/ops/store";
import { ensureOpsSchema } from "@/lib/ops/schema";
import { collectFulfillmentBoard } from "@/lib/fulfillment/store";
import {
  getLatestJobRun as getLatestSupportJobRun,
  getLatestSuccessfulSupportJobRun,
  getSupportExpectedPollMinutes,
} from "@/lib/support/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    await ensureOpsSchema();
    const exceptions = await collectOpsExceptions();
    const topActions = topOpsActions(exceptions, 3);
    const statuses = await collectOpsSystemStatuses(exceptions);

    const [board, supportLatest, supportOk] = await Promise.all([
      collectFulfillmentBoard().catch(() => null),
      getLatestSupportJobRun().catch(() => null),
      getLatestSuccessfulSupportJobRun().catch(() => null),
    ]);

    return NextResponse.json({
      exceptions,
      topActions,
      statuses,
      activeCount: exceptions.filter((e) => !e.acknowledged).length,
      warehouse: board?.summary ?? null,
      supportHealth: {
        latestRunAt: supportLatest?.finishedAt ?? null,
        latestOk: supportLatest?.ok ?? null,
        lastSuccessfulAt: supportOk?.finishedAt ?? null,
        expectedPollMinutes: getSupportExpectedPollMinutes(),
      },
    });
  } catch (error) {
    console.error("[admin/ops] GET", error);
    return NextResponse.json(
      { error: "Unable to load operations exceptions." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "acknowledge") {
      const sourceType =
        typeof body.sourceType === "string" ? body.sourceType : "";
      const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
      const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
      if (!sourceType || !sourceId) {
        return NextResponse.json(
          { error: "sourceType and sourceId required" },
          { status: 400 }
        );
      }
      const ack = await acknowledgeOpsException({
        sourceType,
        sourceId,
        note,
      });
      return NextResponse.json({ ok: true, ack });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/ops] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Acknowledge failed",
      },
      { status: 500 }
    );
  }
}
