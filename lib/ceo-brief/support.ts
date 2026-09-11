import { getSql } from "@/lib/db/sql";
import { ensureSupportSchema } from "@/lib/support/schema";
import { getLatestJobRun } from "@/lib/support/store";

import type { BriefPeriod } from "./period";
import type { CeoSupportSnapshot } from "./types";

const SPAM_VENDOR = ["spam_solicitation", "vendor_solicitation"] as const;

const FAQ_HINTS: Record<string, string> = {
  coa_location: "COA findability / education on product or COA pages",
  batch_verification: "Batch/COA verification copy",
  shipping_timing: "Shipping timing clarification",
  free_shipping: "Free-shipping threshold FAQ",
  shipping_destination: "Destination / international shipping FAQ",
  order_status: "Order status / track-page discoverability",
  tracking_not_updated: "Tracking lag expectations",
  card_payment: "Card payment FAQ",
  bitcoin_payment: "Bitcoin payment FAQ",
  out_of_stock: "Stock visibility on product pages",
  research_use_boundary: "Research-use boundary clarity",
};

export async function collectSupportSnapshot(
  period: BriefPeriod
): Promise<CeoSupportSnapshot> {
  await ensureSupportSchema();
  const sql = getSql();
  const start = period.periodStart.toISOString();
  const end = period.periodEnd.toISOString();

  const riskRows = (await sql`
    SELECT
      c.risk_level,
      COUNT(*)::int AS n
    FROM support_messages m
    JOIN support_classifications c ON c.message_id = m.id
    WHERE m.received_at >= ${start}::timestamptz
      AND m.received_at < ${end}::timestamptz
      AND COALESCE(c.category, '') NOT IN ('spam_solicitation', 'vendor_solicitation')
      AND COALESCE(m.status, '') <> 'ignored'
    GROUP BY c.risk_level
  `) as Array<{ risk_level: string; n: number }>;

  const byRisk = Object.fromEntries(
    riskRows.map((r) => [r.risk_level, Number(r.n)])
  ) as Record<string, number>;

  const genuineCustomerMessages = Object.values(byRisk).reduce(
    (a, b) => a + b,
    0
  );

  const spamVendor = (await sql`
    SELECT
      c.category,
      COUNT(*)::int AS n
    FROM support_messages m
    JOIN support_classifications c ON c.message_id = m.id
    WHERE m.received_at >= ${start}::timestamptz
      AND m.received_at < ${end}::timestamptz
      AND c.category = ANY(${SPAM_VENDOR as unknown as string[]})
    GROUP BY c.category
  `) as Array<{ category: string; n: number }>;

  let spamSolicitations = 0;
  let vendorSolicitations = 0;
  for (const row of spamVendor) {
    if (row.category === "spam_solicitation") spamSolicitations = Number(row.n);
    if (row.category === "vendor_solicitation")
      vendorSolicitations = Number(row.n);
  }

  const unresolved = (await sql`
    SELECT COUNT(*)::int AS n
    FROM support_escalations e
    WHERE e.resolved_at IS NULL
  `) as Array<{ n: number }>;

  const topCats = (await sql`
    SELECT
      c.category,
      COUNT(*)::int AS n
    FROM support_messages m
    JOIN support_classifications c ON c.message_id = m.id
    WHERE m.received_at >= ${start}::timestamptz
      AND m.received_at < ${end}::timestamptz
      AND COALESCE(c.category, '') NOT IN ('spam_solicitation', 'vendor_solicitation')
      AND COALESCE(m.status, '') <> 'ignored'
    GROUP BY c.category
    ORDER BY n DESC
    LIMIT 8
  `) as Array<{ category: string; n: number }>;

  const topGenuineCategories = topCats.map((r) => ({
    category: r.category,
    count: Number(r.n),
  }));

  const recurringQuestionHints = topGenuineCategories
    .filter((c) => c.count >= 2 && FAQ_HINTS[c.category])
    .map((c) => `${FAQ_HINTS[c.category]} (${c.count}×)`)
    .slice(0, 5);

  const job = await getLatestJobRun();
  const systemFailures: string[] = [];
  const automationIssues: string[] = [];
  if (job?.ok === false) {
    systemFailures.push(
      `Support inbox job failed: ${job.errorSummary ?? "unknown error"}`
    );
  }
  if ((job?.failed ?? 0) > 0) {
    automationIssues.push(
      `Support job reported ${job?.failed} failed message(s) on last run`
    );
  }

  return {
    genuineCustomerMessages,
    green: byRisk.GREEN ?? 0,
    yellow: byRisk.YELLOW ?? 0,
    red: byRisk.RED ?? 0,
    unresolvedEscalations: Number(unresolved[0]?.n ?? 0),
    spamSolicitations,
    vendorSolicitations,
    topGenuineCategories,
    recurringQuestionHints,
    systemFailures,
    automationIssues,
  };
}

/** Pure: spam/vendor must not count toward customer demand. */
export function genuineCustomerCount(input: {
  totalClassified: number;
  spam: number;
  vendor: number;
}): number {
  return Math.max(0, input.totalClassified - input.spam - input.vendor);
}
