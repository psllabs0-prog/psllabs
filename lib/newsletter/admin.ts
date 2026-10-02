import { getSql } from "@/lib/db/sql";
import { SITE_URL } from "@/lib/seo";

import { getNewsletterWelcomeConfig } from "./config";
import { getNewsletterWelcomeSchemaState, NEWSLETTER_SEND_KINDS, type NewsletterSendKind } from "./schema";
import { STALE_AFTER_HOURS } from "./welcome-store";
import {
  buildNewsletterWelcomeEmail,
  NEWSLETTER_SIGNUP_COPY,
  NEWSLETTER_STEP_DELAY_HOURS,
  NEWSLETTER_UTM_CAMPAIGN,
  newsletterTemplateHash,
  type WelcomeKind,
} from "./templates";

type Row = Record<string, unknown>;

export type PartitionCounts = {
  requests: { total: number; pending: number; expired: number; superseded: number; confirmed: number };
  /** singleOptIn: subscription permission only (address not verified). doubleOptIn: address verified by link. */
  subscriptions: { singleOptIn: number; doubleOptIn: number; unsubscribed: number };
  sends: Record<NewsletterSendKind, Record<string, number>>;
};

export type NewsletterWelcomeAdminView = {
  generatedAt: string;
  config: {
    environment: string;
    mode: string;
    modeReason: string;
    journey: { enabled: boolean; reason: string };
    welcome1: { enabled: boolean; reason: string };
    laterSteps: { enabled: boolean; reason: string };
    simulate: boolean;
    obsolete: string[];
    allowlistSize: number;
    prerequisites: { smtp: boolean; fromEmail: boolean; postalAddress: boolean; unsubSecret: boolean; missing: string[] };
  };
  schema: { ready: boolean; missing: string[] };
  live: PartitionCounts | null;
  test: PartitionCounts | null;
  legacySubscribers: { total: number; confirmed: number } | null;
  lastRun: { startedAt: string; finishedAt: string | null; ok: boolean | null; summary: unknown; error: string | null } | null;
  attribution: { available: true; orders: number; revenue: number; note: string } | { available: false; note: string };
  unavailable: Array<{ metric: string; reason: string }>;
  timing: Array<{ kind: WelcomeKind; delayHours: number; staleAfterHours: number }>;
  previews: Array<{ kind: WelcomeKind; templateVersion: string; hash: string; subject: string; text: string; html: string; links: Array<{ label: string; url: string }> }>;
  signupCopy: typeof NEWSLETTER_SIGNUP_COPY;
};

function emptySends(): Record<NewsletterSendKind, Record<string, number>> {
  return Object.fromEntries(NEWSLETTER_SEND_KINDS.map((k) => [k, {}])) as Record<NewsletterSendKind, Record<string, number>>;
}

function partition(rows: { req: Row[]; subs: Row[]; sends: Row[] }, isTest: boolean): PartitionCounts {
  const req = rows.req.find((r) => Boolean(r.is_test) === isTest) ?? {};
  const subs = rows.subs.find((r) => Boolean(r.is_test) === isTest) ?? {};
  const sends = emptySends();
  for (const r of rows.sends.filter((s) => Boolean(s.is_test) === isTest)) {
    sends[r.kind as NewsletterSendKind][String(r.status)] = Number(r.n);
  }
  const n = (v: unknown) => Number(v ?? 0);
  return {
    requests: { total: n(req.total), pending: n(req.pending), expired: n(req.expired), superseded: n(req.superseded), confirmed: n(req.confirmed) },
    subscriptions: { singleOptIn: n(subs.single_opt_in), doubleOptIn: n(subs.double_opt_in), unsubscribed: n(subs.unsubscribed) },
    sends,
  };
}

const WELCOME_KINDS: WelcomeKind[] = ["welcome_1", "welcome_2", "welcome_3"];

function previews(): NewsletterWelcomeAdminView["previews"] {
  const postal = process.env.MARKETING_POSTAL_ADDRESS?.trim() || "[MARKETING_POSTAL_ADDRESS not configured]";
  return WELCOME_KINDS.map((kind) => {
    const built = buildNewsletterWelcomeEmail({ kind, siteUrl: SITE_URL, unsubscribeToken: "nu1_PREVIEW-TOKEN", postalAddress: postal });
    return { kind, templateVersion: built.templateVersion, hash: newsletterTemplateHash(kind), subject: built.subject, text: built.text, html: built.html, links: built.links };
  });
}

/** Read-only. Never creates schema; missing tables produce an explicit "not migrated" view. */
export async function readNewsletterWelcomeAdmin(now = new Date()): Promise<NewsletterWelcomeAdminView> {
  const c = getNewsletterWelcomeConfig();
  const view: NewsletterWelcomeAdminView = {
    generatedAt: now.toISOString(),
    config: {
      environment: c.environment,
      mode: c.mode,
      modeReason: c.modeReason,
      journey: c.journey,
      welcome1: c.welcome1,
      laterSteps: c.laterSteps,
      simulate: c.simulate,
      obsolete: c.obsolete,
      allowlistSize: c.allowlist.size,
      prerequisites: c.prerequisites,
    },
    schema: { ready: false, missing: [] },
    live: null,
    test: null,
    legacySubscribers: null,
    lastRun: null,
    attribution: { available: false, note: "Schema not migrated" },
    unavailable: [
      { metric: "Delivery, bounces, opens", reason: "The SMTP provider reports acceptance only; no delivery or bounce events are received" },
      { metric: "Return sessions", reason: "No Plausible Stats API access is configured; use the Plausible dashboard filtered by utm_campaign=newsletter_welcome_v1" },
      { metric: "Contribution profit, CAC, LTV", reason: "No approved variable-cost evidence for this channel" },
    ],
    timing: [
      { kind: "welcome_1", delayHours: NEWSLETTER_STEP_DELAY_HOURS.welcome_1, staleAfterHours: STALE_AFTER_HOURS.welcome_1 },
      { kind: "welcome_2", delayHours: NEWSLETTER_STEP_DELAY_HOURS.welcome_2, staleAfterHours: STALE_AFTER_HOURS.welcome_2 },
      { kind: "welcome_3", delayHours: NEWSLETTER_STEP_DELAY_HOURS.welcome_3, staleAfterHours: STALE_AFTER_HOURS.welcome_3 },
    ],
    previews: previews(),
    signupCopy: NEWSLETTER_SIGNUP_COPY,
  };

  const sql = getSql();
  const [presence] = (await sql.transaction(
    [
      sql`SELECT to_regclass('public.newsletter_subscribers') IS NOT NULL AS legacy,
                 to_regclass('public.orders') IS NOT NULL AND to_regclass('public.finance_transactions') IS NOT NULL AS orders`,
    ],
    { readOnly: true }
  )) as Row[][];
  const legacyPresent = Boolean(presence[0]?.legacy);
  const ordersPresent = Boolean(presence[0]?.orders);

  if (legacyPresent) {
    const [legacy] = (await sql.transaction(
      [sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE confirmed)::int AS confirmed FROM newsletter_subscribers`],
      { readOnly: true }
    )) as Row[][];
    view.legacySubscribers = { total: Number(legacy[0]?.total ?? 0), confirmed: Number(legacy[0]?.confirmed ?? 0) };
  }

  const schema = await getNewsletterWelcomeSchemaState();
  view.schema = schema;
  if (!schema.ready) return view;

  const t = now.toISOString();
  const queries = [
    sql`
      SELECT is_test, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE confirmed_at IS NULL AND invalidated_at IS NULL AND expires_at > ${t}::timestamptz)::int AS pending,
        COUNT(*) FILTER (WHERE confirmed_at IS NULL AND invalidated_at IS NULL AND expires_at <= ${t}::timestamptz)::int AS expired,
        COUNT(*) FILTER (WHERE confirmed_at IS NULL AND invalidated_at IS NOT NULL)::int AS superseded,
        COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL)::int AS confirmed
      FROM newsletter_consent_requests GROUP BY is_test
    `,
    sql`
      SELECT is_test,
        COUNT(*) FILTER (WHERE status = 'subscribed' AND consent_method = 'single_opt_in')::int AS single_opt_in,
        COUNT(*) FILTER (WHERE status = 'confirmed' AND consent_method = 'double_opt_in')::int AS double_opt_in,
        COUNT(*) FILTER (WHERE status = 'unsubscribed')::int AS unsubscribed
      FROM newsletter_subscriptions GROUP BY is_test
    `,
    sql`SELECT is_test, kind, status, COUNT(*)::int AS n FROM newsletter_email_sends GROUP BY is_test, kind, status`,
    sql`SELECT started_at, finished_at, ok, summary, error_summary FROM newsletter_welcome_runs ORDER BY id DESC LIMIT 1`,
    ordersPresent
      ? sql`
          SELECT COUNT(*)::int AS orders, COALESCE(SUM(o.total), 0)::float AS revenue
          FROM orders o
          WHERE o.status IN ('paid', 'shipped')
            AND (o.attribution->'lastEmail'->>'utmCampaign' = ${NEWSLETTER_UTM_CAMPAIGN}
              OR o.attribution->>'utmCampaign' = ${NEWSLETTER_UTM_CAMPAIGN})
            AND NOT EXISTS (
              SELECT 1 FROM finance_transactions ft WHERE ft.psl_order_id = o.order_id AND ft.reporting_excluded = true
            )
        `
      : sql`SELECT NULL::int AS orders, NULL::float AS revenue`,
  ];
  const [req, subs, sends, runs, attr] = (await sql.transaction(queries, { isolationLevel: "RepeatableRead", readOnly: true })) as Row[][];
  view.live = partition({ req, subs, sends }, false);
  view.test = partition({ req, subs, sends }, true);
  const run = runs[0];
  view.lastRun = run
    ? {
        startedAt: new Date(run.started_at as string).toISOString(),
        finishedAt: run.finished_at ? new Date(run.finished_at as string).toISOString() : null,
        ok: run.ok == null ? null : Boolean(run.ok),
        summary: run.summary ?? null,
        error: run.error_summary ? String(run.error_summary) : null,
      }
    : null;
  view.attribution = ordersPresent
    ? {
        available: true,
        orders: Number(attr[0]?.orders ?? 0),
        revenue: Number(attr[0]?.revenue ?? 0),
        note: "Legitimate paid orders whose attribution record includes a welcome-email visit (each order counted once). Attributed, not incremental.",
      }
    : { available: false, note: "Orders/finance tables not present in this database" };
  return view;
}
