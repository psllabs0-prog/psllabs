import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { generateWeeklyCeoBrief } from "@/lib/ceo-brief/run";
import { getLatestCeoBrief } from "@/lib/ceo-brief/store";
import { ensureCeoBriefSchema } from "@/lib/ceo-brief/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

function rowMeta(row: {
  id: number;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  emailSentAt: string | null;
  emailSendClaimedAt: string | null;
  emailSendLastError: string | null;
}) {
  return {
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    generatedAt: row.generatedAt,
    emailSentAt: row.emailSentAt,
    emailSendClaimedAt: row.emailSendClaimedAt,
    emailSendLastError: row.emailSendLastError,
  };
}

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    await ensureCeoBriefSchema();
    const latest = await getLatestCeoBrief();
    return NextResponse.json({
      brief: latest?.briefJson ?? null,
      row: latest ? rowMeta(latest) : null,
    });
  } catch (error) {
    console.error("[admin/ceo-brief] GET", error);
    return NextResponse.json(
      { error: "Unable to load CEO brief." },
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

  const action = typeof body.action === "string" ? body.action : "generate";
  const sendEmail = body.sendEmail === true;

  try {
    if (action === "generate") {
      const result = await generateWeeklyCeoBrief({
        regenerate: true,
        sendEmail,
        forceEmail: false,
      });
      return NextResponse.json({
        ok: true,
        brief: result.brief,
        emailSent: result.emailSent,
        emailSkippedReason: result.emailSkippedReason,
        row: rowMeta(result.row),
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/ceo-brief] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Generate failed",
      },
      { status: 500 }
    );
  }
}
