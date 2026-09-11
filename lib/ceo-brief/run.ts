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
  getCeoBriefForPeriod,
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

export async function generateWeeklyCeoBrief(options?: {
  asOf?: Date;
  /** When false and a row exists, reuse without rebuilding. Default true. */
  regenerate?: boolean;
  /** Attempt email (once per period unless forceEmail). */
  sendEmail?: boolean;
  forceEmail?: boolean;
}): Promise<GenerateCeoBriefResult> {
  await ensureCeoBriefSchema();

  const asOf = options?.asOf ?? new Date();
  const regenerate = options?.regenerate !== false;
  const sendEmail = options?.sendEmail === true;
  const forceEmail = options?.forceEmail === true;

  const period = getLastCompletedWeekUtc(asOf);
  const existing = await getCeoBriefForPeriod(period.periodStart, period.periodEnd);

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

  let emailSent = false;
  let emailSkippedReason: string | undefined;

  if (sendEmail) {
    if (row.emailSentAt && !forceEmail) {
      emailSkippedReason = "duplicate weekly send prevented";
    } else {
      const claimed = forceEmail ? true : await claimCeoBriefEmailSend(row.id);
      if (!claimed) {
        emailSkippedReason = "duplicate weekly send prevented";
      } else {
        try {
          const result = await sendCeoBriefEmail(brief);
          emailSent = result.sent;
          emailSkippedReason = result.skippedReason;
        } catch (error) {
          emailSkippedReason =
            error instanceof Error ? error.message : "email send failed";
        }
      }
    }
  }

  return { brief, row, emailSent, emailSkippedReason };
}

/** Cron: regenerate brief and email once per completed week. */
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
