import { getSql } from "@/lib/db/sql";
import { assertPartnersAvailable, loadPartnerMetrics } from "@/lib/partners/store";
import type { BriefPeriod } from "./period";
import type { CeoPartnerSnapshot } from "./types";

/** Optional, read-only addition to the existing owner brief. No migration or send. */
export async function collectPartnerSnapshot(period: BriefPeriod, asOf: Date): Promise<CeoPartnerSnapshot | undefined> {
  try {
    await assertPartnersAvailable();
    const sql = getSql();
    const rows = await sql`
      SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status NOT IN ('paused', 'declined') AND follow_up_due_at <= ${asOf.toISOString()}::timestamptz)::int AS due
      FROM acquisition_partners
    `;
    const metrics = await loadPartnerMetrics({ start: period.periodStart, end: period.periodEnd });
    const totals = [...metrics.values()];
    return {
      activePartners: Number(rows[0]?.active ?? 0), followUpsDue: Number(rows[0]?.due ?? 0),
      paidOrders: totals.reduce((sum, m) => sum + m.paidOrders, 0),
      paidOrderRevenueUsd: Math.round(totals.reduce((sum, m) => sum + m.paidOrderRevenueUsd, 0) * 100) / 100,
    };
  } catch {
    // Legacy deployments and temporary partner errors must not block the owner brief.
    return undefined;
  }
}

export function partnerBriefLines(partners: CeoPartnerSnapshot | undefined): string[] {
  if (!partners) return [];
  return [
    `Partners now: ${partners.activePartners} active; ${partners.followUpsDue} follow-ups due for review.`,
    `Completed week: ${partners.paidOrders} referral paid orders; $${partners.paidOrderRevenueUsd.toFixed(2)} paid order total, including shipping and before fees or refund adjustments. Attribution is not commission approval.`,
    "Review partners: https://www.psllabs.org/admin-partners",
  ];
}
