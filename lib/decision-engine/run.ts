import { getSql } from "@/lib/db/sql";

import { collectDecisionContext } from "./collect";
import { evaluateDecisionPatterns } from "./evaluate";
import { ensureDecisionEngineSchema } from "./schema";
import {
  finishDecisionRun,
  resolveMissingAutoSignals,
  startDecisionRun,
  upsertDecisionSignal,
} from "./store";
import type { DecisionCandidate } from "./types";
import { maybeSendDecisionDigest } from "./digest";

export type DecisionEngineRunResult = {
  ok: boolean;
  runId: number | null;
  signalsCreated: number;
  signalsResolved: number;
  signalsActive: number;
  candidates: number;
  digestSent?: boolean;
  error?: string;
};

/**
 * Idempotent decision engine run.
 * Always creates an audit row. Never executes business actions.
 */
export async function runDecisionEngine(options?: {
  asOf?: Date;
  /** Manual admin runs skip digest by default. */
  sendDigest?: boolean;
}): Promise<DecisionEngineRunResult> {
  await ensureDecisionEngineSchema();
  // Audit first — even collection failures get a run row.
  const runId = await startDecisionRun({
    phase: "started",
    succeeded: [],
    failed: [],
    notReached: [
      "finance",
      "acquisition",
      "inventory",
      "fulfillment",
      "support",
      "customerIntelligence",
      "seo",
      "discord",
      "ceoBrief",
    ],
  });
  let signalsCreated = 0;
  let signalsResolved = 0;

  try {
    const { ctx, sourcesAudit } = await collectDecisionContext(
      options?.asOf ?? new Date()
    );

    const sql = getSql();
    await sql`
      UPDATE decision_engine_runs SET
        sources_checked_json = ${JSON.stringify({
          phase: "collected",
          ...sourcesAudit,
        })}::jsonb
      WHERE id = ${runId}
    `;

    const candidates: DecisionCandidate[] = evaluateDecisionPatterns(ctx);
    const activeKeys = new Set<string>();

    for (const c of candidates) {
      activeKeys.add(c.signalKey);
      const { created, reactivated } = await upsertDecisionSignal(c);
      if (created || reactivated) signalsCreated += 1;
    }

    signalsResolved = await resolveMissingAutoSignals(
      activeKeys,
      ctx.sourceHealth
    );

    await finishDecisionRun({
      id: runId,
      status: "ok",
      signalsCreated,
      signalsResolved,
    });

    let digestSent = false;
    if (options?.sendDigest) {
      const dig = await maybeSendDecisionDigest();
      digestSent = dig.sent;
    }

    return {
      ok: true,
      runId,
      signalsCreated,
      signalsResolved,
      signalsActive: activeKeys.size,
      candidates: candidates.length,
      digestSent,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Decision engine failed";
    const safe = message.replace(/Bearer\s+\S+/gi, "[redacted]").slice(0, 500);
    await finishDecisionRun({
      id: runId,
      status: "error",
      signalsCreated,
      signalsResolved,
      errorSummary: safe,
    }).catch(() => undefined);
    console.error("[decision-engine]", safe);
    return {
      ok: false,
      runId,
      signalsCreated,
      signalsResolved,
      signalsActive: 0,
      candidates: 0,
      error: safe,
    };
  }
}
