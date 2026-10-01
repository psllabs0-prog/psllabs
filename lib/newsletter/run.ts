import { getNewsletterWelcomeSchemaState, type NewsletterSendKind } from "./schema";
import { dispatchWelcomeSend, stepGate, type DispatchOutcome, type NewsletterContext } from "./service";
import { finishWelcomeRun, listDueWelcomeSends, markInterruptedAttemptsUnknown, pruneRateLimits, startWelcomeRun } from "./welcome-store";

export const WELCOME_RUN_LIMIT = 50;
/** Stop starting new sends well before the 60s function limit. */
export const WELCOME_RUN_BUDGET_MS = 35_000;

export type WelcomeRunSummary =
  | { skipped: true; reason: string }
  | { skipped: false; runId: string; considered: number; interruptedMarkedUnknown: number; outcomes: Partial<Record<DispatchOutcome, number>> };

/**
 * Daily sweep: retries Welcome 1 after definite (non-ambiguous) failures and
 * sends due later steps, one address at a time. Writes nothing while the
 * journey is off, the schema is missing, or prerequisites are absent.
 */
export async function runNewsletterWelcomeJob(ctx: NewsletterContext): Promise<WelcomeRunSummary> {
  const { config } = ctx;
  if (config.mode === "off") return { skipped: true, reason: config.modeReason };
  if (config.prerequisites.missing.length > 0) return { skipped: true, reason: `Missing prerequisites: ${config.prerequisites.missing.join(", ")}` };
  const kinds = (["welcome_1", "welcome_2", "welcome_3"] as NewsletterSendKind[]).filter((k) => stepGate(k, config).enabled);
  if (kinds.length === 0) return { skipped: true, reason: "No welcome step is enabled" };
  const schema = await getNewsletterWelcomeSchemaState();
  if (!schema.ready) return { skipped: true, reason: `Schema not migrated (${schema.missing.join(", ")})` };

  const startedMs = Date.now();
  const runId = await startWelcomeRun(ctx.now);
  const outcomes: Partial<Record<DispatchOutcome, number>> = {};
  let considered = 0;
  let interrupted = 0;
  try {
    interrupted = await markInterruptedAttemptsUnknown(ctx.now);
    await pruneRateLimits(ctx.now);
    const due = await listDueWelcomeSends(ctx.now, WELCOME_RUN_LIMIT, { kinds, testOnly: config.mode === "allowlist" || config.simulate });
    for (const item of due) {
      if (Date.now() - startedMs > WELCOME_RUN_BUDGET_MS) break;
      considered++;
      const outcome = await dispatchWelcomeSend(item.id, ctx);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
    const summary = { considered, interruptedMarkedUnknown: interrupted, outcomes };
    await finishWelcomeRun(runId, { ok: true, summary, error: null, at: new Date() });
    return { skipped: false, runId, ...summary };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Welcome run failed";
    await finishWelcomeRun(runId, { ok: false, summary: { considered, interruptedMarkedUnknown: interrupted, outcomes }, error: message, at: new Date() }).catch(() => {});
    throw error;
  }
}
