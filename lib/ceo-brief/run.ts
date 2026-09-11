import { collectAcquisitionSnapshot } from "./acquisition";
import { composeWeeklyBrief } from "./compose";
import { sendCeoBriefEmail } from "./email";
import { collectSalesSnapshot } from "./finance";
import { collectHealthSnapshot } from "./health";
import { collectInventorySnapshot } from "./inventory";
import {
  getLastCompletedWeekUtc,
  previousWeekPeriod,
} from "./period";
import { collectSeoSnapshot } from "./seo";
import { ensureCeoBriefSchema } from "./schema";
import {
  claimCeoBriefEmailSend,
  getCeoBriefById,
  getCeoBriefForPeriod,
  markCeoBriefEmailSent,
  releaseCeoBriefEmailClaim,
  upsertCeoWeeklyBrief,
} from "./store";
import { collectSupportSnapshot } from "./support";
import type { CeoBriefRow, CeoWeeklyBrief } from "./types";

export type GenerateCeoBriefResult = {
  brief: CeoWeeklyBrief;
  row: CeoBriefRow;
  emailSent: boolean;
  emailSkippedReason?: string;
};

export type CeoBriefSendFn = (brief: CeoWeeklyBrief) => Promise<{
  sent: boolean;
  skippedReason?: string;
}>;

async function buildBrief(asOf: Date): Promise<{
  brief: CeoWeeklyBrief;
  periodStart: Date;
  periodEnd: Date;
}> {
  const period = getLastCompletedWeekUtc(asOf);
  const prior = previousWeekPeriod(period);

  const [sales, inventory, support] = await Promise.all([
    collectSalesSnapshot(period, prior),
    collectInventorySnapshot(asOf),
    collectSupportSnapshot(period),
  ]);
  const acquisition = collectAcquisitionSnapshot();
  const seo = collectSeoSnapshot();
  const health = await collectHealthSnapshot({ support });

  const brief = composeWeeklyBrief({
    periodStart: period.periodStart.toISOString(),
    periodEnd: period.periodEnd.toISOString(),
    periodLabel: `${period.labelStart} → ${period.labelEnd}`,
    generatedAt: new Date().toISOString(),
    sales,
    acquisition,
    inventory,
    support,
    seo,
    health,
  });

  return {
    brief,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  };
}

/**
 * Claim → send → mark sent only on success.
 * Failure releases claim and records a non-secret error for retry.
 */
export async function deliverCeoBriefEmail(input: {
  briefId: number;
  brief: CeoWeeklyBrief;
  forceEmail?: boolean;
  sendFn?: CeoBriefSendFn;
}): Promise<{
  emailSent: boolean;
  emailSkippedReason?: string;
  row: CeoBriefRow | null;
}> {
  const sendFn = input.sendFn ?? sendCeoBriefEmail;
  const current = await getCeoBriefById(input.briefId);
  if (!current) {
    return { emailSent: false, emailSkippedReason: "brief not found", row: null };
  }

  if (current.emailSentAt && !input.forceEmail) {
    return {
      emailSent: false,
      emailSkippedReason: "duplicate weekly send prevented",
      row: current,
    };
  }

  const claimed = await claimCeoBriefEmailSend(input.briefId, {
    allowResend: input.forceEmail === true,
  });
  if (!claimed) {
    const after = await getCeoBriefById(input.briefId);
    const reason =
      after?.emailSentAt && !input.forceEmail
        ? "duplicate weekly send prevented"
        : after?.emailSendClaimedAt
          ? "email send currently claimed"
          : "duplicate weekly send prevented";
    return {
      emailSent: false,
      emailSkippedReason: reason,
      row: after,
    };
  }

  try {
    const result = await sendFn(input.brief);
    if (result.sent) {
      await markCeoBriefEmailSent(input.briefId);
      const row = await getCeoBriefById(input.briefId);
      return { emailSent: true, row };
    }

    const reason = result.skippedReason ?? "email send returned sent=false";
    await releaseCeoBriefEmailClaim(input.briefId, reason);
    return {
      emailSent: false,
      emailSkippedReason: reason,
      row: await getCeoBriefById(input.briefId),
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "email send failed";
    await releaseCeoBriefEmailClaim(input.briefId, reason);
    return {
      emailSent: false,
      emailSkippedReason: reason,
      row: await getCeoBriefById(input.briefId),
    };
  }
}

export async function generateWeeklyCeoBrief(options?: {
  asOf?: Date;
  /** When false and a row exists, reuse without rebuilding. Default true. */
  regenerate?: boolean;
  /** Attempt email (once per period unless forceEmail). */
  sendEmail?: boolean;
  forceEmail?: boolean;
  /** Test seam for SMTP success/failure. */
  sendFn?: CeoBriefSendFn;
}): Promise<GenerateCeoBriefResult> {
  await ensureCeoBriefSchema();

  const asOf = options?.asOf ?? new Date();
  const regenerate = options?.regenerate !== false;
  const sendEmail = options?.sendEmail === true;
  const forceEmail = options?.forceEmail === true;

  const period = getLastCompletedWeekUtc(asOf);
  const existing = await getCeoBriefForPeriod(
    period.periodStart,
    period.periodEnd
  );

  let brief: CeoWeeklyBrief;
  let row: CeoBriefRow;

  if (existing && !regenerate) {
    brief = existing.briefJson;
    row = existing;
  } else {
    const built = await buildBrief(asOf);
    brief = built.brief;
    row = await upsertCeoWeeklyBrief({
      periodStart: built.periodStart,
      periodEnd: built.periodEnd,
      brief,
    });
  }

  if (!sendEmail) {
    // Generate-only must not alter email claim/sent state.
    return { brief, row, emailSent: false };
  }

  const delivery = await deliverCeoBriefEmail({
    briefId: row.id,
    brief,
    forceEmail,
    sendFn: options?.sendFn,
  });

  return {
    brief,
    row: delivery.row ?? row,
    emailSent: delivery.emailSent,
    emailSkippedReason: delivery.emailSkippedReason,
  };
}

/** Cron: regenerate brief and email once per completed week (retry if unsent). */
export async function runWeeklyCeoBriefJob(asOf: Date = new Date()): Promise<{
  ok: boolean;
  periodLabel: string;
  emailSent: boolean;
  emailSkippedReason?: string;
  actionCount: number;
}> {
  const result = await generateWeeklyCeoBrief({
    asOf,
    regenerate: true,
    sendEmail: true,
    forceEmail: false,
  });

  return {
    ok: true,
    periodLabel: result.brief.periodLabel,
    emailSent: result.emailSent,
    emailSkippedReason: result.emailSkippedReason,
    actionCount: result.brief.actions.length,
  };
}
