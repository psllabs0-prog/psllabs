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
 * Never executes business actions (refunds, POs, ads, content, etc.).
 */
export async function runDecisionEngine(options?: {
  asOf?: Date;
  /** Manual admin runs skip digest by default. */
  sendDigest?: boolean;
}): Promise<DecisionEngineRunResult> {
  await ensureDecisionEngineSchema();
  let runId: number | null = null;
  let signalsCreated = 0;
  let signalsResolved = 0;

  try {
    const { ctx, sourcesChecked } = await collectDecisionContext(
      options?.asOf ?? new Date()
    );
    runId = await startDecisionRun(sourcesChecked);

    const candidates: DecisionCandidate[] = evaluateDecisionPatterns(ctx);
    const activeKeys = new Set<string>();

    for (const c of candidates) {
      activeKeys.add(c.signalKey);
      const { created, reactivated } = await upsertDecisionSignal(c);
      if (created || reactivated) signalsCreated += 1;
    }

    signalsResolved = await resolveMissingAutoSignals(activeKeys);

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
    if (runId != null) {
      await finishDecisionRun({
        id: runId,
        status: "error",
        signalsCreated,
        signalsResolved,
        errorSummary: message.slice(0, 500),
      }).catch(() => undefined);
    }
    console.error("[decision-engine]", message);
    return {
      ok: false,
      runId,
      signalsCreated,
      signalsResolved,
      signalsActive: 0,
      candidates: 0,
      error: message,
    };
  }
}
