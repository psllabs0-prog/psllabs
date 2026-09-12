import { getRetentionReadiness } from "./config";
import { sendRetention30dEmail } from "./email";
import {
  claimRetentionSend,
  listRetentionCandidates,
  markRetentionSendFailed,
  markRetentionSendSent,
  recordRetentionJobRun,
} from "./store";

export type RetentionJobSummary = {
  ok: boolean;
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
  notReady?: boolean;
  readinessReasons?: string[];
};

/**
 * Daily retention job — retry-safe, write-once on confirmed send.
 * Does nothing (not ready) when compliance/auto-send gates fail.
 */
export async function runRetention30dJob(options?: {
  force?: boolean;
  limit?: number;
}): Promise<RetentionJobSummary> {
  const readiness = getRetentionReadiness();
  if (!readiness.ready && !options?.force) {
    const summary: RetentionJobSummary = {
      ok: true,
      candidates: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      notReady: true,
      readinessReasons: readiness.reasons,
    };
    await recordRetentionJobRun({
      ok: true,
      candidates: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errorSummary: `Not ready: ${readiness.reasons.join("; ")}`,
    });
    return summary;
  }

  // Force path still requires postal + from for real sends.
  if (!readiness.fromEmail || !readiness.postalAddress) {
    return {
      ok: false,
      candidates: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: readiness.reasons,
      notReady: true,
      readinessReasons: readiness.reasons,
    };
  }

  const candidates = await listRetentionCandidates(options?.limit ?? 50);
  const summary: RetentionJobSummary = {
    ok: true,
    candidates: candidates.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const c of candidates) {
    const claim = await claimRetentionSend({
      orderId: c.orderId,
      email: c.email,
    });
    if (!claim || !claim.claimed) {
      summary.skipped += 1;
      continue;
    }
    try {
      await sendRetention30dEmail({ to: c.email });
      const marked = await markRetentionSendSent(claim.id);
      if (marked) summary.sent += 1;
      else summary.skipped += 1;
    } catch (error) {
      const msg =
        error instanceof Error ? error.message.slice(0, 400) : "send failed";
      await markRetentionSendFailed(claim.id, msg);
      summary.failed += 1;
      summary.errors.push(msg);
      summary.ok = false;
    }
  }

  await recordRetentionJobRun({
    ok: summary.ok,
    candidates: summary.candidates,
    sent: summary.sent,
    skipped: summary.skipped,
    failed: summary.failed,
    errorSummary: summary.errors[0],
  });

  return summary;
}
