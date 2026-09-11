import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { generateWeeklyCeoBrief } from "@/lib/ceo-brief/run";
import { getLatestCeoBrief } from "@/lib/ceo-brief/store";
import { ensureCeoBriefSchema } from "@/lib/ceo-brief/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    await ensureCeoBriefSchema();
    const latest = await getLatestCeoBrief();
    return NextResponse.json({
      brief: latest?.briefJson ?? null,
      row: latest
        ? {
            id: latest.id,
            periodStart: latest.periodStart,
            periodEnd: latest.periodEnd,
            generatedAt: latest.generatedAt,
            emailSentAt: latest.emailSentAt,
          }
        : null,
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
        row: {
          id: result.row.id,
          periodStart: result.row.periodStart,
          periodEnd: result.row.periodEnd,
          generatedAt: result.row.generatedAt,
          emailSentAt: result.row.emailSentAt,
        },
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
