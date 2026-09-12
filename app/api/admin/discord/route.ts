import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { getDiscordAdminStatusSafe } from "@/lib/discord/config";
import {
  getDiscordAnalyticsSummary,
  setDiscordInteractionReportingExcluded,
  ensureDiscordSchema,
} from "@/lib/discord/store";
import { registerDiscordCommands } from "@/lib/discord/register";
import { testKnowledgeAnswerLocally } from "@/lib/discord/answers";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    await ensureDiscordSchema();
    const [status, analytics] = await Promise.all([
      Promise.resolve(getDiscordAdminStatusSafe()),
      getDiscordAnalyticsSummary(),
    ]);
    return NextResponse.json({ status, analytics });
  } catch (error) {
    console.error("[admin/discord] GET", error);
    return NextResponse.json(
      { error: "Unable to load Discord admin status." },
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
    if (action === "register_commands") {
      const result = await registerDiscordCommands();
      return NextResponse.json({ ok: result.ok, result });
    }
    if (action === "test_knowledge") {
      const q = typeof body.question === "string" ? body.question : "";
      const answer = testKnowledgeAnswerLocally(q);
      return NextResponse.json({ ok: true, answer });
    }
    if (action === "mark_excluded" || action === "restore_reporting") {
      const id =
        typeof body.id === "number"
          ? body.id
          : typeof body.id === "string"
            ? Number(body.id)
            : NaN;
      if (!Number.isFinite(id)) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      await setDiscordInteractionReportingExcluded({
        id,
        excluded: action === "mark_excluded",
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/discord] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Action failed",
      },
      { status: 500 }
    );
  }
}
