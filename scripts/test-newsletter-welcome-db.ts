/**
 * REAL-database acceptance + concurrency test for the newsletter welcome
 * journey. Opt-in only, and only against an isolated, disposable Neon DB:
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
import { buildNewsletterWelcomeEmail, NEWSLETTER_PUBLIC_MESSAGES as M } from "../lib/newsletter/templates";
import { createConfirmationToken, hashConfirmationToken } from "../lib/newsletter/tokens";
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
let scenario = 0;
/** Each scenario starts 20 days after the last so its rows are stale for later scenarios. */
const scenarioStart = () => BASE + scenario++ * 20 * 24 * H;

const BASE_ENV: Env = {
  NEWSLETTER_WELCOME_MODE: "on",
  NEWSLETTER_CONFIRMATION_SEND_ENABLED: "true",
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
const signup = (email: string, at: number, overrides: Env = {}, ip = nextIp()) =>
  handleNewsletterSignup({ email, placement: "home_newsletter", signupCopyVersion: "signup-v1", ip }, ctx(at, overrides));
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

const CONFIRM_SUBJECT = "Confirm your PSL Labs updates";
const SUBJECT = {
  welcome_1: buildNewsletterWelcomeEmail({ kind: "welcome_1", siteUrl: SITE, unsubscribeToken: "x", postalAddress: "x" }).subject,
  welcome_2: buildNewsletterWelcomeEmail({ kind: "welcome_2", siteUrl: SITE, unsubscribeToken: "x", postalAddress: "x" }).subject,
  welcome_3: buildNewsletterWelcomeEmail({ kind: "welcome_3", siteUrl: SITE, unsubscribeToken: "x", postalAddress: "x" }).subject,
};
const mailsTo = (email: string) => outbox.filter((m) => m.to === email);
const subjectsTo = (email: string) => mailsTo(email).map((m) => m.subject);
function confirmTokenFor(email: string): string {
  const mail = [...mailsTo(email)].reverse().find((m) => m.subject === CONFIRM_SUBJECT);
  const m = mail ? /#t=(nc1_[A-Za-z0-9_-]+)/.exec(mail.text) : null;
  if (!m) throw new Error(`no confirmation link captured for ${email}`);
  return decodeURIComponent(m[1]);
}
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
  for (const [k, v] of Object.entries(BASE_ENV)) process.env[k] = v;
  __setSqlClientForTests(sql);
  __resetNewsletterSchemaCacheForTests();

  await ensureRetentionSchema();
  await ensureNewsletterWelcomeSchema();
  await ensureNewsletterWelcomeSchema();
  assert((await getNewsletterWelcomeSchemaState()).ready, "schema ready after the (idempotent) migration");

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
    (await sql`SELECT status, is_test, confirmed_at, unsubscribed_at FROM newsletter_subscriptions WHERE email = ${email}`) as Row[];
  const reqsFor = async (email: string) =>
    (await sql`
      SELECT token_hash, is_test, confirmed_at, invalidated_at, invalidated_reason, placement, signup_copy_version, consent_text_hash
      FROM newsletter_consent_requests WHERE email = ${email} ORDER BY id
    `) as Row[];
  const prefsFor = async (email: string) =>
    (await sql`SELECT marketing_eligible, unsubscribed_at FROM customer_marketing_preferences WHERE email = ${email}`) as Row[];
  const closeScenario = async (emails: string[]) => {
    await sql`
      UPDATE newsletter_email_sends SET status = 'cancelled', status_reason = 'test_scenario_closed', claim_token = NULL
      WHERE email = ANY(${emails}::text[]) AND status IN ('queued', 'failed', 'attempting')
    `;
  };
  const journeyAddresses: string[] = [];

  let failure: unknown = null;
  try {
    // ------------------------------------------------------------------
    log("signup → pending → deliberate confirmation → welcome 1 → steps 2 and 3");
    {
      const t0 = scenarioStart();
      const a = addr("a");
      journeyAddresses.push(a);
      const r = await signup(a, t0);
      assert(r.status === 200 && r.body.message === M.requested, "signup returns the generic pending message");
      assert(subjectsTo(a).join("|") === CONFIRM_SUBJECT, "exactly one confirmation email, nothing else");
      const confirmMail = mailsTo(a)[0];
      assert(!confirmMail.headers["List-Unsubscribe"], "confirmation email carries no list-unsubscribe header");
      assert(confirmMail.from === "PSL Labs <updates@psllabs.org>" && confirmMail.replyTo === "support@psllabs.org", "from/reply-to");
      const token = confirmTokenFor(a);
      const [req] = await reqsFor(a);
      assert(req && req.confirmed_at === null && req.token_hash === hashConfirmationToken(token), "request pending; only the token hash stored");
      assert(req.placement === "home_newsletter" && req.signup_copy_version === "signup-v1" && typeof req.consent_text_hash === "string", "consent evidence recorded");
      const [hits] = (await sql`
        SELECT (SELECT COUNT(*) FROM newsletter_consent_requests WHERE token_hash = ${token})::int AS raw
      `) as Row[];
      assert(Number(hits.raw) === 0, "raw token never stored");
      let s = await sendsFor(a);
      assert(s.length === 1 && s[0].kind === "confirmation" && s[0].status === "accepted" && String(s[0].provider_queue_id).startsWith("TQ"), "confirmation send accepted with provider queue id");
      assert((await subsFor(a)).length === 0, "not subscribed before confirmation");
      assert((await prefsFor(a)).length === 0, "marketing preferences untouched");

      const get = await confirmGET();
      assert(get.status === 405 && get.headers.get("allow") === "POST", "GET on the confirm API never confirms");
      await job(t0 + 0.5 * H);
      assert((await subsFor(a)).length === 0 && subjectsTo(a).length === 1, "worker sends nothing before confirmation");

      const t1 = t0 + 1 * H;
      const c = await confirm(token, t1);
      assert(c.status === 200 && c.body.status === "confirmed" && c.body.guideEmail === "sent", "deliberate POST confirms and sends the guide");
      assert(subjectsTo(a).join("|") === `${CONFIRM_SUBJECT}|${SUBJECT.welcome_1}`, "welcome 1 sent immediately after confirmation");
      const w1 = mailsTo(a)[1];
      assert(w1.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" && /\/api\/marketing\/unsubscribe\?token=nu1_/.test(w1.headers["List-Unsubscribe"]), "welcome 1 has one-click unsubscribe");
      assert(w1.text.includes("/science/how-to-read-a-coa?utm_source=email&utm_medium=email&utm_campaign=newsletter_welcome_v1&utm_content=welcome_1_guide"), "welcome 1 CTA");
      const [sub] = await subsFor(a);
      assert(sub && sub.status === "confirmed" && sub.is_test === false, "live subscription confirmed");
      s = await sendsFor(a);
      const due = (k: string) => new Date(String(s.find((r) => r.kind === k)!.due_at)).getTime();
      assert(s.length === 4 && s.find((r) => r.kind === "welcome_1")!.status === "accepted", "welcome 1 accepted");
      assert(due("welcome_2") === t1 + 48 * H && due("welcome_3") === t1 + 120 * H, "welcome 2 due at 48h, welcome 3 at 120h");
      assert((await prefsFor(a)).length === 0, "confirmation never sets marketing_eligible");

      const replay = await confirm(token, t1 + H);
      assert(replay.status === 200 && replay.body.status === "already_confirmed" && subjectsTo(a).length === 2, "replayed token: idempotent, no new mail");
      const again = await signup(a, t1 + 2 * H);
      assert(again.status === 200 && again.body.message === M.requested && subjectsTo(a).length === 2, "re-signup of a subscriber: same generic message, no mail");

      await job(t1 + 47 * H);
      assert(subjectsTo(a).length === 2, "welcome 2 not sent before 48h");
      await job(t1 + 48.5 * H);
      assert(subjectsTo(a)[2] === SUBJECT.welcome_2, "welcome 2 sent at 48h");
      assert(mailsTo(a)[2].text.includes("utm_content=welcome_2_reports"), "welcome 2 UTM");
      await job(t1 + 48.6 * H);
      assert(subjectsTo(a).length === 3, "no duplicate welcome 2");
      await job(t1 + 120.5 * H);
      assert(subjectsTo(a)[3] === SUBJECT.welcome_3, "welcome 3 sent at 120h");
      assert(mailsTo(a)[3].text.includes("utm_content=welcome_3_information"), "welcome 3 UTM");
      await job(t1 + 200 * H);
      assert(subjectsTo(a).length === 4, "nothing after welcome 3");
      s = await sendsFor(a);
      const acc = ["welcome_1", "welcome_2", "welcome_3"].map((k) => new Date(String(s.find((r) => r.kind === k)!.accepted_at)).getTime());
      assert(acc[1] - acc[0] >= 24 * H && acc[2] - acc[1] >= 24 * H, "at least 24h between welcome steps");

      const unsubToken = unsubscribeTokenFrom(mailsTo(a)[3]);
      const g = await unsubscribeGET(new Request(`${SITE}/api/marketing/unsubscribe?token=${encodeURIComponent(unsubToken)}`));
      assert(g.status >= 300 && g.status < 400 && (await subsFor(a))[0].status === "confirmed", "unsubscribe GET only redirects (no change)");
      const p = await unsubscribePOST(
        new Request(`${SITE}/api/marketing/unsubscribe?token=${encodeURIComponent(unsubToken)}`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "List-Unsubscribe=One-Click",
        })
      );
      assert(p.status === 200, "one-click unsubscribe accepted");
      const [after] = await subsFor(a);
      assert(after.status === "unsubscribed" && after.unsubscribed_at !== null, "subscription ended");
      const [pref] = await prefsFor(a);
      assert(pref && pref.unsubscribed_at !== null && pref.marketing_eligible === false, "existing marketing unsubscribe recorded");
      const resub = await signup(a, t1 + 300 * H);
      assert(resub.status === 200 && resub.body.message === M.requested && subjectsTo(a).length === 4, "after unsubscribe: generic response, no mail");
      assert((await reqsFor(a)).length === 1, "no new request after unsubscribe");
      const old = await confirm(token, t1 + 301 * H);
      assert(old.status === 410 && old.body.status === "invalid", "an old link can never resubscribe");
      await closeScenario([a]);
    }

    // ------------------------------------------------------------------
    log("concurrent confirmations and signups");
    {
      const t0 = scenarioStart();
      const b = addr("b");
      const c = addr("c");
      journeyAddresses.push(b, c);
      await signup(b, t0);
      const tok = confirmTokenFor(b);
      const results = await Promise.all(Array.from({ length: 5 }, () => confirm(tok, t0 + H)));
      const statuses = results.map((r) => r.body.status).sort();
      assert(statuses.filter((s) => s === "confirmed").length === 1 && statuses.filter((s) => s === "already_confirmed").length === 4, `exactly one confirmation wins (${statuses.join(",")})`);
      assert((await subsFor(b)).length === 1, "one subscription");
      const s = await sendsFor(b);
      assert(s.filter((r) => r.kind !== "confirmation").length === 3, "three step rows");
      assert(subjectsTo(b).filter((x) => x === SUBJECT.welcome_1).length === 1, "welcome 1 sent once");

      const signups = await Promise.all(Array.from({ length: 4 }, () => signup(c, t0 + 2 * H)));
      assert(signups.every((r) => r.status === 200 && r.body.message === M.requested), "concurrent signups get the generic message");
      assert((await reqsFor(c)).length === 1 && subjectsTo(c).length === 1, "concurrent signups create one request and one email");
      await closeScenario([b, c]);
    }

    // ------------------------------------------------------------------
    log("expired, altered, unknown, superseded tokens; cooldown and daily cap");
    {
      const t0 = scenarioStart();
      const d = addr("d");
      const e = addr("e");
      const f = addr("f");
      journeyAddresses.push(d, e, f);
      await signup(d, t0);
      const tok = confirmTokenFor(d);
      const expired = await confirm(tok, t0 + 49 * H);
      assert(expired.status === 410 && (await subsFor(d)).length === 0, "expired token refused");
      const altered = tok.slice(0, -1) + (tok.endsWith("A") ? "B" : "A");
      assert((await confirm(altered, t0 + H)).status === 410, "altered token refused");
      assert((await confirm(createConfirmationToken().token, t0 + H)).status === 410, "unknown token refused");
      assert((await confirm("nc1_short", t0 + H)).status === 410, "malformed token refused");
      assert((await subsFor(d)).length === 0, "no subscription from bad tokens");

      await signup(e, t0);
      const tok1 = confirmTokenFor(e);
      const cool = await signup(e, t0 + 5 * 60_000);
      assert(cool.status === 200 && cool.body.message === M.requested && subjectsTo(e).length === 1, "within cooldown: generic, no mail");
      await signup(e, t0 + 11 * 60_000);
      const tok2 = confirmTokenFor(e);
      assert(tok2 !== tok1 && subjectsTo(e).length === 2, "new link after cooldown");
      const reqs = await reqsFor(e);
      assert(reqs[0].invalidated_reason === "superseded" && reqs[1].invalidated_at === null, "older request superseded");
      assert((await confirm(tok1, t0 + 20 * 60_000)).status === 410, "superseded token refused");
      assert((await confirm(tok2, t0 + 21 * 60_000)).body.status === "confirmed", "newest token confirms");

      for (const m of [0, 11, 22, 33]) await signup(f, t0 + m * 60_000);
      assert(subjectsTo(f).length === 3, "at most 3 confirmation emails per address per day");
      await closeScenario([d, e, f]);
    }

    // ------------------------------------------------------------------
    log("confirmation delivery outcomes are honest and never confirm");
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
      assert(rp.status === 503 && rp.body.error === M.sendFailed, "rejected → send failed message");
      assert(rq.status === 202 && rq.body.message === M.uncertain, "timeout → uncertain message");
      assert(rr.status === 503 && rr.body.error === M.sendFailed, "connection refused → send failed message");
      const [sp] = await sendsFor(p);
      const [sq] = await sendsFor(q);
      const [sr] = await sendsFor(r);
      assert(sp.status === "rejected" && sp.error_category === "rejected_recipient" && sp.accepted_at === null, "rejected recorded");
      assert(sq.status === "unknown" && sq.accepted_at === null, "timeout recorded as unknown");
      assert(sr.status === "failed" && sr.error_category === "connection", "refused recorded as failed");
      for (const x of [p, q, r]) assert((await subsFor(x)).length === 0, `${x.split(".")[0]}: send failure never confirms`);
      await signup(q, t0 + 60_000);
      assert(mailsTo(q).length === 1, "unknown outcome is not retried by a quick re-signup");
      await job(t0 + 10 * H);
      assert(mailsTo(q).length === 1 && mailsTo(p).length === 1, "the worker never retries confirmation emails");
      await closeScenario([p, q, r]);
    }

    // ------------------------------------------------------------------
    log("welcome 1 retry, spacing, unknown outcomes, stale skip, no burst");
    {
      const t0 = scenarioStart();
      const n = addr("n");
      const o = addr("o");
      const m = addr("m");
      journeyAddresses.push(n, o, m);
      const t1 = t0 + H;

      await signup(n, t0);
      transportMode = "refuse";
      const cn = await confirm(confirmTokenFor(n), t1);
      transportMode = "accept";
      assert(cn.body.status === "confirmed" && cn.body.guideEmail === "pending", "confirmation still succeeds when welcome 1 fails");
      assert((await sendOf(n, "welcome_1"))!.status === "failed", "welcome 1 failed (definite)");
      await job(t1 + 30 * H);
      assert((await sendOf(n, "welcome_1"))!.status === "accepted", "welcome 1 retried by the worker");
      await job(t1 + 48.5 * H);
      assert((await sendOf(n, "welcome_2"))!.status === "queued", "welcome 2 held until 24h after welcome 1");
      await job(t1 + 55 * H);
      assert((await sendOf(n, "welcome_2"))!.status === "accepted", "welcome 2 sent once spacing allows");

      await signup(o, t0);
      transportMode = "timeout";
      await confirm(confirmTokenFor(o), t1);
      transportMode = "accept";
      assert((await sendOf(o, "welcome_1"))!.status === "unknown", "ambiguous welcome 1 recorded unknown");
      const oMails = mailsTo(o).length;
      await job(t1 + 48.5 * H);
      assert(mailsTo(o).length === oMails, "unknown welcome 1 never retried; welcome 2 cannot overtake it");
      await job(t1 + 121 * H);
      assert((await sendOf(o, "welcome_2"))!.status === "skipped_stale", "overdue welcome 2 skipped");
      assert((await sendOf(o, "welcome_3"))!.status === "cancelled", "welcome 3 cancelled when its predecessor never sent");
      assert(mailsTo(o).length === oMails, "no burst");

      await signup(m, t0);
      await confirm(confirmTokenFor(m), t1);
      const off = { NEWSLETTER_WELCOME_LATER_STEPS_ENABLED: "false" };
      await job(t1 + 48.5 * H, off);
      assert((await sendOf(m, "welcome_2"))!.status === "queued" && mailsTo(m).length === 2, "later steps disabled: nothing sent");
      await job(t1 + 125 * H);
      assert((await sendOf(m, "welcome_2"))!.status === "skipped_stale" && (await sendOf(m, "welcome_3"))!.status === "cancelled", "re-enabling does not burst old steps");
      assert(mailsTo(m).length === 2, "no catch-up mail");
      await closeScenario([n, o, m]);
    }

    // ------------------------------------------------------------------
    log("suppressions, unsubscribes, and races");
    {
      const t0 = scenarioStart();
      const k = addr("k");
      journeyAddresses.push(k);
      await signup(k, t0);
      await confirm(confirmTokenFor(k), t0 + H);
      await addMarketingSuppression({ email: k, reason: "complaint", source: TAG });
      await job(t0 + 49.5 * H);
      assert((await sendOf(k, "welcome_2"))!.status === "suppressed" && mailsTo(k).length === 2, "suppression between enqueue and dispatch stops the send");

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
        assert(res.status === 200 && res.body.message === M.requested, `${email.split(".")[0]}: generic response`);
        assert(mailsTo(email).length === 0 && (await reqsFor(email)).length === 0, `${email.split(".")[0]}: no mail, no request`);
        assert(JSON.stringify(await prefsFor(email)) === prefsBefore, `${email.split(".")[0]}: preferences unchanged`);
      }

      const g2 = addr("g2");
      journeyAddresses.push(g2);
      await signup(g2, t0);
      const tok = confirmTokenFor(g2);
      await addMarketingSuppression({ email: g2, reason: "hard_bounce", source: TAG });
      assert((await confirm(tok, t0 + H)).status === 410 && (await subsFor(g2)).length === 0, "suppressed after signup: link no longer confirms");

      for (const label of ["race1", "race2", "race3"]) {
        const x = addr(label);
        journeyAddresses.push(x);
        await signup(x, t0 + 3 * H);
        const tk = confirmTokenFor(x);
        await Promise.all([
          confirm(tk, t0 + 4 * H),
          (async () => {
            await markMarketingUnsubscribed(x);
            await markNewsletterUnsubscribed(x, new Date(t0 + 4 * H));
          })(),
        ]);
        const subs = await subsFor(x);
        assert(subs.every((s) => s.status === "unsubscribed" && s.unsubscribed_at !== null), `${label}: unsubscribe wins the final state`);
        const s = await sendsFor(x);
        assert(!s.some((r) => r.status === "queued" || r.status === "failed" || r.status === "attempting"), `${label}: no pending sends remain`);
        assert(!s.some((r) => (r.kind === "welcome_2" || r.kind === "welcome_3") && r.status === "accepted"), `${label}: no later steps sent`);
        await job(t0 + 60 * H);
        assert(!subjectsTo(x).includes(SUBJECT.welcome_2), `${label}: nothing sent after unsubscribe`);
      }
      await closeScenario([k, g2]);
    }

    // ------------------------------------------------------------------
    log("retention coordination and interrupted attempts");
    {
      const t0 = scenarioStart();
      const sAddr = addr("s");
      const u = addr("u");
      journeyAddresses.push(sAddr, u);
      const t1 = t0 + H;
      await signup(sAddr, t0);
      await confirm(confirmTokenFor(sAddr), t1);
      await sql`
        INSERT INTO retention_email_sends (campaign, order_id, email, status, sent_at)
        VALUES ('newsletter-db-test', ${TAG}, ${sAddr}, 'sent', ${new Date(t1 + 40 * H).toISOString()}::timestamptz)
      `;
      await job(t1 + 48.5 * H);
      assert((await sendOf(sAddr, "welcome_2"))!.status === "queued", "welcome 2 deferred within 24h of a retention email");
      await job(t1 + 65 * H);
      assert((await sendOf(sAddr, "welcome_2"))!.status === "accepted", "welcome 2 sent after the retention gap");

      await signup(u, t0);
      await confirm(confirmTokenFor(u), t1);
      await sql`
        UPDATE newsletter_email_sends
        SET status = 'attempting', claim_token = 'crashed', claimed_at = ${new Date(t1 + 48.2 * H).toISOString()}::timestamptz, attempt_count = 1
        WHERE email = ${u} AND kind = 'welcome_2'
      `;
      const before = mailsTo(u).length;
      await job(t1 + 49 * H);
      assert((await sendOf(u, "welcome_2"))!.status === "unknown", "interrupted attempt marked unknown");
      await job(t1 + 121 * H);
      assert(mailsTo(u).length === before, "interrupted attempt never resent and does not unlock welcome 3");
      await closeScenario([sAddr, u]);
    }

    // ------------------------------------------------------------------
    log("kill switches, allowlist test mode, Preview, simulation");
    {
      const t0 = scenarioStart();
      const v = addr("v");
      journeyAddresses.push(v);
      const legacy = "Thank you. You'll receive updates on new batch documentation and product availability.";
      for (const [label, overrides] of [
        ["mode off", { NEWSLETTER_WELCOME_MODE: "off" }],
        ["confirmation send off", { NEWSLETTER_CONFIRMATION_SEND_ENABLED: "false" }],
        ["welcome 1 off", { NEWSLETTER_WELCOME_1_ENABLED: "false" }],
        ["Preview", { VERCEL_ENV: "preview" }],
      ] as Array<[string, Env]>) {
        const x = addr(`kill${label.replace(/\W/g, "")}`);
        const res = await signup(x, t0, overrides);
        assert(res.status === 200 && res.body.message === legacy, `${label}: legacy signup response`);
        assert(mailsTo(x).length === 0 && (await reqsFor(x)).length === 0, `${label}: no new rows, no mail`);
      }
      const pv = await confirm(createConfirmationToken().token, t0, { VERCEL_ENV: "preview" });
      assert(pv.status === 503, "Preview: confirmation unavailable");
      const pj = await job(t0, { VERCEL_ENV: "preview" });
      assert(pj.skipped === true, "Preview: worker skipped");

      await signup(v, t0);
      const gated = await confirm(confirmTokenFor(v), t0 + H, { NEWSLETTER_WELCOME_1_ENABLED: "false" });
      assert(gated.body.status === "confirmed" && gated.body.guideEmail === "pending", "welcome 1 switched off at confirmation: held");
      await job(t0 + 2 * H, { NEWSLETTER_WELCOME_1_ENABLED: "false" });
      assert((await sendOf(v, "welcome_1"))!.status === "queued", "welcome 1 stays queued while off");
      await job(t0 + 3 * H);
      assert((await sendOf(v, "welcome_1"))!.status === "accepted", "welcome 1 sent once switched on");

      const live = addr("live");
      const testAddr = addr("allow");
      journeyAddresses.push(live, testAddr);
      await signup(live, t0 + 4 * H);
      await confirm(confirmTokenFor(live), t0 + 5 * H);
      const allow = { NEWSLETTER_WELCOME_MODE: "allowlist", NEWSLETTER_WELCOME_TEST_ALLOWLIST: testAddr };
      const notListed = await signup(addr("unlisted"), t0 + 4 * H, allow);
      assert(notListed.body.message === legacy && (await reqsFor(addr("unlisted"))).length === 0, "allowlist mode: other addresses use the legacy path");
      await signup(testAddr, t0 + 4 * H, allow);
      const ct = await confirm(confirmTokenFor(testAddr), t0 + 5 * H, allow);
      assert(ct.body.status === "confirmed" && (await subsFor(testAddr))[0].is_test === true, "allowlisted address is a TEST record");
      assert((await sendsFor(testAddr)).every((r) => r.is_test === true), "TEST sends");
      await job(t0 + 5 * H + 48.5 * H, allow);
      assert((await sendOf(live, "welcome_2"))!.status === "queued", "allowlist mode never dispatches live rows");
      assert((await sendOf(testAddr, "welcome_2"))!.status === "accepted", "allowlist mode dispatches TEST rows");

      const simOn = { NEWSLETTER_WELCOME_SIMULATE: "true" };
      const liveSim = addr("livesim");
      journeyAddresses.push(liveSim);
      await signup(liveSim, t0 + 6 * H);
      const cl = await confirm(confirmTokenFor(liveSim), t0 + 7 * H, simOn);
      assert(cl.body.status === "confirmed" && cl.body.guideEmail === "pending", "simulation never consumes a live record's welcome step");
      assert((await sendOf(liveSim, "welcome_1"))!.status === "queued", "live welcome 1 stays queued while simulating");
      await job(t0 + 8 * H, simOn);
      assert((await sendOf(liveSim, "welcome_1"))!.status === "queued", "simulated worker skips live rows");

      const sim = addr("sim");
      journeyAddresses.push(sim);
      const allowSim = { ...allow, NEWSLETTER_WELCOME_TEST_ALLOWLIST: sim };
      await signup(sim, t0 + 6 * H, allowSim);
      const mailsBefore = outbox.length;
      const cs = await confirm(confirmTokenFor(sim), t0 + 7 * H, { ...allowSim, ...simOn });
      assert(cs.body.guideEmail === "simulated" && outbox.length === mailsBefore, "simulation sends nothing");
      const w1 = (await sendOf(sim, "welcome_1"))!;
      assert(w1.status === "simulated" && w1.is_test === true && w1.accepted_at === null && w1.simulated_at !== null, "simulated is a TEST record and not accepted");
      const simSignup = addr("simsignup");
      journeyAddresses.push(simSignup);
      await signup(simSignup, t0 + 6 * H, simOn);
      const [simConf] = await sendsFor(simSignup);
      assert(simConf.status === "simulated" && simConf.is_test === true && outbox.length === mailsBefore, "simulated signup is a TEST record with no mail");
      await closeScenario([v, live, testAddr, liveSim, sim, simSignup]);
    }

    // ------------------------------------------------------------------
    log("IP rate limit and historical subscribers");
    {
      const t0 = scenarioStart();
      const results = [];
      for (let i = 0; i < 6; i++) {
        const x = addr(`ip${i}`);
        journeyAddresses.push(x);
        results.push(await signup(x, t0, {}, "203.0.113.9"));
      }
      assert(results.slice(0, 5).every((r) => r.status === 200) && results[5].status === 429, "6th signup from one IP within an hour is limited");

      const h1 = addr("hist1");
      const h2 = addr("hist2");
      assert((await subscribeNewsletterEmail(h1)).ok && (await subscribeNewsletterEmail(h2)).ok, "legacy rows inserted");
      await sql`UPDATE newsletter_subscribers SET confirmed = true WHERE email = ${h2}`;
      await job(t0 + 200 * H);
      for (const h of [h1, h2]) {
        assert((await reqsFor(h)).length === 0 && (await sendsFor(h)).length === 0 && mailsTo(h).length === 0, "historical subscriber not enrolled");
      }
      await closeScenario(journeyAddresses);
    }

    // ------------------------------------------------------------------
    log("admin view and retention isolation");
    {
      const view = await readNewsletterWelcomeAdmin(new Date(BASE));
      const subscribed = (p: typeof view.live) => (p ? p.subscriptions.confirmed + p.subscriptions.unsubscribed : 0);
      assert(view.schema.ready && subscribed(view.live) > 0 && subscribed(view.test) > 0, "admin shows live and TEST counts separately");
      assert((view.test?.sends.welcome_1.simulated ?? 0) > 0 && !view.live?.sends.welcome_1.simulated, "simulated sends count only as TEST");
      assert(view.attribution.available === false, "attribution unavailable without order tables");
      assert(view.previews.length === 4, "four previews");
      for (const x of journeyAddresses) {
        const prefs = await prefsFor(x);
        assert(prefs.every((p) => p.marketing_eligible === false), `${x.split(".")[0]}: never marketing_eligible`);
      }
      const [rs] = (await sql`SELECT COUNT(*)::int AS n FROM retention_email_sends WHERE email LIKE ${like}`) as Row[];
      assert(Number(rs.n) === 1, "the journey never writes retention sends (only the fixture row exists)");
      assert(refusedHosts.length === 0, "no network access outside the test database");
      assert(outbox.every((mail) => mail.to.endsWith("@example.test")), "every message went to the fake transport for test addresses");
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
