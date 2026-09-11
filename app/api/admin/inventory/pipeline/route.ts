import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import type { PipelineLotStatus } from "@/lib/inventory/monitor/constants";
import {
  createPipelineLot,
  listPipelineLots,
  releasePipelineLotToSellable,
  updatePipelineLotStage,
} from "@/lib/inventory/monitor/pipeline";

export const runtime = "nodejs";

const STAGE_STATUSES: PipelineLotStatus[] = [
  "ordered",
  "in_transit",
  "received_awaiting_testing",
  "cancelled",
];

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    const lots = await listPipelineLots({ includeReleased: true, limit: 150 });
    return NextResponse.json({ lots });
  } catch (error) {
    console.error("[admin/inventory/pipeline] GET", error);
    return NextResponse.json(
      { error: "Unable to load pipeline lots." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "create") {
      const sku = typeof body.sku === "string" ? body.sku.trim() : "";
      const quantityOrdered = Number(body.quantityOrdered);
      if (!sku || !Number.isInteger(quantityOrdered) || quantityOrdered <= 0) {
        return NextResponse.json(
          { error: "sku and positive quantityOrdered required" },
          { status: 400 }
        );
      }
      const lot = await createPipelineLot({
        sku,
        quantityOrdered,
        supplierLotReference:
          typeof body.supplierLotReference === "string"
            ? body.supplierLotReference
            : null,
        orderedAt:
          typeof body.orderedAt === "string" ? body.orderedAt : null,
        expectedReleaseAt:
          typeof body.expectedReleaseAt === "string"
            ? body.expectedReleaseAt
            : null,
        notes: typeof body.notes === "string" ? body.notes : null,
        status:
          body.status === "in_transit" ? "in_transit" : "ordered",
      });
      return NextResponse.json({ ok: true, lot });
    }

    if (action === "update_stage") {
      const lotId = Number(body.lotId);
      const status = body.status as PipelineLotStatus;
      if (!Number.isInteger(lotId) || !STAGE_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: "lotId and valid status required" },
          { status: 400 }
        );
      }
      const lot = await updatePipelineLotStage({
        lotId,
        status,
        quantityReceived:
          body.quantityReceived === undefined || body.quantityReceived === null
            ? null
            : Number(body.quantityReceived),
        receivedAt:
          typeof body.receivedAt === "string" ? body.receivedAt : null,
        testingStartedAt:
          typeof body.testingStartedAt === "string"
            ? body.testingStartedAt
            : body.recordTestingStart === true
              ? new Date().toISOString()
              : null,
        testingCost:
          body.testingCost === undefined || body.testingCost === null
            ? null
            : Number(body.testingCost),
        expectedReleaseAt:
          typeof body.expectedReleaseAt === "string"
            ? body.expectedReleaseAt
            : null,
        notes: typeof body.notes === "string" ? body.notes : null,
      });
      return NextResponse.json({ ok: true, lot });
    }

    if (action === "release") {
      const lotId = Number(body.lotId);
      const confirmed = body.confirmRelease === true;
      if (!Number.isInteger(lotId)) {
        return NextResponse.json({ error: "lotId required" }, { status: 400 });
      }
      const result = await releasePipelineLotToSellable(lotId, confirmed);
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error ?? "Release failed" },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/inventory/pipeline] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Pipeline action failed",
      },
      { status: 500 }
    );
  }
}
