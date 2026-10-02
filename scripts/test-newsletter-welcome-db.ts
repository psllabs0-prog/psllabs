/**
 * REAL-database acceptance + concurrency test for the newsletter welcome
 * journey (single opt-in). Opt-in only, and only against an isolated,
 * disposable Neon DB:
 *
 *   NEWSLETTER_DB_TEST=1 N8N_TEST_DATABASE_URL=<isolated DB URL> npm run test:newsletter-welcome-db
 *
 * SMTP is replaced in-process by a fake transport (no socket is opened) and
 * global fetch is guarded so only the Neon test database is reachable. Time
 * is supplied per call (far-future dates), so scenarios never depend on the
 * wall clock.
 *
 * Refuses to run when the target host matches any application database URL,
 * when the target contains business tables, or when the newsletter welcome
 * tables already hold rows. Deletes only rows it created and verifies
 * cleanup. Never prints connection details or tokens.
 */
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { neon } from "@neondatabase/serverless";

import { GET as confirmGET } from "../app/api/newsletter/confirm/route";
import { GET as unsubscribeGET, POST as unsubscribePOST } from "../app/api/marketing/unsubscribe/route";
import { __setSqlClientForTests } from "../lib/db/sql";
import { readNewsletterWelcomeAdmin } from "../lib/newsletter/admin";
import { getNewsletterWelcomeConfig } from "../lib/newsletter/config";
import { runNewsletterWelcomeJob } from "../lib/newsletter/run";
import {
  __resetNewsletterSchemaCacheForTests,
  ensureNewsletterWelcomeSchema,
  getNewsletterWelcomeSchemaState,
  NEWSLETTER_WELCOME_TABLES,
} from "../lib/newsletter/schema";
import { __setNewsletterTransportForTests, type NewsletterMail } from "../lib/newsletter/send";
import { handleNewsletterConfirm, handleNewsletterSignup, type NewsletterContext } from "../lib/newsletter/service";
import { subscribeNewsletterEmail } from "../lib/newsletter/store";
import {
  buildNewsletterWelcomeEmail,
  NEWSLETTER_PUBLIC_MESSAGES as M,
  NEWSLETTER_SIGNUP_CONSENT,
  NEWSLETTER_SIGNUP_CONSENT_HASH,
} from "../lib/newsletter/templates";
import { CONFIRMATION_TOKEN_TTL_MS, createConfirmationToken, rateLimitKey } from "../lib/newsletter/tokens";
import { markNewsletterUnsubscribed } from "../lib/newsletter/welcome-store";
import { ensureRetentionSchema } from "../lib/retention/schema";
import { addMarketingSuppression, markMarketingUnsubscribed } from "../lib/retention/store";

let passed = 0;
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
  passed++;
}
const log = (m: string) => console.log(`[newsletter-db] ${m}`);

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace("-pooler.", ".");
  } catch {
    return null;
  }
}

function applicationDatabaseHosts(): Set<string> {
  const hosts = new Set<string>();
  const add = (v: string | undefined) => {
    const h = hostOf(v?.trim().replace(/^["']|["']$/g, ""));
    if (h) hosts.add(h);
  };
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== "N8N_TEST_DATABASE_URL" && /DATABASE_URL|POSTGRES_URL/.test(k)) add(v);
  }
  for (const file of [".env.local", ".env", ".env.production", ".env.production.local"]) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]*(?:DATABASE_URL|POSTGRES_URL)[A-Z0-9_]*)\s*=\s*(.+)$/.exec(line);
      if (m) add(m[2]);
    }
  }
  return hosts;
}

type Row = Record<string, unknown>;
type Env = Record<string, string | undefined>;

const TAG = `nltest${Date.now().toString(36)}`;
const SITE = "https://www.psllabs.org";
const addr = (label: string) => `${label}.${TAG}@example.test`;
const H = 3_600_000;
const BASE = Date.parse("2031-05-01T15:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
let scenario = 0;
/** Each scenario starts 20 days after the last so its rows are stale for later scenarios. */
const scenarioStart = () => BASE + scenario++ * 20 * 24 * H;

const BASE_ENV: Env = {
  NEWSLETTER_WELCOME_MODE: "on",
  NEWSLETTER_WELCOME_1_ENABLED: "true",
  NEWSLETTER_WELCOME_LATER_STEPS_ENABLED: "true",
  SMTP_HOST: "smtp.invalid",
  SMTP_USER: "fake-test-user",
  SMTP_PASSWORD: "fake-test-password",
  MARKETING_FROM_EMAIL: "updates@psllabs.org",
  MARKETING_POSTAL_ADDRESS: "Test postal address",
  MARKETING_UNSUB_SECRET: crypto.randomBytes(32).toString("hex"),
};

let ipSeq = 0;
const nextIp = () => {
  ipSeq++;
  return `10.${(ipSeq >> 8) & 255}.${ipSeq & 255}.7`;
};

function ctx(at: number, overrides: Env = {}): NewsletterContext {
  return { now: new Date(at), config: getNewsletterWelcomeConfig({ ...BASE_ENV, ...overrides }), siteUrl: SITE };
}
const signup = (email: string, at: number, overrides: Env = {}, ip = nextIp(), signupCopyVersion = "signup-v2") =>
  handleNewsletterSignup({ email, placement: "home_newsletter", signupCopyVersion, ip, sameOrigin: true }, ctx(at, overrides));
const confirm = (token: string, at: number, overrides: Env = {}) => handleNewsletterConfirm({ token }, ctx(at, overrides));
const job = (at: number, overrides: Env = {}) => runNewsletterWelcomeJob(ctx(at, overrides));

// ---- fake SMTP -------------------------------------------------------------
type TransportMode = "accept" | "reject" | "timeout" | "refuse";
let transportMode: TransportMode = "accept";
const outbox: NewsletterMail[] = [];
let queueSeq = 0;
__setNewsletterTransportForTests(async (mail) => {
  outbox.push(mail);
  if (transportMode === "reject") {
    throw Object.assign(new Error("Can't send mail - all recipients were rejected"), {
      code: "EENVELOPE",
      responseCode: 550,
      command: "RCPT TO",
      response: "550 5.1.1 no such user",
    });
  }
  if (transportMode === "timeout") throw Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" });
  if (transportMode === "refuse") throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:465"), { code: "ESOCKET" });
  queueSeq++;
  return { messageId: mail.messageId, response: `250 2.0.0 Ok: queued as TQ${queueSeq}X${TAG}`, accepted: [mail.to], rejected: [] };
});

const RETIRED_CONFIRM_SUBJECT = "Confirm your PSL Labs updates";
const SUBJECT = {
  welcome_1: buildNewsletterWelcomeEmail({ kind: "welcome_1", siteUrl: SITE, unsubscribeToken: "x", postalAddress: "x" }).subject,
  welcome_2: buildNewsletterWelcomeEmail({ kind: "welcome_2", siteUrl: SITE, unsubscribeToken: "x", postalAddress: "x" }).subject,
  welcome_3: buildNewsletterWelcomeEmail({ kind: "welcome_3", siteUrl: SITE, unsubscribeToken: "x", postalAddress: "x" }).subject,
};
const mailsTo = (email: string) => outbox.filter((m) => m.to === email);
const subjectsTo = (email: string) => mailsTo(email).map((m) => m.subject);
function unsubscribeTokenFrom(mail: NewsletterMail): string {
  const m = /token=([^>&\s]+)/.exec(mail.headers["List-Unsubscribe"] ?? "");
  if (!m) throw new Error("welcome email has no List-Unsubscribe token");
  return decodeURIComponent(m[1]);
}

async function main() {
  if (process.env.NEWSLETTER_DB_TEST !== "1") {
    console.log("[newsletter-db] skipped: set NEWSLETTER_DB_TEST=1 and N8N_TEST_DATABASE_URL (isolated DB only).");
    return;
  }
  const url = process.env.N8N_TEST_DATABASE_URL?.trim();
  const target = hostOf(url);
  if (!url || !target) throw new Error("N8N_TEST_DATABASE_URL is required.");
  if (applicationDatabaseHosts().has(target)) {
    throw new Error("Refusing: the test database host matches an application database. Use an isolated database.");
  }

  const refusedHosts: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const h = u.hostname.toLowerCase();
    if (!h.endsWith(".neon.tech")) {
      refusedHosts.push(h);
      throw new Error(`Network access refused in test: ${h}`);
    }
    return realFetch(input, init);
  }) as typeof fetch;

  const sql = neon(url);
  const [biz] = (await sql`
    SELECT to_regclass('public.orders') AS orders,
           to_regclass('public.finance_transactions') AS finance,
           to_regclass('public.support_escalations') AS support
  `) as Row[];
  if (biz.orders || biz.finance || biz.support) {
    throw new Error("Refusing: the test database contains business tables; it is not isolated.");
  }

  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.NEWSLETTER_CONFIRMATION_SEND_ENABLED;
  for (const [k, v] of Object.entries(BASE_ENV)) process.env[k] = v;
  __setSqlClientForTests(sql);
  __resetNewsletterSchemaCacheForTests();

  await ensureRetentionSchema();
  await ensureNewsletterWelcomeSchema();

  const tableCounts = async () => {
    const out: Record<string, number> = {};
    for (const t of NEWSLETTER_WELCOME_TABLES) {
      const [r] = (await sql.query(`SELECT COUNT(*)::int AS n FROM ${t}`)) as Row[];
      out[t] = Number(r.n);
    }
    return out;
  };
  const before = await tableCounts();
  if (Object.values(before).some((n) => n > 0)) {
    throw new Error(`Refusing: newsletter welcome tables are not empty in the test database (${JSON.stringify(before)}).`);
  }
  const like = `%${TAG}%`;
  const taggedRetention = async () => {
    const [r] = (await sql`
      SELECT (SELECT COUNT(*) FROM customer_marketing_preferences WHERE email LIKE ${like})::int AS prefs,
             (SELECT COUNT(*) FROM marketing_suppressions WHERE email LIKE ${like})::int AS suppressions,
             (SELECT COUNT(*) FROM retention_email_sends WHERE email LIKE ${like})::int AS retention_sends,
             (SELECT CASE WHEN to_regclass('public.newsletter_subscribers') IS NULL THEN 0
                     ELSE (SELECT COUNT(*) FROM newsletter_subscribers WHERE email LIKE ${like}) END)::int AS legacy
    `) as Row[];
    return r;
  };

  const sendsFor = async (email: string) =>
    (await sql`
      SELECT id::text AS id, kind, status, status_reason, attempt_count, accepted_at, simulated_at, due_at,
             error_category, provider_queue_id, message_id, is_test
      FROM newsletter_email_sends WHERE email = ${email} ORDER BY id
    `) as Row[];
  const sendOf = async (email: string, kind: string) => (await sendsFor(email)).find((r) => r.kind === kind);
  const subsFor = async (email: string) =>
    (await sql`
      SELECT status, is_test, consent_method, request_id, confirmed_at, subscribed_at, unsubscribed_at,
             placement, signup_copy_version, consent_version, consent_text_hash
      FROM newsletter_subscriptions WHERE email = ${email} ORDER BY id
    `) as Row[];
  const reqsFor = async (email: string) =>
    (await sql`SELECT confirmed_at, invalidated_at FROM newsletter_consent_requests WHERE email = ${email} ORDER BY id`) as Row[];
  const prefsFor = async (email: string) =>
    (await sql`SELECT marketing_eligible, unsubscribed_at FROM customer_marketing_preferences WHERE email = ${email}`) as Row[];
  /** An older double-opt-in request (issued before single opt-in); no email is sent for it here. */
  const seedPendingRequest = async (email: string, at: number, isTest = false) => {
    const { token, hash } = createConfirmationToken();
    await sql`
      INSERT INTO newsletter_consent_requests (
        email, is_test, token_hash, placement, signup_copy_version, consent_version, consent_text_hash, created_at, expires_at
      ) VALUES (${email}, ${isTest}, ${hash}, 'home_newsletter', 'signup-v1', 'confirmation-v1', 'historical-consent-hash',
                ${iso(at)}::timestamptz, ${iso(at + CONFIRMATION_TOKEN_TTL_MS)}::timestamptz)
    `;
    return token;
  };
  const closeScenario = async (emails: string[]) => {
    await sql`
      UPDATE newsletter_email_sends SET status = 'cancelled', status_reason = 'test_scenario_closed', claim_token = NULL
      WHERE email = ANY(${emails}::text[]) AND status IN ('queued', 'failed', 'attempting')
    `;
  };
  const rejects = async (q: () => Promise<unknown>) => {
    try {
      await q();
      return false;
    } catch {
      return true;
    }
  };
  const journeyAddresses: string[] = [];

  let failure: unknown = null;
  try {
    // ------------------------------------------------------------------
    log("v2 schema adjustment: deploy-before-migrate stays legacy; existing double-opt-in rows keep their label");
    const hv1 = addr("hv1");
    {
      // Recreate the exact first-release shape of the (empty) table so the upgrade path is exercised every run.
      await sql`ALTER TABLE newsletter_subscriptions DROP CONSTRAINT IF EXISTS newsletter_subscriptions_consent_method_check`;
      await sql`ALTER TABLE newsletter_subscriptions DROP COLUMN IF EXISTS consent_method, DROP COLUMN IF EXISTS subscribed_at`;
      await sql`ALTER TABLE newsletter_subscriptions ALTER COLUMN request_id SET NOT NULL, ALTER COLUMN confirmed_at SET NOT NULL`;
      await sql`
        ALTER TABLE newsletter_subscriptions
          DROP CONSTRAINT IF EXISTS newsletter_subscriptions_status_check,
          ADD CONSTRAINT newsletter_subscriptions_status_check CHECK (status IN ('confirmed', 'unsubscribed'))
      `;
      __resetNewsletterSchemaCacheForTests();
      const v1 = await getNewsletterWelcomeSchemaState();
      assert(!v1.ready && v1.missing.join() === "newsletter_subscriptions.consent_method", "first-release schema is reported as not ready (v2 column missing)");

      const t0 = scenarioStart();
      const early = addr("early");
      const r = await signup(early, t0);
      assert(r.status === 200 && r.body.message === "Thank you. You'll receive updates on new batch documentation and product availability.", "before the v2 migration: legacy signup response");
      assert((await sendsFor(early)).length === 0 && mailsTo(early).length === 0, "before the v2 migration: no enrollment and no mail");
      assert((await confirm(createConfirmationToken().token, t0)).status === 503, "before the v2 migration: confirmation unavailable");
      assert(((await job(t0)) as { skipped: boolean }).skipped === true, "before the v2 migration: daily run skipped");

      const [req] = (await sql`
        INSERT INTO newsletter_consent_requests (
          email, is_test, token_hash, placement, signup_copy_version, consent_version, consent_text_hash, created_at, expires_at, confirmed_at
        ) VALUES (${hv1}, false, ${createConfirmationToken().hash}, 'home_newsletter', 'signup-v1', 'confirmation-v1', 'historical-consent-hash',
                  ${iso(t0 - 2 * H)}::timestamptz, ${iso(t0 + 46 * H)}::timestamptz, ${iso(t0 - H)}::timestamptz)
        RETURNING id
      `) as Row[];
      await sql`
        INSERT INTO newsletter_subscriptions (
          public_id, email, is_test, status, request_id, placement, signup_copy_version, consent_version, consent_text_hash,
          confirmed_at, created_at, updated_at
        ) VALUES (${`ns_${TAG}_hv1`}, ${hv1}, false, 'confirmed', ${req.id}, 'home_newsletter', 'signup-v1', 'confirmation-v1',
                  'historical-consent-hash', ${iso(t0 - H)}::timestamptz, ${iso(t0 - H)}::timestamptz, ${iso(t0 - H)}::timestamptz)
      `;

      await ensureNewsletterWelcomeSchema();
      await ensureNewsletterWelcomeSchema();
      __resetNewsletterSchemaCacheForTests();
      assert((await getNewsletterWelcomeSchemaState()).ready, "schema ready after the (idempotent) migration");
      const [old] = await subsFor(hv1);
      assert(
        old.consent_method === "double_opt_in" && old.status === "confirmed" && new Date(String(old.confirmed_at)).getTime() === t0 - H && old.subscribed_at === null,
        "existing row labelled double opt-in with its confirmation time preserved; nothing fabricated"
      );
      const cols = (await sql`
        SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'newsletter_subscriptions' AND column_name IN ('request_id', 'confirmed_at', 'consent_method', 'subscribed_at')
      `) as Row[];
      assert(cols.length === 4 && cols.filter((c) => c.column_name !== "consent_method").every((c) => c.is_nullable === "YES"), "v2 columns present; request/confirmation fields optional");

      const bad = (method: string, status: string, requestId: string | null, confirmedAt: string | null, subscribedAt: string | null) => () =>
        sql`
          INSERT INTO newsletter_subscriptions (
            public_id, email, is_test, status, consent_method, request_id, placement, signup_copy_version, consent_version, consent_text_hash,
            confirmed_at, subscribed_at, created_at, updated_at
          ) VALUES (${`ns_${TAG}_bad${crypto.randomBytes(4).toString("hex")}`}, ${addr("badrow")}, true, ${status}, ${method}, ${requestId}::bigint,
                    'x', 'x', 'x', 'x', ${confirmedAt}::timestamptz, ${subscribedAt}::timestamptz, now(), now())
        `;
      const ts = iso(t0);
      assert(await rejects(bad("single_opt_in", "subscribed", null, ts, ts)), "constraint: a single-opt-in row cannot claim a confirmation time");
      assert(await rejects(bad("single_opt_in", "confirmed", null, null, ts)), "constraint: a single-opt-in row cannot use the verified status");
      assert(await rejects(bad("single_opt_in", "subscribed", "1", null, ts)), "constraint: a single-opt-in row cannot reference a confirmation request");
      assert(await rejects(bad("single_opt_in", "subscribed", null, null, null)), "constraint: a single-opt-in row needs its submission time");
      assert(await rejects(bad("double_opt_in", "confirmed", null, ts, ts)), "constraint: a double-opt-in row needs its confirmation request");
      assert(await rejects(bad("double_opt_in", "subscribed", "1", ts, ts)), "constraint: double opt-in keeps the confirmed status");
      assert(await rejects(bad("other", "subscribed", null, null, ts)), "constraint: unknown consent methods refused");
      assert((await subsFor(addr("badrow"))).length === 0, "no invalid rows stored");
    }

    // ------------------------------------------------------------------
    log("single opt-in: one signup → one subscription and Welcome 1 → steps 2 and 3 → unsubscribe");
    {
      const t0 = scenarioStart();
      const a = addr("a");
      journeyAddresses.push(a);
      const r = await signup(a, t0);
      assert(r.status === 200 && r.body.ok === true && r.body.message === M.received, "signup returns the accurate, generic acknowledgement");
      assert(subjectsTo(a).join("|") === SUBJECT.welcome_1, "exactly one email (Welcome 1); zero confirmation emails");
      assert((await reqsFor(a)).length === 0, "no confirmation request or token created");
      const w1 = mailsTo(a)[0];
      assert(w1.text.includes("Thanks for subscribing.") && !/confirm/i.test(w1.text), "Welcome 1 says “Thanks for subscribing”");
      assert(w1.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" && /\/api\/marketing\/unsubscribe\?token=nu1_/.test(w1.headers["List-Unsubscribe"]), "Welcome 1 has one-click unsubscribe");
      assert(w1.from === "PSL Labs <updates@psllabs.org>" && w1.replyTo === "support@psllabs.org", "from/reply-to");
      assert(w1.text.includes("/science/how-to-read-a-coa?utm_source=email&utm_medium=email&utm_campaign=newsletter_welcome_v1&utm_content=welcome_1_guide"), "Welcome 1 CTA");
      const subs = await subsFor(a);
      assert(subs.length === 1, "one subscription");
      const sub = subs[0];
      assert(sub.consent_method === "single_opt_in" && sub.status === "subscribed" && sub.is_test === false, "recorded as live single opt-in");
      assert(sub.confirmed_at === null && sub.request_id === null, "no verification event fabricated");
      assert(new Date(String(sub.subscribed_at)).getTime() === t0, "submission timestamp recorded");
      assert(
        sub.placement === "home_newsletter" && sub.signup_copy_version === "signup-v2" &&
          sub.consent_version === NEWSLETTER_SIGNUP_CONSENT.version && sub.consent_text_hash === NEWSLETTER_SIGNUP_CONSENT_HASH,
        "placement and exact consent-copy version/hash recorded"
      );
      let s = await sendsFor(a);
      const due = (k: string) => new Date(String(s.find((x) => x.kind === k)!.due_at)).getTime();
      assert(s.length === 3 && !s.some((x) => x.kind === "confirmation"), "three welcome step rows, no confirmation row");
      const w1Row = s.find((x) => x.kind === "welcome_1")!;
      assert(w1Row.status === "accepted" && String(w1Row.provider_queue_id).startsWith("TQ"), "Welcome 1 accepted with provider queue id");
      assert(due("welcome_1") === t0 && due("welcome_2") === t0 + 48 * H && due("welcome_3") === t0 + 120 * H, "sequence timed from the signup");
      assert((await prefsFor(a)).length === 0, "signup never sets marketing_eligible");

      const get = await confirmGET();
      assert(get.status === 405, "GET on the confirm API never confirms");

      const again = await signup(a, t0 + 2 * H);
      assert(again.status === 200 && again.body.message === M.received && subjectsTo(a).length === 1, "re-signup of a subscriber: same message, no mail");
      assert((await subsFor(a)).length === 1 && (await sendsFor(a)).length === 3, "re-signup: no new subscription or steps");

      await job(t0 + 47 * H);
      assert(subjectsTo(a).length === 1, "Welcome 2 not sent before 48h");
      await job(t0 + 48.5 * H);
      assert(subjectsTo(a)[1] === SUBJECT.welcome_2 && mailsTo(a)[1].text.includes("utm_content=welcome_2_reports"), "Welcome 2 sent at 48h");
      await job(t0 + 48.6 * H);
      assert(subjectsTo(a).length === 2, "no duplicate Welcome 2");
      await job(t0 + 120.5 * H);
      assert(subjectsTo(a)[2] === SUBJECT.welcome_3 && mailsTo(a)[2].text.includes("utm_content=welcome_3_information"), "Welcome 3 sent at 120h");
      await job(t0 + 200 * H);
      assert(subjectsTo(a).length === 3, "nothing after Welcome 3");
      s = await sendsFor(a);
      const acc = ["welcome_1", "welcome_2", "welcome_3"].map((k) => new Date(String(s.find((x) => x.kind === k)!.accepted_at)).getTime());
      assert(acc[1] - acc[0] >= 24 * H && acc[2] - acc[1] >= 24 * H, "at least 24h between welcome steps");

      const unsubToken = unsubscribeTokenFrom(mailsTo(a)[2]);
      const g = await unsubscribeGET(new Request(`${SITE}/api/marketing/unsubscribe?token=${encodeURIComponent(unsubToken)}`));
      assert(g.status >= 300 && g.status < 400 && (await subsFor(a))[0].status === "subscribed", "unsubscribe GET only redirects (no change)");
      const p = await unsubscribePOST(
        new Request(`${SITE}/api/marketing/unsubscribe?token=${encodeURIComponent(unsubToken)}`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "List-Unsubscribe=One-Click",
        })
      );
      assert(p.status === 200, "one-click unsubscribe accepted");
      const [after] = await subsFor(a);
      assert(after.status === "unsubscribed" && after.unsubscribed_at !== null && after.consent_method === "single_opt_in", "subscription ended; consent method unchanged");
      const [pref] = await prefsFor(a);
      assert(pref && pref.unsubscribed_at !== null && pref.marketing_eligible === false, "existing marketing unsubscribe recorded");
      const resub = await signup(a, t0 + 300 * H);
      assert(resub.status === 200 && resub.body.message === M.received && subjectsTo(a).length === 3, "after unsubscribe: same message, no mail");
      const [still] = await subsFor(a);
      assert((await subsFor(a)).length === 1 && still.status === "unsubscribed", "an unauthenticated signup never resubscribes an opt-out");
      await closeScenario([a]);
    }

    // ------------------------------------------------------------------
    log("repeated clicks, retries, and concurrent submissions");
    {
      const t0 = scenarioStart();
      const b = addr("b");
      journeyAddresses.push(b);
      const results = await Promise.all(Array.from({ length: 5 }, () => signup(b, t0)));
      assert(results.every((r) => r.status === 200 && r.body.message === M.received), "every concurrent submission gets the same acknowledgement");
      assert((await subsFor(b)).length === 1 && (await sendsFor(b)).length === 3, "one subscription and one set of steps");
      assert(subjectsTo(b).filter((x) => x === SUBJECT.welcome_1).length === 1 && mailsTo(b).length === 1, "Welcome 1 sent once");
      for (let i = 1; i <= 3; i++) await signup(b, t0 + i * 5 * 60_000 + H);
      assert((await subsFor(b)).length === 1 && mailsTo(b).length === 1, "network retries never repeat the sequence");

      const bt = addr("btest");
      journeyAddresses.push(bt);
      await signup(bt, t0, { NEWSLETTER_WELCOME_MODE: "allowlist", NEWSLETTER_WELCOME_TEST_ALLOWLIST: bt });
      await signup(bt, t0 + H);
      assert((await subsFor(bt)).length === 1 && (await subsFor(bt))[0].is_test === true && mailsTo(bt).length === 1, "an active TEST subscription also blocks a second (live) enrollment");
      await closeScenario([b, bt]);
    }

    // ------------------------------------------------------------------
    log("durable address, IP, and global limits constrain enrollment and sends");
    {
      const t0 = scenarioStart();
      const results = [];
      const ipAddrs: string[] = [];
      for (let i = 0; i < 6; i++) {
        const x = addr(`ip${i}`);
        ipAddrs.push(x);
        journeyAddresses.push(x);
        results.push(await signup(x, t0, {}, "203.0.113.9"));
      }
      assert(results.slice(0, 5).every((r) => r.status === 200) && results[5].status === 429 && results[5].body.error === M.rateLimited, "6th signup from one IP within an hour is limited");
      assert((await subsFor(ipAddrs[5])).length === 0 && mailsTo(ipAddrs[5]).length === 0, "IP-limited submission: no enrollment, no mail");

      const al = addr("addrlimit");
      journeyAddresses.push(al);
      await sql`
        INSERT INTO newsletter_rate_limits (bucket, window_start, count)
        VALUES (${rateLimitKey("email", al)!}, date_trunc('hour', ${iso(t0 + 2 * H)}::timestamptz), 5)
      `;
      const limited = await signup(al, t0 + 2 * H);
      assert(limited.status === 200 && limited.body.message === M.received, "address limit: same acknowledgement (no list-membership signal)");
      assert((await subsFor(al)).length === 0 && mailsTo(al).length === 0, "address limit: no enrollment, no mail");
      await signup(al, t0 + 3 * H);
      assert((await subsFor(al)).length === 1 && mailsTo(al).length === 1, "address limit resets in the next hourly window");

      const gl = addr("globallimit");
      journeyAddresses.push(gl);
      await sql`
        INSERT INTO newsletter_rate_limits (bucket, window_start, count)
        VALUES ('global:signup', date_trunc('hour', ${iso(t0 + 5 * H)}::timestamptz), 100)
      `;
      const gr = await signup(gl, t0 + 5 * H);
      assert(gr.status === 503 && (await subsFor(gl)).length === 0 && mailsTo(gl).length === 0, "global hourly cap: refused before any enrollment or mail");
      await closeScenario([...ipAddrs, al, gl]);
    }

    // ------------------------------------------------------------------
    log("Welcome 1 outcomes at signup are honest; ambiguous results are never resent");
    {
      const t0 = scenarioStart();
      const p = addr("p");
      const q = addr("q");
      const r = addr("r");
      journeyAddresses.push(p, q, r);
      transportMode = "reject";
      const rp = await signup(p, t0);
      transportMode = "timeout";
      const rq = await signup(q, t0);
      transportMode = "refuse";
      const rr = await signup(r, t0);
      transportMode = "accept";
      for (const res of [rp, rq, rr]) assert(res.status === 200 && res.body.message === M.received, "acknowledgement reflects the committed subscription, not SMTP");
      const wp = (await sendOf(p, "welcome_1"))!;
      const wq = (await sendOf(q, "welcome_1"))!;
      const wr = (await sendOf(r, "welcome_1"))!;
      assert(wp.status === "rejected" && wp.error_category === "rejected_recipient" && wp.accepted_at === null, "rejected recorded");
      assert(wq.status === "unknown" && wq.accepted_at === null, "timeout recorded as unknown");
      assert(wr.status === "failed" && wr.error_category === "connection", "refused recorded as failed");
      await signup(q, t0 + 60_000);
      await job(t0 + 10 * H);
      assert(mailsTo(q).length === 1 && mailsTo(p).length === 1, "unknown and rejected Welcome 1 never resent");
      assert(mailsTo(r).length === 2 && (await sendOf(r, "welcome_1"))!.status === "accepted", "definite failure retried by the daily run");
      await closeScenario([p, q, r]);
    }

    // ------------------------------------------------------------------
    log("spacing, stale steps, later-step switch, no burst");
    {
      const t0 = scenarioStart();
      const n = addr("n");
      const o = addr("o");
      const m = addr("m");
      journeyAddresses.push(n, o, m);

      transportMode = "refuse";
      await signup(n, t0);
      transportMode = "accept";
      await job(t0 + 30 * H);
      assert((await sendOf(n, "welcome_1"))!.status === "accepted", "Welcome 1 retried by the worker");
      await job(t0 + 48.5 * H);
      assert((await sendOf(n, "welcome_2"))!.status === "queued", "Welcome 2 held until 24h after Welcome 1");
      await job(t0 + 55 * H);
      assert((await sendOf(n, "welcome_2"))!.status === "accepted", "Welcome 2 sent once spacing allows");

      transportMode = "timeout";
      await signup(o, t0);
      transportMode = "accept";
      const oMails = mailsTo(o).length;
      await job(t0 + 48.5 * H);
      assert(mailsTo(o).length === oMails, "unknown Welcome 1 never retried; Welcome 2 cannot overtake it");
      await job(t0 + 121 * H);
      assert((await sendOf(o, "welcome_2"))!.status === "skipped_stale", "overdue Welcome 2 skipped");
      assert((await sendOf(o, "welcome_3"))!.status === "cancelled", "Welcome 3 cancelled when its predecessor never sent");
      assert(mailsTo(o).length === oMails, "no burst");

      await signup(m, t0);
      const off = { NEWSLETTER_WELCOME_LATER_STEPS_ENABLED: "false" };
      await job(t0 + 48.5 * H, off);
      assert((await sendOf(m, "welcome_2"))!.status === "queued" && mailsTo(m).length === 1, "later steps disabled: nothing sent");
      await job(t0 + 125 * H);
      assert((await sendOf(m, "welcome_2"))!.status === "skipped_stale" && (await sendOf(m, "welcome_3"))!.status === "cancelled", "re-enabling does not burst old steps");
      assert(mailsTo(m).length === 1, "no catch-up mail");
      await closeScenario([n, o, m]);
    }

    // ------------------------------------------------------------------
    log("suppressions, unsubscribes, and races");
    {
      const t0 = scenarioStart();
      const k = addr("k");
      journeyAddresses.push(k);
      await signup(k, t0);
      await addMarketingSuppression({ email: k, reason: "complaint", source: TAG });
      await job(t0 + 49.5 * H);
      assert((await sendOf(k, "welcome_2"))!.status === "suppressed" && mailsTo(k).length === 1, "suppression between enqueue and dispatch stops the send");

      const blocked: Array<[string, () => Promise<void>]> = [
        [addr("g"), async () => addMarketingSuppression({ email: addr("g"), reason: "hard_bounce", source: TAG })],
        [addr("h"), async () => addMarketingSuppression({ email: addr("h"), reason: "complaint", source: TAG })],
        [addr("i"), async () => addMarketingSuppression({ email: addr("i"), reason: "qa_internal", source: TAG })],
        [addr("j"), async () => markMarketingUnsubscribed(addr("j"))],
      ];
      for (const [email, block] of blocked) {
        await block();
        const prefsBefore = JSON.stringify(await prefsFor(email));
        const res = await signup(email, t0 + 2 * H);
        assert(res.status === 200 && res.body.message === M.received, `${email.split(".")[0]}: same acknowledgement`);
        assert(mailsTo(email).length === 0 && (await subsFor(email)).length === 0 && (await sendsFor(email)).length === 0, `${email.split(".")[0]}: no subscription, no mail`);
        assert(JSON.stringify(await prefsFor(email)) === prefsBefore, `${email.split(".")[0]}: suppression/preferences unchanged`);
      }
      const blockedEmails = [k, ...blocked.map(([email]) => email)];
      const [supp] = (await sql`SELECT COUNT(DISTINCT email)::int AS n FROM marketing_suppressions WHERE email = ANY(${blockedEmails}::text[])`) as Row[];
      assert(Number(supp.n) === 5, "suppressions are never cleared by a signup");

      const g2 = addr("g2");
      journeyAddresses.push(g2);
      transportMode = "refuse";
      await signup(g2, t0);
      transportMode = "accept";
      await addMarketingSuppression({ email: g2, reason: "hard_bounce", source: TAG });
      await job(t0 + 10 * H);
      assert((await sendOf(g2, "welcome_1"))!.status === "suppressed" && mailsTo(g2).length === 1, "suppression re-checked immediately before the Welcome 1 retry");

      for (const label of ["race1", "race2", "race3"]) {
        const x = addr(label);
        journeyAddresses.push(x);
        await Promise.all([
          signup(x, t0 + 4 * H),
          (async () => {
            await markMarketingUnsubscribed(x);
            await markNewsletterUnsubscribed(x, new Date(t0 + 4 * H));
          })(),
        ]);
        const subs = await subsFor(x);
        assert(subs.every((s) => s.status === "unsubscribed" && s.unsubscribed_at !== null), `${label}: unsubscribe wins the final state`);
        const s = await sendsFor(x);
        assert(!s.some((r) => r.status === "queued" || r.status === "failed" || r.status === "attempting"), `${label}: no pending sends remain`);
        await job(t0 + 60 * H);
        assert(!subjectsTo(x).includes(SUBJECT.welcome_2), `${label}: nothing sent after unsubscribe`);
      }
      await closeScenario([k, g2]);
    }

    // ------------------------------------------------------------------
    log("older confirmation links: not auto-enrolled, still valid until expiry, never duplicate or override");
    {
      const t0 = scenarioStart();
      const o1 = addr("old1");
      const o2 = addr("old2");
      const o3 = addr("old3");
      const o4 = addr("old4");
      const o5 = addr("old5");
      journeyAddresses.push(o1, o2, o3, o4, o5);
      const tk1 = await seedPendingRequest(o1, t0);
      const tk2 = await seedPendingRequest(o2, t0);
      const tk3 = await seedPendingRequest(o3, t0);
      const tk4 = await seedPendingRequest(o4, t0);
      const tk5 = await seedPendingRequest(o5, t0);
      await job(t0 + H);
      for (const x of [o1, o2, o3, o4, o5]) {
        assert((await subsFor(x)).length === 0 && (await sendsFor(x)).length === 0 && mailsTo(x).length === 0, `${x.split(".")[0]}: pending request not enrolled by deployment or the daily run`);
      }

      const c1 = await confirm(tk1, t0 + 2 * H);
      assert(c1.status === 200 && c1.body.status === "confirmed" && c1.body.guideEmail === "sent", "a valid older link still confirms");
      const [s1] = await subsFor(o1);
      assert(s1.consent_method === "double_opt_in" && s1.status === "confirmed" && s1.request_id !== null && s1.confirmed_at !== null, "older link recorded as double opt-in (address verified)");
      assert(subjectsTo(o1).join("|") === SUBJECT.welcome_1, "older link: Welcome 1 only, no confirmation email");
      const replay = await confirm(tk1, t0 + 3 * H);
      assert(replay.status === 200 && replay.body.status === "already_confirmed" && mailsTo(o1).length === 1, "replayed link: idempotent, no new mail");
      await signup(o1, t0 + 3 * H);
      assert((await subsFor(o1)).length === 1 && mailsTo(o1).length === 1, "new signup after an old-link confirmation: no duplicate");

      await signup(o2, t0 + 2 * H);
      assert((await subsFor(o2))[0].consent_method === "single_opt_in" && mailsTo(o2).length === 1, "fresh signup with a pending old link enrolls as single opt-in");
      const c2 = await confirm(tk2, t0 + 3 * H);
      assert(c2.status === 200 && c2.body.status === "already_confirmed", "old link after a single-opt-in signup reports already subscribed");
      const s2 = await subsFor(o2);
      assert(s2.length === 1 && s2[0].consent_method === "single_opt_in" && s2[0].confirmed_at === null && mailsTo(o2).length === 1, "old link neither duplicates nor relabels the single-opt-in consent");

      assert((await confirm(tk3, t0 + 49 * H)).status === 410 && (await subsFor(o3)).length === 0, "older link refused after its normal expiry");

      await markMarketingUnsubscribed(o4);
      assert((await confirm(tk4, t0 + 2 * H)).status === 410 && (await subsFor(o4)).length === 0, "older link can never undo an opt-out");

      await Promise.all([signup(o5, t0 + 2 * H), confirm(tk5, t0 + 2 * H), signup(o5, t0 + 2 * H), confirm(tk5, t0 + 2 * H)]);
      assert((await subsFor(o5)).length === 1 && mailsTo(o5).length === 1, "concurrent old link and new signup: one subscription, one Welcome 1");

      const o6 = addr("old6");
      journeyAddresses.push(o6);
      const tk6 = await seedPendingRequest(o6, t0);
      const allowOther = { NEWSLETTER_WELCOME_MODE: "allowlist", NEWSLETTER_WELCOME_TEST_ALLOWLIST: addr("someoneelse") };
      assert((await confirm(tk6, t0 + 2 * H, allowOther)).status === 503 && (await subsFor(o6)).length === 0, "allowlist mode: older links for other addresses unavailable");
      await closeScenario([o1, o2, o3, o4, o5, o6]);
    }

    // ------------------------------------------------------------------
    log("off, obsolete confirmation switch, allowlist, Preview, simulation, legacy forms");
    {
      const t0 = scenarioStart();
      const legacy = "Thank you. You'll receive updates on new batch documentation and product availability.";
      for (const [label, overrides] of [
        ["mode off", { NEWSLETTER_WELCOME_MODE: "off" }],
        ["welcome 1 off", { NEWSLETTER_WELCOME_1_ENABLED: "false" }],
        ["Preview", { VERCEL_ENV: "preview" }],
      ] as Array<[string, Env]>) {
        const x = addr(`kill${label.replace(/\W/g, "")}`);
        const res = await signup(x, t0, overrides);
        assert(res.status === 200 && res.body.message === legacy, `${label}: legacy signup response`);
        assert(mailsTo(x).length === 0 && (await subsFor(x)).length === 0 && (await sendsFor(x)).length === 0, `${label}: no new rows, no mail`);
      }
      const lf = addr("legacyform");
      const lfr = await signup(lf, t0, {}, nextIp(), "legacy-v0");
      assert(lfr.body.message === legacy && (await subsFor(lf)).length === 0 && mailsTo(lf).length === 0, "a form without the consent wording never enrolls");
      const pv = await confirm(createConfirmationToken().token, t0, { VERCEL_ENV: "preview" });
      assert(pv.status === 503, "Preview: confirmation unavailable");
      const pj = await job(t0, { VERCEL_ENV: "preview" });
      assert(pj.skipped === true, "Preview: worker skipped");

      for (const value of ["false", "true"]) {
        const x = addr(`obsolete${value}`);
        journeyAddresses.push(x);
        await signup(x, t0 + H, { NEWSLETTER_CONFIRMATION_SEND_ENABLED: value });
        assert(subjectsTo(x).join("|") === SUBJECT.welcome_1 && (await reqsFor(x)).length === 0, `confirmation switch = ${value}: ignored (single opt-in, no confirmation email)`);
      }

      const v = addr("v");
      journeyAddresses.push(v);
      transportMode = "refuse";
      await signup(v, t0 + H);
      transportMode = "accept";
      await job(t0 + 2 * H, { NEWSLETTER_WELCOME_1_ENABLED: "false" });
      assert((await sendOf(v, "welcome_1"))!.status === "failed" && mailsTo(v).length === 1, "Welcome 1 held while switched off");
      await job(t0 + 3 * H);
      assert((await sendOf(v, "welcome_1"))!.status === "accepted", "Welcome 1 sent once switched on");

      const live = addr("live");
      const testAddr = addr("allow");
      journeyAddresses.push(live, testAddr);
      await signup(live, t0 + 4 * H);
      const allow = { NEWSLETTER_WELCOME_MODE: "allowlist", NEWSLETTER_WELCOME_TEST_ALLOWLIST: testAddr };
      const unlisted = addr("unlisted");
      const notListed = await signup(unlisted, t0 + 4 * H, allow);
      assert(notListed.body.message === legacy && (await subsFor(unlisted)).length === 0, "allowlist mode: other addresses use the legacy path");
      await signup(testAddr, t0 + 4 * H, allow);
      const [ts] = await subsFor(testAddr);
      assert(ts.is_test === true && ts.consent_method === "single_opt_in" && subjectsTo(testAddr).join("|") === SUBJECT.welcome_1, "allowlisted address: TEST single-opt-in record and Welcome 1");
      assert((await sendsFor(testAddr)).every((r) => r.is_test === true), "TEST sends");
      await job(t0 + 4 * H + 48.5 * H, allow);
      assert((await sendOf(live, "welcome_2"))!.status === "queued", "allowlist mode never dispatches live rows");
      assert((await sendOf(testAddr, "welcome_2"))!.status === "accepted", "allowlist mode dispatches TEST rows");

      const simOn = { NEWSLETTER_WELCOME_SIMULATE: "true" };
      const liveSim = addr("livesim");
      journeyAddresses.push(liveSim);
      transportMode = "refuse";
      await signup(liveSim, t0 + 6 * H);
      transportMode = "accept";
      await job(t0 + 8 * H, simOn);
      assert((await sendOf(liveSim, "welcome_1"))!.status === "failed", "simulated worker never consumes a live record's step");

      const mailsBefore = outbox.length;
      const sim = addr("sim");
      journeyAddresses.push(sim);
      await signup(sim, t0 + 6 * H, { ...allow, NEWSLETTER_WELCOME_TEST_ALLOWLIST: sim, ...simOn });
      const simSignup = addr("simsignup");
      journeyAddresses.push(simSignup);
      await signup(simSignup, t0 + 6 * H, simOn);
      for (const x of [sim, simSignup]) {
        const [sx] = await subsFor(x);
        const w1 = (await sendOf(x, "welcome_1"))!;
        assert(sx.is_test === true && w1.status === "simulated" && w1.is_test === true && w1.accepted_at === null && w1.simulated_at !== null, `${x.split(".")[0]}: simulation is a TEST record and not accepted`);
      }
      assert(outbox.length === mailsBefore, "simulation sends nothing");
      await closeScenario([v, live, testAddr, liveSim, sim, simSignup, addr("obsoletefalse"), addr("obsoletetrue")]);
    }

    // ------------------------------------------------------------------
    log("historical records: no bulk enrollment; a fresh explicit submission can enroll");
    {
      const t0 = scenarioStart();
      const h1 = addr("hist1");
      const h2 = addr("hist2");
      journeyAddresses.push(h1);
      assert((await subscribeNewsletterEmail(h1)).ok && (await subscribeNewsletterEmail(h2)).ok, "legacy rows inserted");
      await sql`UPDATE newsletter_subscribers SET confirmed = true WHERE email = ${h2}`;
      await job(t0 + 200 * H);
      for (const h of [h1, h2, hv1]) {
        assert((await sendsFor(h)).length === 0 && mailsTo(h).length === 0, `${h.split(".")[0]}: historical record not enrolled`);
      }
      const [legacyCount] = (await sql`SELECT COUNT(*)::int AS n FROM newsletter_subscribers WHERE email IN (${h1}, ${h2})`) as Row[];
      assert(Number(legacyCount.n) === 2, "legacy rows preserved");
      assert((await subsFor(h2)).length === 0, "legacy “confirmed” flag is not converted into a subscription");

      await signup(h1, t0 + 201 * H);
      assert((await subsFor(h1))[0]?.consent_method === "single_opt_in" && subjectsTo(h1).join("|") === SUBJECT.welcome_1, "fresh explicit submission under the new wording enrolls a legacy address");
      await signup(hv1, t0 + 201 * H);
      const hv = await subsFor(hv1);
      assert(hv.length === 1 && hv[0].consent_method === "double_opt_in" && mailsTo(hv1).length === 0, "already-active historical subscription preserved; no duplicate sequence");
      await closeScenario(journeyAddresses);
    }

    // ------------------------------------------------------------------
    log("admin view, consent labels, retention isolation");
    {
      const view = await readNewsletterWelcomeAdmin(new Date(BASE));
      assert(view.schema.ready && (view.live?.subscriptions.singleOptIn ?? 0) > 0 && (view.test?.subscriptions.singleOptIn ?? 0) > 0, "admin counts single opt-in for live and TEST separately");
      const [dbl] = (await sql`
        SELECT COUNT(*)::int AS n FROM newsletter_subscriptions WHERE NOT is_test AND status = 'confirmed' AND consent_method = 'double_opt_in'
      `) as Row[];
      assert(view.live?.subscriptions.doubleOptIn === Number(dbl.n) && Number(dbl.n) >= 2, "admin counts verified (double-opt-in) subscriptions separately");
      const [single] = (await sql`
        SELECT COUNT(*)::int AS n FROM newsletter_subscriptions WHERE NOT is_test AND status = 'subscribed'
      `) as Row[];
      assert(view.live?.subscriptions.singleOptIn === Number(single.n), "single opt-in is never counted as address verification");
      assert((view.test?.sends.welcome_1.simulated ?? 0) > 0 && !view.live?.sends.welcome_1.simulated, "simulated sends count only as TEST");
      assert(view.attribution.available === false, "attribution unavailable without order tables");
      assert(view.previews.length === 3 && view.previews.every((p) => p.kind !== ("confirmation" as string)), "three welcome previews, no confirmation preview");
      for (const x of journeyAddresses) {
        const prefs = await prefsFor(x);
        assert(prefs.every((p) => p.marketing_eligible === false), `${x.split(".")[0]}: never marketing_eligible`);
      }
      const [rs] = (await sql`SELECT COUNT(*)::int AS n FROM retention_email_sends WHERE email LIKE ${like}`) as Row[];
      assert(Number(rs.n) === 0, "the journey never writes retention sends");
      assert(refusedHosts.length === 0, "no network access outside the test database");
      assert(outbox.every((mail) => mail.to.endsWith("@example.test")), "every message went to the fake transport for test addresses");
      assert(!outbox.some((mail) => mail.subject === RETIRED_CONFIRM_SUBJECT), "zero confirmation emails across the whole run");
      const [confRows] = (await sql`SELECT COUNT(*)::int AS n FROM newsletter_email_sends WHERE kind = 'confirmation'`) as Row[];
      assert(Number(confRows.n) === 0, "zero confirmation-send rows across the whole run");
    }

    // ------------------------------------------------------------------
    log("retention coordination and interrupted attempts");
    {
      const t0 = scenarioStart();
      const sAddr = addr("s");
      const u = addr("u");
      journeyAddresses.push(sAddr, u);
      await signup(sAddr, t0);
      await sql`
        INSERT INTO retention_email_sends (campaign, order_id, email, status, sent_at)
        VALUES ('newsletter-db-test', ${TAG}, ${sAddr}, 'sent', ${iso(t0 + 40 * H)}::timestamptz)
      `;
      await job(t0 + 48.5 * H);
      assert((await sendOf(sAddr, "welcome_2"))!.status === "queued", "Welcome 2 deferred within 24h of a retention email");
      await job(t0 + 65 * H);
      assert((await sendOf(sAddr, "welcome_2"))!.status === "accepted", "Welcome 2 sent after the retention gap");

      await signup(u, t0);
      await sql`
        UPDATE newsletter_email_sends
        SET status = 'attempting', claim_token = 'crashed', claimed_at = ${iso(t0 + 48.2 * H)}::timestamptz, attempt_count = 1
        WHERE email = ${u} AND kind = 'welcome_2'
      `;
      const beforeMails = mailsTo(u).length;
      await job(t0 + 49 * H);
      assert((await sendOf(u, "welcome_2"))!.status === "unknown", "interrupted attempt marked unknown");
      await job(t0 + 121 * H);
      assert(mailsTo(u).length === beforeMails, "interrupted attempt never resent and does not unlock Welcome 3");
      await closeScenario([sAddr, u]);
    }
  } catch (e) {
    failure = e;
  } finally {
    let cleanupError: unknown = null;
    try {
      await sql`DELETE FROM newsletter_email_sends WHERE email LIKE ${like}`;
      await sql`DELETE FROM newsletter_subscriptions WHERE email LIKE ${like}`;
      await sql`DELETE FROM newsletter_consent_requests WHERE email LIKE ${like}`;
      await sql`DELETE FROM newsletter_rate_limits`;
      await sql`DELETE FROM newsletter_welcome_runs`;
      await sql`DELETE FROM customer_marketing_preferences WHERE email LIKE ${like}`;
      await sql`DELETE FROM marketing_suppressions WHERE email LIKE ${like}`;
      await sql`DELETE FROM retention_email_sends WHERE email LIKE ${like}`;
      if ((await sql`SELECT to_regclass('public.newsletter_subscribers') IS NOT NULL AS ok`)[0]?.ok) {
        await sql`DELETE FROM newsletter_subscribers WHERE email LIKE ${like}`;
      }
      const afterTables = await tableCounts();
      const afterRetention = await taggedRetention();
      if (Object.values(afterTables).some((n) => n > 0) || Object.values(afterRetention).some((n) => Number(n) > 0)) {
        throw new Error(`cleanup incomplete: ${JSON.stringify({ afterTables, afterRetention })}`);
      }
      log("cleanup verified: newsletter welcome tables empty; 0 tagged preference/suppression/retention/legacy rows");
    } catch (e) {
      cleanupError = e;
    }
    __setSqlClientForTests(null);
    __setNewsletterTransportForTests(null);
    globalThis.fetch = realFetch;
    if (failure) throw failure;
    if (cleanupError) throw cleanupError;
  }
  console.log(`\n[newsletter-db] ${passed} real-database assertions passed (SMTP simulated in-process; no mail left this machine).`);
}

main().catch((error) => {
  console.error("[newsletter-db] FAILED — treat as an incomplete run:", error instanceof Error ? error.message : error);
  process.exit(1);
});
