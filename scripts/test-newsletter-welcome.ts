/**
 * Offline tests for the newsletter welcome journey. No network, no database:
 * a recording fake SQL client proves which statements run (none while the
 * journey is off), SMTP is replaced by an in-process fake transport.
 * Run: npm run test:newsletter-welcome
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { NeonQueryFunction } from "@neondatabase/serverless";

import { GET as cronGET } from "../app/api/cron/newsletter-welcome/route";
import { GET as unsubGET } from "../app/api/marketing/unsubscribe/route";
import { GET as confirmGET, POST as confirmPOST } from "../app/api/newsletter/confirm/route";
import { POST as signupPOST } from "../app/api/newsletter/route";
import { isEmailTouch, isPaidTouch, mergePaidTouch, parseTouchFromSearchParams, pruneStoredAttribution, sanitizeAttributionFromBody, toOrderAttribution } from "../lib/attribution/logic";
import { __setSqlClientForTests } from "../lib/db/sql";
import { readNewsletterWelcomeAdmin } from "../lib/newsletter/admin";
import { getNewsletterWelcomeConfig, newsletterSignupVariant, routeNewsletterSignup } from "../lib/newsletter/config";
import { NEWSLETTER_SIGNUP_COPY } from "../lib/newsletter/copy";
import { __resetNewsletterSchemaCacheForTests } from "../lib/newsletter/schema";
import { __setNewsletterTransportForTests, classifySmtpError, deliverNewsletterEmail, type NewsletterMail } from "../lib/newsletter/send";
import { isSameOriginSignup } from "../lib/newsletter/service";
import {
  buildNewsletterWelcomeEmail,
  NEWSLETTER_PUBLIC_MESSAGES,
  NEWSLETTER_SIGNUP_CONSENT,
  NEWSLETTER_SIGNUP_CONSENT_HASH,
  NEWSLETTER_TEMPLATE_VERSIONS,
} from "../lib/newsletter/templates";
import {
  createConfirmationToken,
  createNewsletterUnsubscribeToken,
  hashConfirmationToken,
  isConfirmationTokenShape,
  newSubscriptionPublicId,
  verifyNewsletterUnsubscribeToken,
} from "../lib/newsletter/tokens";
import { PLAUSIBLE_TRANSFORM_REQUEST_JS } from "../lib/plausible/redact";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "../lib/retention/config";

let passed = 0;
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
  passed++;
}
const section = (name: string) => console.log(`[newsletter] ${name}`);

const ROOT = process.cwd();
const SITE = "https://www.psllabs.org";
const POSTAL = "TEST POSTAL ADDRESS LINE";
const BASE_ENV = {
  SMTP_HOST: "smtp.invalid",
  SMTP_USER: "user",
  SMTP_PASSWORD: "pass",
  MARKETING_FROM_EMAIL: "updates@psllabs.org",
  MARKETING_POSTAL_ADDRESS: POSTAL,
  MARKETING_UNSUB_SECRET: "offline-test-secret",
};
const NEWSLETTER_KEYS = [
  "NEWSLETTER_WELCOME_MODE",
  "NEWSLETTER_WELCOME_TEST_ALLOWLIST",
  "NEWSLETTER_WELCOME_SIMULATE",
  "NEWSLETTER_CONFIRMATION_SEND_ENABLED",
  "NEWSLETTER_WELCOME_1_ENABLED",
  "NEWSLETTER_WELCOME_LATER_STEPS_ENABLED",
  "VERCEL_ENV",
  "VERCEL",
  "CRON_SECRET",
  "DATABASE_URL",
  "POSTGRES_URL",
];

function setEnv(values: Record<string, string | undefined>) {
  for (const k of [...NEWSLETTER_KEYS, ...Object.keys(BASE_ENV)]) delete process.env[k];
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...values })) if (v !== undefined) process.env[k] = v;
}

// ---------- recording fake SQL client ----------
type Handler = (text: string, values: unknown[]) => unknown[];
const statements: string[] = [];
let handler: Handler = () => [];
function fakeSql(strings: TemplateStringsArray, ...values: unknown[]) {
  const text = strings.join("$?").replace(/\s+/g, " ").trim();
  statements.push(text);
  return Promise.resolve(handler(text, values));
}
fakeSql.query = (text: string) => {
  statements.push(text.replace(/\s+/g, " ").trim());
  return Promise.resolve([]);
};
fakeSql.transaction = async (queries: Array<Promise<unknown>>) => Promise.all(queries);
function installFakeSql(h: Handler = () => []) {
  statements.length = 0;
  handler = h;
  __resetNewsletterSchemaCacheForTests();
  __setSqlClientForTests(fakeSql as unknown as NeonQueryFunction<false, false>);
}
const touched = (pattern: RegExp) => statements.filter((s) => pattern.test(s));
const NEW_TABLES = /newsletter_(consent_requests|subscriptions|email_sends|rate_limits|welcome_runs)/;

// ---------- fake SMTP ----------
const sent: NewsletterMail[] = [];
__setNewsletterTransportForTests(async (mail) => {
  sent.push(mail);
  return { messageId: mail.messageId, response: "250 2.0.0 Ok: queued as ABC123DEF", accepted: [mail.to], rejected: [] };
});

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

async function main() {
  // ---------- configuration ----------
  section("configuration fails closed");
  {
    setEnv({});
    let c = getNewsletterWelcomeConfig();
    assert(c.mode === "off" && !c.journey.enabled, "unset mode is off");
    assert(routeNewsletterSignup("a@b.co", c).path === "legacy", "off routes every signup to the legacy path");
    assert(newsletterSignupVariant(c) === "legacy", "off keeps the legacy signup copy");

    setEnv({ NEWSLETTER_WELCOME_MODE: "yes please" });
    assert(getNewsletterWelcomeConfig().mode === "off", "unrecognised mode is off");

    const allOn = { NEWSLETTER_WELCOME_MODE: "on", NEWSLETTER_WELCOME_1_ENABLED: "true" };
    setEnv({ ...allOn, VERCEL_ENV: "preview" });
    c = getNewsletterWelcomeConfig();
    assert(c.mode === "off" && !c.journey.enabled && /Preview/.test(c.modeReason), "Preview is always off, even with every flag on");

    setEnv({ ...allOn, NEWSLETTER_WELCOME_1_ENABLED: undefined });
    c = getNewsletterWelcomeConfig();
    assert(!c.journey.enabled && /NEWSLETTER_WELCOME_1_ENABLED/.test(c.journey.reason), "journey needs Welcome 1 enabled");

    setEnv(allOn);
    c = getNewsletterWelcomeConfig();
    assert(c.journey.enabled && c.obsolete.length === 0, "single opt-in needs no confirmation switch");
    setEnv({ ...allOn, NEWSLETTER_CONFIRMATION_SEND_ENABLED: "false" });
    c = getNewsletterWelcomeConfig();
    assert(c.journey.enabled && c.obsolete.join() === "NEWSLETTER_CONFIRMATION_SEND_ENABLED", "the confirmation switch is ignored and reported as obsolete");
    setEnv({ ...allOn, NEWSLETTER_CONFIRMATION_SEND_ENABLED: "true" });
    assert(!("confirmationSend" in getNewsletterWelcomeConfig()), "no confirmation gate exists to re-enable confirmation emails");

    setEnv({ ...allOn, MARKETING_POSTAL_ADDRESS: undefined });
    c = getNewsletterWelcomeConfig();
    assert(!c.journey.enabled && c.prerequisites.missing.includes("MARKETING_POSTAL_ADDRESS"), "journey needs the configured postal address");

    setEnv({ ...allOn, MARKETING_UNSUB_SECRET: undefined });
    assert(!getNewsletterWelcomeConfig().journey.enabled, "journey needs the existing unsubscribe secret");

    setEnv({ ...allOn, NEWSLETTER_WELCOME_MODE: "allowlist" });
    c = getNewsletterWelcomeConfig();
    assert(!c.journey.enabled && /ALLOWLIST/.test(c.journey.reason), "allowlist mode with an empty allowlist is off");

    setEnv({ ...allOn, NEWSLETTER_WELCOME_MODE: "allowlist", NEWSLETTER_WELCOME_TEST_ALLOWLIST: "QA@Example.com, not-an-email" });
    c = getNewsletterWelcomeConfig();
    assert(c.journey.enabled && c.allowlist.size === 1, "allowlist parsed (invalid entries ignored)");
    const listed = routeNewsletterSignup("qa@example.com", c);
    assert(listed.path === "journey" && listed.isTest === true, "allowlisted address takes the journey as a TEST record");
    assert(routeNewsletterSignup("someone@else.com", c).path === "legacy", "non-allowlisted address stays on the legacy path");
    assert(newsletterSignupVariant(c) === "legacy", "allowlist mode never shows the new form on the normal home page");
    assert(newsletterSignupVariant(c, { allowlistTestView: true }) === "welcome", "allowlist mode shows the consent form only on the test URL");
    setEnv({ ...allOn, NEWSLETTER_WELCOME_MODE: "allowlist" });
    assert(newsletterSignupVariant(getNewsletterWelcomeConfig(), { allowlistTestView: true }) === "legacy", "test URL shows nothing new while the journey is disabled");
    setEnv({});
    assert(newsletterSignupVariant(getNewsletterWelcomeConfig(), { allowlistTestView: true }) === "legacy", "test URL shows nothing new while off");
    setEnv({ ...allOn, NEWSLETTER_WELCOME_MODE: "allowlist", NEWSLETTER_WELCOME_TEST_ALLOWLIST: "QA@Example.com" });
    c = getNewsletterWelcomeConfig();

    setEnv(allOn);
    c = getNewsletterWelcomeConfig();
    const live = routeNewsletterSignup("someone@else.com", c);
    assert(live.path === "journey" && live.isTest === false, "on mode routes ordinary signups as live records");
    assert(newsletterSignupVariant(c) === "welcome", "on mode shows the new signup copy");
    assert(!c.laterSteps.enabled, "Welcome 2 and 3 stay off unless separately enabled");

    setEnv({ ...allOn, NEWSLETTER_WELCOME_SIMULATE: "true", SMTP_HOST: undefined });
    c = getNewsletterWelcomeConfig();
    const sim = routeNewsletterSignup("someone@else.com", c);
    assert(c.journey.enabled && sim.path === "journey" && sim.isTest, "simulation needs no SMTP and creates TEST records only");
  }

  // ---------- tokens ----------
  section("tokens are unguessable, hashed, and purpose-separated");
  {
    setEnv({});
    const a = createConfirmationToken();
    const b = createConfirmationToken();
    assert(a.token !== b.token && isConfirmationTokenShape(a.token) && a.token.length === 47, "confirmation token: 256-bit random, fixed shape");
    assert(a.hash === hashConfirmationToken(a.token) && a.hash !== a.token && !a.hash.includes(a.token), "only a SHA-256 hash is stored");
    assert(!isConfirmationTokenShape(`${a.token}x`) && !isConfirmationTokenShape(a.token.slice(0, -1)), "altered confirmation tokens rejected by shape");
    const pid = newSubscriptionPublicId();
    const unsub = createNewsletterUnsubscribeToken(pid);
    assert(verifyNewsletterUnsubscribeToken(unsub).ok, "newsletter unsubscribe token verifies");
    assert(!unsub.includes("@") && !Buffer.from(unsub.slice(4), "base64url").toString("utf8").includes("@"), "unsubscribe token contains no address");
    const tampered = unsub.slice(0, -1) + (unsub.endsWith("0") ? "1" : "0");
    assert(!verifyNewsletterUnsubscribeToken(tampered).ok, "altered unsubscribe signature rejected");
    assert(!verifyNewsletterUnsubscribeToken(a.token).ok, "a confirmation token is not an unsubscribe token");
    assert(!verifyUnsubscribeToken(unsub).ok, "the legacy verifier rejects the newsletter token");
    assert(!verifyNewsletterUnsubscribeToken(createUnsubscribeToken("x@example.com")).ok, "the newsletter verifier rejects legacy tokens");
    assert(!isConfirmationTokenShape(unsub), "an unsubscribe token cannot confirm");
  }

  // ---------- templates ----------
  section("templates: copy, links, UTMs, footer");
  {
    setEnv({});
    const pid = newSubscriptionPublicId();
    const unsubTok = createNewsletterUnsubscribeToken(pid);
    const expect = {
      welcome_1: { subject: "Your PSL report-reading guide", content: "welcome_1_guide", paths: ["/guides/verify-peptide-laboratory-report"] },
      welcome_2: { subject: "Finding the report that matches your label", content: "welcome_2_reports", paths: ["/coa", "/guides/peptide-purity-vs-content", "/contact"] },
      welcome_3: { subject: "Where to find PSL product and order information", content: "welcome_3_information", paths: ["/products", "/shipping", "/faq", "/contact"] },
    } as const;
    const banned = /\b(dos(e|es|ing|age)|inject|administ|benefit|efficac|safe to|testimonial|review(s|ed)? from|discount|% off|coupon|bundle|limited time|hurry|only \d+ left|in stock|ships (in|within)|deliver(ed|y) (in|within)|free shipping|solvent|bacteriostatic|purity of \d|\d+(\.\d+)?\s?%)/i;
    for (const kind of ["welcome_1", "welcome_2", "welcome_3"] as const) {
      const e = buildNewsletterWelcomeEmail({ kind, siteUrl: SITE, unsubscribeToken: unsubTok, postalAddress: POSTAL });
      assert(e.subject === expect[kind].subject, `${kind}: subject per Appendix A`);
      assert(e.templateVersion === NEWSLETTER_TEMPLATE_VERSIONS[kind], `${kind}: versioned template`);
      const content = e.links.filter((l) => l.label !== "Unsubscribe");
      assert(content.map((l) => new URL(l.url).pathname).join() === expect[kind].paths.join(), `${kind}: CTA destinations ${expect[kind].paths.join(", ")}`);
      for (const l of content) {
        const u = new URL(l.url);
        assert(u.origin === SITE, `${kind}: links stay on ${SITE}`);
        assert(
          u.searchParams.get("utm_source") === "email" && u.searchParams.get("utm_medium") === "email" &&
            u.searchParams.get("utm_campaign") === "newsletter_welcome_v1" && u.searchParams.get("utm_content") === expect[kind].content &&
            [...u.searchParams.keys()].length === 4,
          `${kind}: exact UTMs only (${l.url})`
        );
        assert(!/@|token|nu1_|nc1_/i.test(l.url), `${kind}: no address or token in campaign links`);
        assert(e.text.includes(l.url) && e.html.includes(l.url.replace(/&/g, "&amp;")), `${kind}: link present in text and HTML`);
      }
      const unsub = e.links.find((l) => l.label === "Unsubscribe")!;
      assert(unsub.url === `${SITE}/unsubscribe?token=${unsubTok}` && !unsub.url.includes("utm_"), `${kind}: visible unsubscribe link (no UTMs)`);
      assert(e.listUnsubscribeUrl === `${SITE}/api/marketing/unsubscribe?token=${unsubTok}`, `${kind}: List-Unsubscribe points at the one-click POST endpoint`);
      assert(e.text.includes(POSTAL) && e.text.includes("PSL Group LLC") && e.text.includes("Support: support@psllabs.org"), `${kind}: sender identity and postal address`);
      assert(e.html.includes(POSTAL) && /Unsubscribe<\/a>/.test(e.html), `${kind}: HTML footer with unsubscribe link`);
      assert(!banned.test(e.text) && !banned.test(e.subject), `${kind}: no dosing, benefits, claims, urgency, discounts, stock, or shipping promises`);
      assert(!/\b(batch|lot)\s*(#|no\.?|id)?\s*[A-Z0-9]{4,}/.test(e.text.replace(/https?:\S+/g, "")), `${kind}: no hard-coded batch identifiers`);
      assert(e.text.includes("You are receiving this because you signed up for PSL Labs emails on psllabs.org."), `${kind}: footer describes the website signup`);
      assert(!/confirm/i.test(e.text) && !/confirm/i.test(e.html), `${kind}: never refers to a confirmation`);
      assert(e.templateVersion.endsWith("-v3"), `${kind}: documentation copy has a new template version`);
    }
    const w1Text = buildNewsletterWelcomeEmail({ kind: "welcome_1", siteUrl: SITE, unsubscribeToken: unsubTok, postalAddress: POSTAL }).text;
    assert(w1Text.includes("Thanks for subscribing.") && !/thanks for confirming/i.test(w1Text), "Welcome 1 says “Thanks for subscribing”");
    assert(!/follow-up|next few days|two (short )?(more )?emails|we.ll (also )?send/i.test(w1Text), "Welcome 1 promises no follow-up emails (Welcome 2 and 3 are off)");

    assert(
      NEWSLETTER_SIGNUP_CONSENT.text ===
        "By selecting Subscribe, you agree to receive PSL’s report-reading guide and documentation and availability emails. Unsubscribe anytime.",
      "consent wording is exactly the approved sentence"
    );
    assert(NEWSLETTER_SIGNUP_COPY.welcome.consent === NEWSLETTER_SIGNUP_CONSENT.text && NEWSLETTER_SIGNUP_COPY.welcome.button === "Subscribe", "the form shows that sentence beside the Subscribe button");
    assert(/^[0-9a-f]{64}$/.test(NEWSLETTER_SIGNUP_CONSENT_HASH) && NEWSLETTER_SIGNUP_CONSENT.version === "signup-consent-v2", "consent records a version and a SHA-256 of the exact text");
    const publicCopy = [...Object.values(NEWSLETTER_PUBLIC_MESSAGES), ...Object.values(NEWSLETTER_SIGNUP_COPY.welcome).map(String)].join("\n");
    assert(!/check your (e-?mail|inbox)|confirm/i.test(publicCopy), "no “check your email to confirm” wording in signup copy or responses");
    assert(!/delivered|in your inbox|has been sent/i.test(NEWSLETTER_PUBLIC_MESSAGES.received), "acknowledgement never claims inbox delivery");
    const w1 = buildNewsletterWelcomeEmail({ kind: "welcome_1", siteUrl: SITE, unsubscribeToken: unsubTok, postalAddress: "<b>x</b>" });
    assert(!w1.html.includes("<b>x</b>") && w1.html.includes("&lt;b&gt;x&lt;/b&gt;"), "HTML escapes configured values");
  }

  // ---------- delivery classification ----------
  section("delivery outcomes are honest");
  {
    setEnv({});
    const unsubTok = createNewsletterUnsubscribeToken(newSubscriptionPublicId());
    const w1 = buildNewsletterWelcomeEmail({ kind: "welcome_1", siteUrl: SITE, unsubscribeToken: unsubTok, postalAddress: POSTAL });
    sent.length = 0;
    const ok = await deliverNewsletterEmail({ to: "a@example.com", fromEmail: "updates@psllabs.org", built: w1, simulate: false });
    assert(ok.status === "accepted" && ok.providerQueueId === "ABC123DEF" && /^<nl\.[0-9a-f]{24}@psllabs\.org>$/.test(ok.messageId), "accepted: provider queue id and our Message-ID recorded");
    const m = sent[0];
    assert(m.from === "PSL Labs <updates@psllabs.org>" && m.replyTo === "support@psllabs.org", "From is the configured marketing sender; Reply-To is support");
    assert(m.headers["List-Unsubscribe"] === `<${w1.listUnsubscribeUrl}>` && m.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", "RFC 8058 headers present");
    sent.length = 0;
    const sim = await deliverNewsletterEmail({ to: "a@example.com", fromEmail: "updates@psllabs.org", built: w1, simulate: true });
    assert(sim.status === "simulated" && sent.length === 0, "simulation never touches SMTP");

    const run = async (fn: (m: NewsletterMail) => Promise<never | Record<string, unknown>>) => {
      __setNewsletterTransportForTests(fn as never);
      return deliverNewsletterEmail({ to: "a@example.com", fromEmail: "updates@psllabs.org", built: w1, simulate: false });
    };
    const err = (props: Record<string, unknown>) => async () => {
      throw Object.assign(new Error(String(props.message ?? "x")), props);
    };
    assert((await run(err({ code: "ETIMEDOUT", command: "CONN", message: "Timeout" }))).status === "unknown", "mid-session timeout → unknown (never auto-retried)");
    assert((await run(err({ code: "ECONNECTION", command: "CONN", message: "Connection closed unexpectedly" }))).status === "unknown", "dropped connection → unknown");
    assert((await run(err({ code: "ETIMEDOUT", command: "CONN", message: "Greeting never received" }))).status === "failed", "no greeting → definitely not accepted (failed)");
    assert((await run(err({ code: "ESOCKET", command: "CONN", message: "connect ECONNREFUSED 1.2.3.4:587" }))).status === "failed", "connection refused → failed");
    assert((await run(err({ code: "EAUTH", command: "AUTH PLAIN", responseCode: 535 }))).errorCategory === "auth", "auth failure → failed/auth");
    const rej = await run(err({ code: "EENVELOPE", command: "RCPT TO", responseCode: 550, response: "550 5.1.1 no such user\r\n" }));
    assert(rej.status === "rejected" && rej.errorCategory === "rejected_recipient" && rej.providerResponse === "550 5.1.1 no such user", "5xx at RCPT → rejected (response sanitised)");
    assert((await run(err({ code: "EMESSAGE", command: "DATA", responseCode: 451 }))).status === "failed", "4xx → failed (temporary, not accepted)");
    assert((await run(err({ code: "EMESSAGE", command: "DATA", responseCode: 554 }))).status === "rejected", "5xx after DATA → rejected");
    assert((await run(async () => ({ accepted: [], rejected: ["a@example.com"], response: "550" }))).status === "rejected", "recipient rejected in result → rejected");
    assert((await run(async () => ({ accepted: [], rejected: [], response: "250 ok" }))).status === "unknown", "no acceptance reported → unknown");
    assert(classifySmtpError(new Error("SMTP is not configured.")).errorCategory === "config", "missing SMTP → failed/config");
    __setNewsletterTransportForTests(async (mail) => {
      sent.push(mail);
      return { messageId: mail.messageId, response: "250 2.0.0 Ok: queued as ABC123DEF", accepted: [mail.to], rejected: [] };
    });
  }

  // ---------- attribution ----------
  section("attribution: email never overwrites paid; tokens never stored");
  {
    const now = Date.now();
    const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
    const paid = parseTouchFromSearchParams("?utm_source=google&utm_medium=cpc&utm_campaign=testing_docs_us_test1", "/products", "");
    const email = parseTouchFromSearchParams("?utm_source=email&utm_medium=email&utm_campaign=newsletter_welcome_v1&utm_content=welcome_1_guide", "/science/how-to-read-a-coa", "");
    assert(paid && isPaidTouch(paid) && !isEmailTouch(paid), "cpc landing is paid");
    assert(email && isEmailTouch(email) && !isPaidTouch(email), "email landing is email, not paid");
    assert(!isPaidTouch({ utmSource: "email", utmMedium: "email", utmCampaign: "post_purchase_30d_v1" }), "retention email visits are no longer classed as paid");
    assert(isPaidTouch({ utmMedium: "email", gclid: "abc" }), "a real ad click ID still counts as paid");
    assert(parseTouchFromSearchParams("?token=nu1_secret&t=x", "/unsubscribe", "") === null, "untagged token URLs are not captured");
    const tagged = parseTouchFromSearchParams("?utm_source=email&utm_medium=email&utm_campaign=c&token=SECRET&email=a@b.co", "/products", "");
    assert(tagged && !tagged.landingPage!.includes("SECRET") && !tagged.landingPage!.includes("@"), "landing page keeps UTM keys only");

    paid!.capturedAt = at(10);
    email!.capturedAt = at(2);
    let state = mergePaidTouch(null, paid, now);
    state = mergePaidTouch(state, email, now);
    assert(state.lastPaid?.utmMedium === "cpc" && state.firstPaid?.utmMedium === "cpc", "email visit after a paid visit keeps the paid touch");
    assert(state.lastEmail?.utmCampaign === "newsletter_welcome_v1", "email visit recorded separately");
    const order = toOrderAttribution(state)!;
    assert(order.utmMedium === "cpc" && order.lastEmail?.utmContent === "welcome_1_guide", "order primary stays paid; email evidence retained");

    const onlyEmail = toOrderAttribution(mergePaidTouch(null, email, now))!;
    assert(onlyEmail.utmMedium === "email" && onlyEmail.firstPaid === null && onlyEmail.lastPaidTouchAt === null, "email-only journey: primary is email, no paid touch invented");

    const legacy = pruneStoredAttribution({ firstPaid: { ...email!, capturedAt: at(5) }, lastPaid: { ...email!, capturedAt: at(5) } }, now);
    assert(legacy.firstPaid === null && legacy.lastPaid === null && legacy.lastEmail?.utmMedium === "email", "older stored email-as-paid touches are reclassified");

    const body = sanitizeAttributionFromBody({ firstPaid: paid, lastPaid: { ...email, capturedAt: at(1) }, utmSource: "email", utmMedium: "email" })!;
    assert(body.utmMedium === "cpc" && body.lastPaid?.utmMedium === "cpc" && body.lastEmail?.utmMedium === "email", "server sanitiser: paid stays primary; email kept separately");
    const forged = sanitizeAttributionFromBody({ lastEmail: { utmSource: "google", utmMedium: "cpc", capturedAt: at(1) } });
    assert(forged === null, "server sanitiser: a paid touch cannot be smuggled in as lastEmail");
    assert(sanitizeAttributionFromBody({ utmSource: "email", utmMedium: "email", utmCampaign: "newsletter_welcome_v1" })?.lastEmail?.utmMedium === "email", "server sanitiser: top-level email touch stored as lastEmail");
  }

  // ---------- analytics redaction ----------
  section("analytics redaction");
  {
    const transform = new Function(`return (${PLAUSIBLE_TRANSFORM_REQUEST_JS})`)() as (p: { u: string; r?: string | null }) => { u: string; r?: string | null };
    assert(transform({ u: `${SITE}/newsletter/confirm#t=nc1_SECRET` }).u === `${SITE}/newsletter/confirm`, "confirmation fragment never sent");
    assert(transform({ u: `${SITE}/unsubscribe?token=nu1_SECRET` }).u === `${SITE}/unsubscribe`, "unsubscribe token stripped");
    assert(transform({ u: `${SITE}/anything?t=SECRET&x=1` }).u === `${SITE}/anything`, "any t= parameter stripped");
    const utm = `${SITE}/products?utm_source=email&utm_medium=email&utm_campaign=newsletter_welcome_v1&utm_content=welcome_3_information`;
    assert(transform({ u: utm }).u === utm, "campaign UTMs preserved on content pages");
    assert(transform({ u: `${SITE}/`, r: `${SITE}/unsubscribe?token=nu1_SECRET` }).r === `${SITE}/unsubscribe`, "token stripped from referrers");
    const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
    assert(layout.includes("PLAUSIBLE_INIT_JS"), "layout uses the redacting Plausible init");
  }

  // ---------- routes while off: no new-table statements, no mail ----------
  section("journey off / Preview: legacy behaviour, no new writes, no mail");
  {
    for (const env of [{}, { NEWSLETTER_WELCOME_MODE: "on", NEWSLETTER_WELCOME_1_ENABLED: "true", VERCEL_ENV: "preview" }]) {
      setEnv({ ...env, CRON_SECRET: "cron-secret" });
      installFakeSql();
      sent.length = 0;
      const res = await signupPOST(jsonRequest("https://psl.test/api/newsletter", { email: "Person@Example.com", placement: "home_newsletter", signupCopyVersion: "signup-v2" }));
      const body = (await res.json()) as Record<string, unknown>;
      assert(res.status === 200 && body.ok === true && body.message === "Thank you. You'll receive updates on new batch documentation and product availability.", "legacy response unchanged");
      assert(touched(/INSERT INTO newsletter_subscribers/).length === 1 && touched(NEW_TABLES).length === 0, "legacy path writes only the legacy row");
      assert(sent.length === 0, "no mail on the legacy path");

      statements.length = 0;
      const c = await confirmPOST(jsonRequest("https://psl.test/api/newsletter/confirm", { token: createConfirmationToken().token }));
      assert(c.status === 503 && statements.length === 0, "confirmation unavailable with zero database statements");
      const cron = await cronGET(new Request("https://psl.test/api/cron/newsletter-welcome", { headers: { authorization: "Bearer cron-secret" } }));
      const cronBody = (await cron.json()) as { summary: { skipped: boolean } };
      assert(cron.status === 200 && cronBody.summary.skipped === true && statements.length === 0, "daily run is a no-op with zero database statements");
    }
    const unauth = await cronGET(new Request("https://psl.test/api/cron/newsletter-welcome"));
    assert(unauth.status === 401, "cron requires CRON_SECRET");
  }

  section("journey signup: form and origin checks, legacy forms stay legacy");
  {
    const site = "https://www.psllabs.org";
    const ok = (origin: string | null, contentType: string | null = "application/json") =>
      isSameOriginSignup({ contentType, origin }, "https://psl-preview.vercel.app", site);
    assert(ok(null) && ok("https://www.psllabs.org") && ok("https://psllabs.org") && ok("https://psl-preview.vercel.app"), "same-origin, www/apex, and Origin-less JSON posts accepted");
    assert(!ok("https://evil.example") && !ok("null") && !ok("http://www.psllabs.org"), "foreign, opaque, or downgraded origins refused");
    assert(!ok(null, "text/plain") && !ok("https://www.psllabs.org", "application/x-www-form-urlencoded") && !ok(null, null), "non-JSON bodies refused");

    setEnv({ NEWSLETTER_WELCOME_MODE: "on", NEWSLETTER_WELCOME_1_ENABLED: "true" });
    installFakeSql();
    sent.length = 0;
    const foreign = await signupPOST(
      jsonRequest("https://psl.test/api/newsletter", { email: "person@example.com", placement: "home_newsletter", signupCopyVersion: "signup-v2" }, { origin: "https://evil.example" })
    );
    assert(foreign.status === 403 && touched(NEW_TABLES).length === 0 && touched(/newsletter_subscribers/).length === 0 && sent.length === 0, "cross-site journey post refused before any write or mail");

    statements.length = 0;
    const legacyForm = await signupPOST(jsonRequest("https://psl.test/api/newsletter", { email: "person@example.com", placement: "home_newsletter", signupCopyVersion: "legacy-v0" }));
    assert(legacyForm.status === 200 && touched(/INSERT INTO newsletter_subscribers/).length === 1 && touched(NEW_TABLES).length === 0, "a form that did not show the consent wording never enrolls");
    statements.length = 0;
    await signupPOST(jsonRequest("https://psl.test/api/newsletter", { email: "person@example.com" }));
    assert(touched(NEW_TABLES).length === 0 && sent.length === 0, "a post with no copy version never enrolls");

    statements.length = 0;
    const bot = await signupPOST(jsonRequest("https://psl.test/api/newsletter", { email: "person@example.com", signupCopyVersion: "signup-v2", website: "http://spam" }));
    const botBody = (await bot.json()) as { message?: string };
    assert(bot.status === 200 && botBody.message === NEWSLETTER_PUBLIC_MESSAGES.received && statements.length === 0 && sent.length === 0, "honeypot: generic acknowledgement, zero statements, no mail");
    const bad = await signupPOST(jsonRequest("https://psl.test/api/newsletter", { email: "not-an-email", signupCopyVersion: "signup-v2" }));
    assert(bad.status === 400, "invalid address rejected server-side");
  }

  section("GET never confirms or unsubscribes");
  {
    setEnv({ NEWSLETTER_WELCOME_MODE: "on", NEWSLETTER_WELCOME_1_ENABLED: "true" });
    installFakeSql();
    const g = await confirmGET();
    assert(g.status === 405 && statements.length === 0, "GET /api/newsletter/confirm is refused without touching the database");
    const tok = createNewsletterUnsubscribeToken(newSubscriptionPublicId());
    const u = await unsubGET(new Request(`https://psl.test/api/marketing/unsubscribe?token=${tok}`));
    assert((u.status === 307 || u.status === 302) && (u.headers.get("location") ?? "").includes(`/unsubscribe?token=${tok}`), "GET with a newsletter token redirects to the confirmation page");
    const bad = await unsubGET(new Request(`https://psl.test/api/marketing/unsubscribe?token=${tok.slice(0, -2)}xx`));
    assert((bad.headers.get("location") ?? "").includes("error=1"), "tampered token → error page");
    assert(statements.length === 0, "unsubscribe GET performs no database access");
  }

  section("missing tables degrade safely");
  {
    setEnv({ NEWSLETTER_WELCOME_MODE: "on", NEWSLETTER_WELCOME_1_ENABLED: "true", CRON_SECRET: "cron-secret" });
    installFakeSql((text) => (/to_regclass\('public\.' \|\| n\)/.test(text) ? [{ name: "newsletter_consent_requests", present: false }] : /to_regclass/.test(text) ? [{ legacy: true, orders: false }] : /COUNT\(\*\)/.test(text) ? [{ total: 4, confirmed: 0 }] : []));
    sent.length = 0;
    const res = await signupPOST(jsonRequest("https://psl.test/api/newsletter", { email: "person@example.com", signupCopyVersion: "signup-v2" }));
    assert(res.status === 200 && ((await res.json()) as { ok?: boolean }).ok === true, "signup falls back to the legacy path");
    assert(touched(/INSERT INTO newsletter_subscribers/).length === 1, "fallback stores only the legacy row");
    assert(touched(/(INSERT INTO|UPDATE) newsletter_(consent|subscriptions|email|rate|welcome)/).length === 0 && sent.length === 0, "no new-table writes and no mail without the schema");
    statements.length = 0;
    const c = await confirmPOST(jsonRequest("https://psl.test/api/newsletter/confirm", { token: createConfirmationToken().token }));
    assert(c.status === 503, "confirmation unavailable without the schema");
    const cron = await cronGET(new Request("https://psl.test/api/cron/newsletter-welcome", { headers: { authorization: "Bearer cron-secret" } }));
    assert(((await cron.json()) as { summary: { skipped: boolean } }).summary.skipped === true, "daily run skipped without the schema");
    statements.length = 0;
    const view = await readNewsletterWelcomeAdmin();
    assert(!view.schema.ready && view.live === null && view.legacySubscribers?.total === 4, "admin view: not migrated, legacy counts only");
    assert(touched(/\b(CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i).length === 0, "admin read issues no DDL or writes");
    assert(view.previews.length === 3 && view.previews.every((p) => !p.text.includes("offline-test-secret")), "admin previews: the three welcome emails, no secrets");
    assert(view.timing.every((t) => t.kind !== ("confirmation" as string)), "admin timing has no confirmation step");
    assert(touched(/newsletter_email_sends|marketing_eligible/).length === 0, "no newsletter or retention-eligibility statements while unmigrated");
  }

  // ---------- static guarantees ----------
  section("static guarantees");
  {
    const files = walk(join(ROOT, "lib/newsletter")).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const rel = f.slice(ROOT.length + 1).replace(/\\/g, "/");
      assert(!/marketing_eligible|setMarketingEligible/.test(src), `${rel}: never touches retention eligibility`);
      assert(!/openai|anthropic|@ai-sdk|generateText/i.test(src), `${rel}: no model calls`);
      assert(!/SUPPORT_SMTP|SUPPORT_IMAP/.test(src), `${rel}: does not use the support mailbox transport`);
      // lib/newsletter/store.ts is the unchanged legacy signup path (its own pre-existing table).
      if (rel !== "lib/newsletter/schema.ts" && rel !== "lib/newsletter/store.ts") {
        assert(!/CREATE (TABLE|INDEX|UNIQUE)|ALTER TABLE/i.test(src), `${rel}: no DDL outside the migration module`);
      }
      assert(!/UPDATE orders|INSERT INTO orders|UPDATE finance_transactions|INSERT INTO finance_transactions/i.test(src), `${rel}: never changes orders or finance`);
    }
    const ddlCallers = ["app", "components", "lib", "scripts"]
      .flatMap((d) => walk(join(ROOT, d)))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("test-newsletter-welcome.ts"))
      .filter((f) => readFileSync(f, "utf8").includes("ensureNewsletterWelcomeSchema("));
    const rels = ddlCallers.map((f) => f.slice(ROOT.length + 1).replace(/\\/g, "/")).sort();
    assert(
      rels.join() === ["lib/newsletter/schema.ts", "scripts/migrate-newsletter-welcome.ts", "scripts/test-newsletter-welcome-db.ts"].join(),
      `schema created only by the migration and isolated DB test (${rels.join(", ")})`
    );
    const retention = readFileSync(join(ROOT, "lib/retention/store.ts"), "utf8");
    assert(/p\.marketing_eligible = true/.test(retention) && /p\.unsubscribed_at IS NULL/.test(retention), "retention candidates still require explicit retention eligibility");
    const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as { crons: Array<{ path: string; schedule: string }> };
    const cron = vercel.crons.find((c) => c.path === "/api/cron/newsletter-welcome");
    assert(cron && /^\d+ \d+ \* \* \*$/.test(cron.schedule), "welcome sweep runs once per day (Hobby-plan compatible)");
    assert(vercel.crons.every((c) => /^\d+ \d+ \* \* [\d*]$/.test(c.schedule)), "every cron is at most daily");
    assert(NEWSLETTER_SIGNUP_COPY.legacy.heading === "Stay Informed" && NEWSLETTER_SIGNUP_COPY.legacy.button === "Subscribe", "legacy signup copy unchanged");
    const confirmPage = readFileSync(join(ROOT, "app/newsletter/confirm/page.tsx"), "utf8");
    const confirmClient = readFileSync(join(ROOT, "components/newsletter/newsletter-confirm.tsx"), "utf8");
    assert(/referrer: "no-referrer"/.test(confirmPage) && /index: false/.test(confirmPage), "confirmation page: no-referrer, noindex");
    assert(/onClick=\{\(\) => void confirm\(\)\}/.test(confirmClient) && !/useEffect\([^)]*confirm\(/.test(confirmClient), "confirmation requires a deliberate click");
    assert(/replaceState/.test(confirmClient), "token removed from the address bar on load");
    const unsubPage = readFileSync(join(ROOT, "app/unsubscribe/page.tsx"), "utf8");
    assert(/referrer: "no-referrer"/.test(unsubPage), "unsubscribe page: no-referrer");
    const form = readFileSync(join(ROOT, "components/home/newsletter-signup.tsx"), "utf8");
    assert(/copy\.consent/.test(form) && /aria-describedby/.test(form) && !/type="checkbox"/.test(form), "signup form shows the consent sentence by the button, with no extra checkbox");
    const panel = readFileSync(join(ROOT, "components/admin/admin-newsletter-welcome-panel.tsx"), "utf8");
    assert(/address not verified/.test(panel) && /address verified by confirmation link/.test(panel), "admin distinguishes single-opt-in permission from verified addresses");
    const store = readFileSync(join(ROOT, "lib/newsletter/welcome-store.ts"), "utf8");
    const enroll = store.slice(store.indexOf("export async function enrollSingleOptIn"), store.indexOf("export type ConsentRequestRecord"));
    assert(/'single_opt_in'/.test(enroll) && !/confirmed_at,/.test(enroll) && !/newsletter_consent_requests/.test(enroll), "single opt-in never writes a confirmation time or a confirmation request");
    assert(!/kind = 'confirmation'|'confirmation',/.test(enroll), "single opt-in creates no confirmation-email row");
  }

  __setSqlClientForTests(null);
  __setNewsletterTransportForTests(null);
  console.log(`\n[newsletter] ${passed} offline assertions passed (no network, no database, SMTP simulated).`);
}

main().catch((error) => {
  console.error("[newsletter] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
