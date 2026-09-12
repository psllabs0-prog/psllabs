import { NextResponse } from "next/server";

import { getDiscordConfig, isDiscordBotEnabled } from "@/lib/discord/config";
import { verifyDiscordRequest } from "@/lib/discord/verify";
import { handleDiscordApplicationCommand } from "@/lib/discord/commands";

export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * Public Discord HTTP Interactions endpoint.
 * Signature verification uses the RAW body BEFORE JSON parsing.
 * When enabled, full readiness (incl. analytics hash secret) is required.
 */
export async function POST(request: Request) {
  const cfg = getDiscordConfig();

  if (!isDiscordBotEnabled()) {
    return new NextResponse("Discord bot not enabled", { status: 503 });
  }

  // Fail closed: do not process with incomplete config / no durable rate limit.
  if (!cfg.ready || !cfg.publicKey) {
    return new NextResponse("Discord bot not ready", { status: 503 });
  }

  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) {
    return new NextResponse("Missing signature headers", { status: 401 });
  }

  const rawBody = await request.text();

  const valid = verifyDiscordRequest({
    publicKeyHex: cfg.publicKey,
    signatureHex: signature,
    timestamp,
    rawBody,
  });
  if (!valid) {
    return new NextResponse("Invalid request signature", { status: 401 });
  }

  let body: {
    type?: number;
    id?: string;
    data?: { name?: string; options?: Array<{ name?: string; value?: unknown }> };
    member?: { user?: { id?: string } };
    user?: { id?: string };
  };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  // PING
  if (body.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // APPLICATION_COMMAND
  if (body.type === 2) {
    try {
      const response = await handleDiscordApplicationCommand(
        body as Parameters<typeof handleDiscordApplicationCommand>[0]
      );
      return NextResponse.json(response);
    } catch {
      console.error("[discord/interactions] command error");
      return NextResponse.json({
        type: 4,
        data: {
          content:
            "Something went wrong answering that. Please email support@psllabs.org.",
          flags: 64,
          allowed_mentions: { parse: [] },
        },
      });
    }
  }

  return NextResponse.json({ type: 1 });
}
