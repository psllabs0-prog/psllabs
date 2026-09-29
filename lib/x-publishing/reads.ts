import type { getSql } from "@/lib/db/sql";

import type { XDisplayState, XPostStatus } from "./constants";
import { displayStateOf } from "./records";

type Sql = ReturnType<typeof getSql>;
type Row = Record<string, unknown>;

export type XSection = "review" | "open" | "history";
export const X_SECTIONS: readonly XSection[] = ["review", "open", "history"];

/**
 * Read-only queue reads. The predicates below are the SQL twins of
 * isDispatchOverdue / displayState / isUnresolved (records.ts); they are fixed
 * text, and every value is a bound parameter ($1 is_test, $2 now).
 */
const OVERDUE_SQL = `COALESCE(a.state = 'dispatched' AND a.result_received_at IS NULL AND a.dispatch_deadline <= $2::timestamptz, false)`;
const APPROVAL_EXPIRED_SQL = `COALESCE(p.status = 'approved' AND p.expires_at <= $2::timestamptz, false)`;
const SECTION_SQL = `CASE
    WHEN p.status = 'uncertain' OR p.review_required OR ${OVERDUE_SQL} THEN 'review'
    WHEN p.status IN ('draft','approved','claimed','dispatched','created') THEN 'open'
    ELSE 'history' END`;
const FROM_SQL = `FROM x_publishing_posts p
  LEFT JOIN x_publishing_attempts a ON a.id = p.active_attempt_id
  WHERE p.is_test = $1`;
const POST_COLUMNS = `p.*, a.state AS active_attempt_state, a.dispatch_deadline AS active_dispatch_deadline,
  a.result_received_at AS active_result_received_at, ${OVERDUE_SQL} AS dispatch_overdue`;

const ORDER: Record<XSection, string> = {
  review: "p.updated_at ASC, p.id ASC",
  open: "p.scheduled_for ASC NULLS LAST, p.updated_at ASC, p.id ASC",
  history: "p.updated_at DESC, p.id DESC",
};

/** Exact totals over the whole partition, grouped by display state and section. */
export function tallyQuery(sql: Sql, isTest: boolean, now: string) {
  return sql.query(
    `SELECT p.status, ${APPROVAL_EXPIRED_SQL} AS approval_expired, ${OVERDUE_SQL} AS dispatch_overdue,
       ${SECTION_SQL} AS section, COUNT(*)::int AS n
     ${FROM_SQL}
     GROUP BY 1, 2, 3, 4`,
    [isTest, now]
  );
}

export function sectionPageQuery(sql: Sql, isTest: boolean, now: string, section: XSection, limit: number, offset: number) {
  return sql.query(
    `SELECT ${POST_COLUMNS} ${FROM_SQL} AND (${SECTION_SQL}) = $3
     ORDER BY ${ORDER[section]} LIMIT $4 OFFSET $5`,
    [isTest, now, section, limit, offset]
  );
}

export function recentQuery(sql: Sql, isTest: boolean, now: string, limit: number) {
  return sql.query(
    `SELECT ${POST_COLUMNS} ${FROM_SQL} AND p.status <> 'draft'
     ORDER BY p.updated_at DESC, p.id DESC LIMIT $3`,
    [isTest, now, limit]
  );
}

export type XTally = {
  total: number;
  counts: Partial<Record<XDisplayState, number>>;
  sections: Record<XSection, number>;
};

export function foldTally(rows: Row[]): XTally {
  const tally: XTally = { total: 0, counts: {}, sections: { review: 0, open: 0, history: 0 } };
  for (const r of rows) {
    const n = Number(r.n ?? 0);
    const state = displayStateOf({
      status: String(r.status) as XPostStatus,
      approvalExpired: r.approval_expired === true,
      dispatchOverdue: r.dispatch_overdue === true,
    });
    tally.total += n;
    tally.counts[state] = (tally.counts[state] ?? 0) + n;
    const section = String(r.section) as XSection;
    if (section in tally.sections) tally.sections[section] += n;
  }
  return tally;
}

/** Consistent snapshot; READ ONLY so a read path can never write. */
export async function readOnlySnapshot(sql: Sql, queries: Array<ReturnType<typeof tallyQuery>>): Promise<Row[][]> {
  return (await sql.transaction(queries, { isolationLevel: "RepeatableRead", readOnly: true })) as Row[][];
}
