import { getSql } from "@/lib/db/sql";
import { toIsoOrNull } from "@/lib/ops/mission-control/events";

import { X_ACCOUNT_ID, X_LIMITS } from "./constants";
import { formatPhoenix } from "./time";

type Sql = ReturnType<typeof getSql>;
type Row = Record<string, unknown>;

/**
 * The one daily Create Post policy, shared by manual approval, the
 * standing-policy autopilot, claims, and permits:
 *
 * - Reserving a day (owner approval or automatic authorization): items
 *   approved/claimed for that Phoenix day and still inside their window, plus
 *   dispatch permits already issued that day, must be below the cap. An item
 *   counts once: as a reservation until its permit is issued, then as a permit.
 * - Claiming: permits issued today plus in-flight claims must be below the cap.
 * - Permit issuance (the hard limit): permits issued today must be below the
 *   cap. An issued permit stays counted whatever its outcome (rejected,
 *   uncertain, or never reported).
 */
export const X_DAILY_CAP = X_LIMITS.createDispatchesPerPhoenixDay;

export function reservedAndPermittedSql(
  sql: Sql,
  input: { isTest: boolean; day: string; now: string; excludePostId: string | null }
) {
  return sql`(
    (SELECT COUNT(*) FROM x_publishing_posts q
      WHERE q.is_test = ${input.isTest} AND q.account_id = ${X_ACCOUNT_ID} AND q.scheduled_day = ${input.day}
        AND q.status IN ('approved','claimed') AND q.expires_at > ${input.now}::timestamptz
        AND q.id IS DISTINCT FROM ${input.excludePostId}::uuid)
    + (SELECT COUNT(*) FROM x_publishing_attempts d
      WHERE d.is_test = ${input.isTest} AND d.permit_day = ${input.day} AND d.permit_issued_at IS NOT NULL)
  )`;
}

export function reservationCapacityOkSql(
  sql: Sql,
  input: { isTest: boolean; day: string; now: string; excludePostId: string | null }
) {
  return sql`${reservedAndPermittedSql(sql, input)} < ${X_DAILY_CAP}`;
}

export function claimCapacityOkSql(sql: Sql, input: { isTest: boolean; today: string }) {
  return sql`(
    SELECT COUNT(*) FROM x_publishing_attempts a
    WHERE a.is_test = ${input.isTest}
      AND ((a.permit_issued_at IS NOT NULL AND a.permit_day = ${input.today}) OR a.state IN ('claimed','identity_ok'))
  ) < ${X_DAILY_CAP}`;
}

export function permitCapacityOkSql(sql: Sql, input: { isTest: boolean; today: string }) {
  return sql`(
    SELECT COUNT(*) FROM x_publishing_attempts d
    WHERE d.is_test = ${input.isTest} AND d.permit_day = ${input.today} AND d.permit_issued_at IS NOT NULL
  ) < ${X_DAILY_CAP}`;
}

export type XCapacityItem =
  | {
      kind: "reserved";
      postId: string;
      status: string;
      revision: number;
      scheduledFor: string | null;
      authorization: "owner" | "standing_policy";
    }
  | { kind: "permit"; attemptId: string; postId: string; state: string; permitIssuedAt: string | null };

export type XDayCapacity = {
  day: string;
  cap: number;
  reserved: number;
  permits: number;
  used: number;
  items: XCapacityItem[];
};

/** Read-only detail for one Phoenix day (what is holding the capacity). */
export async function readDayCapacity(input: {
  isTest: boolean;
  day: string;
  now: Date;
  excludePostId?: string | null;
}): Promise<XDayCapacity> {
  const sql = getSql();
  const now = input.now.toISOString();
  const exclude = input.excludePostId ?? null;
  const [reserved, permits] = (await sql.transaction(
    [
      sql`
        SELECT id, status, revision, scheduled_for, approval_context->>'authorization' AS authorization
        FROM x_publishing_posts
        WHERE is_test = ${input.isTest} AND account_id = ${X_ACCOUNT_ID} AND scheduled_day = ${input.day}
          AND status IN ('approved','claimed') AND expires_at > ${now}::timestamptz
          AND id IS DISTINCT FROM ${exclude}::uuid
        ORDER BY scheduled_for ASC, id ASC
      `,
      sql`
        SELECT id, post_id, state, permit_issued_at FROM x_publishing_attempts
        WHERE is_test = ${input.isTest} AND permit_day = ${input.day} AND permit_issued_at IS NOT NULL
        ORDER BY permit_issued_at ASC, id ASC
      `,
    ],
    { isolationLevel: "RepeatableRead", readOnly: true }
  )) as Row[][];
  const items: XCapacityItem[] = [
    ...reserved.map(
      (r): XCapacityItem => ({
        kind: "reserved",
        postId: String(r.id),
        status: String(r.status),
        revision: Number(r.revision),
        scheduledFor: toIsoOrNull(r.scheduled_for),
        authorization: r.authorization === "standing_policy" ? "standing_policy" : "owner",
      })
    ),
    ...permits.map(
      (r): XCapacityItem => ({
        kind: "permit",
        attemptId: String(r.id),
        postId: String(r.post_id),
        state: String(r.state),
        permitIssuedAt: toIsoOrNull(r.permit_issued_at),
      })
    ),
  ];
  return {
    day: input.day,
    cap: X_DAILY_CAP,
    reserved: reserved.length,
    permits: permits.length,
    used: reserved.length + permits.length,
    items,
  };
}

function describe(item: XCapacityItem): string {
  if (item.kind === "permit") {
    return `dispatch permit already issued for queue ${item.postId} (attempt ${item.state})`;
  }
  const who = item.authorization === "standing_policy" ? "standing-policy autopilot" : "owner-approved";
  const when = item.scheduledFor ? formatPhoenix(new Date(item.scheduledFor)) : "no time";
  return `queue ${item.postId} ${item.status} (${who}) for ${when}`;
}

export function capacityMessage(c: XDayCapacity): string {
  const blocking = c.items.length > 0 ? ` Holding it: ${c.items.map(describe).join("; ")}.` : "";
  return (
    `Daily capacity reached for Phoenix date ${c.day}: ${c.used} of ${c.cap} used ` +
    `(${c.reserved} reserved, ${c.permits} dispatch permit${c.permits === 1 ? "" : "s"} issued).${blocking} ` +
    "Choose another day or cancel a reserved item — nothing was rescheduled."
  );
}

/** Per-day counts for several days in one read (used for upcoming autopilot slots). */
export function capacityByDayQuery(sql: Sql, isTest: boolean, now: string, days: string[]) {
  return sql.query(
    `SELECT d.day,
       (SELECT COUNT(*)::int FROM x_publishing_posts q
         WHERE q.is_test = $1 AND q.account_id = $4 AND q.scheduled_day = d.day
           AND q.status IN ('approved','claimed') AND q.expires_at > $2::timestamptz) AS reserved,
       (SELECT COUNT(*)::int FROM x_publishing_attempts a
         WHERE a.is_test = $1 AND a.permit_day = d.day AND a.permit_issued_at IS NOT NULL) AS permits
     FROM unnest($3::text[]) AS d(day)`,
    [isTest, now, days, X_ACCOUNT_ID]
  );
}
