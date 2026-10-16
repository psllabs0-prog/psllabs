import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { __setSqlClientForTests } from "../lib/db/sql";
import { calculateReferralCommission, normalizeReferralCode, validateReferralApplication } from "../lib/partners/referral-logic";
import { computeTotals } from "../lib/checkout/totals";
import { prepareReservedOrder } from "../lib/checkout/prepare-order";
import { approveReferralPartner, lookupReferralDiscount, migrateReferralPilot, recordSettledReferralOrder, releaseUnpaidReferralClaim, reviewReferralCommission } from "../lib/partners/referral-store";
import { authenticatedPartnerId, PARTNER_SESSION_COOKIE, PARTNER_SESSION_SECONDS, readPartnerAuthReadiness, redeemPartnerSignIn, requestPartnerSignIn, revokePartnerSession, sendPartnerSignInEmail, signPartnerSession, verifyPartnerSession } from "../lib/partners/auth";
import { referralCodesEnabled } from "../lib/partners/referral-config";
import { CHECKOUT_RESEARCH_ACK_VERSION } from "../lib/checkout/research-acknowledgement";

let checks = 0;
function check(actual: unknown, expected: unknown) { assert.deepEqual(actual, expected); checks++; }
const partnerId = "11111111-1111-4111-a111-111111111111";
const code = "fixture-lab-1234abcd";
const now = new Date("2026-10-13T12:00:00Z");
const eligible = { productSubtotal: 100, discountAmount: 10, refundedProductAmount: 0, currency: "USD",
  paidAt: "2026-09-01T12:00:00Z", shippedAt: "2026-09-02T12:00:00Z", deliveredAt: "2026-09-05T12:00:00Z",
  status: "shipped", firstPaidOrder: true, selfReferral: false, reportingExcluded: false,
  financeVerified: true, refundOrVoidDetected: false, refundReviewConfirmed: true, fraudCleared: true };
const priorEnv = { ...process.env };
const fetchBefore = globalThis.fetch;
process.env.PSL_VISUAL_PREVIEW = "0";
process.env.REFERRAL_CODES_ENABLED = "true";
process.env.PARTNER_AUTH_SECRET = "offline_fixture_secret_32_chars_minimum_not_real";
process.env.ADMIN_PASSWORD = "offline_fixture_admin_secret_not_real";
process.env.DATABASE_URL = "fixture://unused";
process.env.VERCEL = "1";
Object.assign(process.env, { NODE_ENV: "test" });
globalThis.fetch = async () => { throw new Error("External network disabled in referral fixtures."); };
const statements: { query: string; values: unknown[] }[] = [];
let eligibleCode = true;
let knownEmail = true;
let usedToken = false;
let authTokenDigest = "";
let sessionDigest = "";
let sessionRevoked = false;
__setSqlClientForTests((async (parts: TemplateStringsArray, ...values: unknown[]) => {
  const query = parts.join("?"); statements.push({ query, values });
  if (query.includes("to_regclass")) return [{ ready: true }];
  if (query.includes("INSERT INTO request_rate_limits")) return [{ attempts: 1, retry_after: 3600 }];
  if (query.includes("SELECT * FROM acquisition_partners")) return [{ id: partnerId, code, business_name: "Fixture Lab", contact_name: "Pat",
    email: "partner@example.test", website: "", source: "fixture", destination: "/products", status: "prospect", notes: "private fixture notes",
    created_at: now.toISOString(), updated_at: now.toISOString(), last_contacted_at: null, last_replied_at: null, follow_up_due_at: null }];
  if (query.includes("create_partner_signin_token(")) { authTokenDigest = String(values[1]); return [{ email: knownEmail ? "partner@example.test" : null }]; }
  if (query.includes("WITH consumed")) {
    if (usedToken || values[0] !== authTokenDigest) return [];
    usedToken = true; sessionDigest = String(values[1]); sessionRevoked = false; return [{ partner_id: partnerId }];
  }
  if (query.includes("SELECT partner_id FROM partner_auth_sessions")) return !sessionRevoked && values[0] === sessionDigest ? [{ partner_id: partnerId }] : [];
  if (query.includes("DELETE FROM partner_auth_sessions")) { sessionRevoked = true; return []; }
  if (query.includes("SELECT p.code, t.version")) return eligibleCode ? [{ code, version: "psl-referral-program-v2", repeat_customer: false }] : [];
  if (query.includes("SELECT approve_referral_partner")) return [{ approved: true }];
  if (query.includes("SELECT checkout_create_referral_order")) return [{ result: { ok: true } }];
  if (query.includes("RETURNING order_id") || query.includes("RETURNING o.order_id")) return [{ order_id: "psl_fixture_1234" }];
  return [];
}) as never);

async function main() {
  try {
    check(calculateReferralCommission(eligible, now).amount, 9);
    check(calculateReferralCommission(eligible, now).status, "payable");
    check(calculateReferralCommission({ ...eligible, refundedProductAmount: 30 }, now).amount, 6);
    check(calculateReferralCommission({ ...eligible, refundedProductAmount: 90 }, now).amount, 0);
    for (const field of ["selfReferral", "reportingExcluded", "refundOrVoidDetected"] as const) check(calculateReferralCommission({ ...eligible, [field]: true }, now).status, "ineligible");
    check(calculateReferralCommission({ ...eligible, firstPaidOrder: false }, now).amount, 0);
    check(calculateReferralCommission({ ...eligible, currency: "EUR" }, now).amount, 0);
    check(calculateReferralCommission({ ...eligible, paidAt: null }, now).amount, 0);
    check(calculateReferralCommission({ ...eligible, discountAmount: 15 }, now).amount, 0);
    for (const field of ["financeVerified", "refundReviewConfirmed", "fraudCleared"] as const) check(calculateReferralCommission({ ...eligible, [field]: false }, now).status, "held");
    check(calculateReferralCommission({ ...eligible, deliveredAt: null }, now).status, "held");
    check(calculateReferralCommission({ ...eligible, deliveredAt: "2026-10-10T12:00:00Z" }, now).status, "held");
    check(calculateReferralCommission(eligible, new Date("2026-10-05T11:59:59Z")).status, "held");
    check(calculateReferralCommission(eligible, new Date("2026-10-05T12:00:00Z")).status, "payable");
    assert.throws(() => calculateReferralCommission({ ...eligible, refundedProductAmount: 91 }, now)); checks++;
    assert.throws(() => calculateReferralCommission({ ...eligible, productSubtotal: NaN }, now)); checks++;
    const btc = computeTotals(100, "", { code, percent: 10, exclusive: true }, { paymentMethod: "bitcoin" });
    check([btc.discountAmount, btc.bitcoinDiscountAmount, btc.discountCode], [10, 0, code]);
    check(computeTotals(100, "", null, { paymentMethod: "bitcoin" }).discountAmount, 5);
    check(normalizeReferralCode(" FIXTURE-LAB-1234ABCD "), code);
    check(normalizeReferralCode("../../admin"), null);
    const application = validateReferralApplication({ name: "Fixture Lab", email: "PARTNER@example.test", audiencePurpose: "A genuine laboratory science audience and factual research content.", acceptTerms: true });
    check([application.email, application.source], ["partner@example.test", "Referral pilot application"]);
    for (const value of [null, [], { ...application, acceptTerms: false }, { name: "<script>", email: "a@example.test", audiencePurpose: "A legitimate laboratory audience.", acceptTerms: true }]) { assert.throws(() => validateReferralApplication(value)); checks++; }
    await approveReferralPartner(partnerId, true);
    await assert.rejects(approveReferralPartner(partnerId, false)); checks++;
    check(await lookupReferralDiscount(code, "buyer@example.test"), { code, percent: 10 });
    check(await lookupReferralDiscount(code), null);
    eligibleCode = false;
    check(await lookupReferralDiscount(code, "buyer@example.test"), null);
    const body = { email: "buyer@example.test", currency: "USD", discountCode: code,
      researchAcknowledgement: { version: CHECKOUT_RESEARCH_ACK_VERSION, researchStatus: "independent_researcher", researchUseOnly: true },
      items: [{ handle: "retatrutide", quantity: 1 }], shipping: { firstName: "Fixture", lastName: "Only", address: "123 Test Street", city: "Phoenix", state: "AZ", zip: "85001", country: "US" } };
    const researchAccount = { id: "offline_referral_buyer", email: body.email };
    const rejected = await prepareReservedOrder(body, { paymentMethod: "bitcoin", researchAccount });
    check(rejected.ok, false);
    eligibleCode = true;
    const beforeCard = statements.length;
    const card = await prepareReservedOrder(body, { paymentMethod: "card", researchAccount });
    check(card.ok, false);
    check(statements.slice(beforeCard).some(row => row.query.includes("SELECT checkout_create_referral_order")), false);
    const prepared = await prepareReservedOrder(body, { paymentMethod: "bitcoin", researchAccount });
    check(prepared.ok, true);
    if (prepared.ok) {
      check([prepared.order.subtotal, prepared.order.discountAmount, prepared.order.discountCode], [59.99, 6, code]);
      check(prepared.order.attribution, null);
    }
    const reserve = statements.find(row => row.query.includes("SELECT checkout_create_referral_order"))!;
    check(reserve.values.slice(4, 12).includes(code), true);
    await recordSettledReferralOrder("psl_fixture_1234");
    await recordSettledReferralOrder("psl_fixture_1234");
    check(statements.filter(row => row.query.includes("INSERT INTO partner_referral_commissions") && row.query.includes("ON CONFLICT (order_id) DO NOTHING")).length, 2);
    await assert.rejects(reviewReferralCommission({ orderId: "psl_fixture_1234", deliveredAt: "invalid" })); checks++;
    await assert.rejects(releaseUnpaidReferralClaim({ orderId: "psl_fixture_1234", providerUnpaidConfirmed: false })); checks++;
    await releaseUnpaidReferralClaim({ orderId: "psl_fixture_1234", providerUnpaidConfirmed: true });
    const release = statements.at(-1)!.query;
    check(release.includes("o.paid_at IS NULL") && release.includes("status = 'failed'") && release.includes("payment_events"), true);
    let sentUrl = "";
    const mailer = async (email: string, url: string) => { check(email, "partner@example.test"); sentUrl = url; };
    knownEmail = false;
    await requestPartnerSignIn("unknown@example.test", mailer);
    check(sentUrl, "");
    knownEmail = true;
    await requestPartnerSignIn("partner@example.test", mailer);
    const token = new URL(sentUrl).searchParams.get("token")!;
    check(/^[0-9a-f]{64}$/.test(token), true);
    check(authTokenDigest, createHash("sha256").update(token).digest("hex"));
    check(statements.some(row => row.values.includes(token)), false);
    const signed = await redeemPartnerSignIn(token);
    check(typeof signed, "string");
    check(await redeemPartnerSignIn(token), null);
    check(verifyPartnerSession(signed!), signed!.split(".")[1]);
    check(verifyPartnerSession(signed!.slice(0, -1) + (signed!.endsWith("a") ? "b" : "a")), null);
    check(verifyPartnerSession(signed!, Date.now() + PARTNER_SESSION_SECONDS * 1000 + 1000), null);
    check(verifyPartnerSession(signPartnerSession("a".repeat(64), Date.now() - 1000)), null);
    const request = new Request(`https://www.psllabs.org/api/partners/account?id=attacker`, { headers: { cookie: `${PARTNER_SESSION_COOKIE}=${signed}` } });
    check(await authenticatedPartnerId(request), partnerId);
    const { GET: account } = await import("../app/api/partners/account/route");
    const { GET: verifyGet, POST: verifyPost } = await import("../app/api/partners/auth/verify/route");
    const { POST: apply } = await import("../app/api/partners/apply/route");
    const { POST: authRequest } = await import("../app/api/partners/auth/request/route");
    const { POST: logout } = await import("../app/api/partners/auth/logout/route");
    const { POST: discount } = await import("../app/api/checkout/apply-discount/route");
    const apiRequest = (path: string, body: unknown, origin = "https://www.psllabs.org") => new Request(`https://www.psllabs.org${path}`, {
      method: "POST", headers: { origin, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.10" }, body: JSON.stringify(body),
    });
    const beforeVerifyGet = statements.length;
    const verifyScreen = await verifyGet(new Request(`https://www.psllabs.org/api/partners/auth/verify?token=${token}`));
    check(verifyScreen.status, 200);
    check((await verifyScreen.text()).includes('method="post"'), true);
    check(statements.length, beforeVerifyGet);
    check(verifyScreen.headers.get("referrer-policy"), "no-referrer");
    const privateResponse = await account(request);
    check(privateResponse.status, 200);
    const privateBody = await privateResponse.json();
    check([privateBody.partner.name, privateBody.partner.code, privateBody.partner.trackingUrl], ["Fixture Lab", null, null]);
    check(JSON.stringify(privateBody).includes("partner@example.test") || JSON.stringify(privateBody).includes("private fixture notes"), false);
    check((await account(new Request("https://www.psllabs.org/api/partners/account"))).status, 401);
    check((await apply(apiRequest("/api/partners/apply", {}, "https://evil.test"))).status, 403);
    check((await authRequest(apiRequest("/api/partners/auth/request", {}, "https://evil.test"))).status, 403);
    check((await logout(apiRequest("/api/partners/auth/logout", {}, "https://evil.test"))).status, 403);
    check((await discount(apiRequest("/api/checkout/apply-discount", {}, "https://evil.test"))).status, 403);
    const beforeHoney = statements.length;
    check((await apply(apiRequest("/api/partners/apply", { websiteUrl: "bot" }))).status, 200);
    check((await authRequest(apiRequest("/api/partners/auth/request", { websiteUrl: "bot" }))).status, 200);
    check(statements.length, beforeHoney);
    check((await apply(apiRequest("/api/partners/apply", { name: "Fixture", email: "fixture@example.test", audiencePurpose: "A laboratory audience with factual research content", acceptTerms: false }))).status, 400);
    check((await discount(apiRequest("/api/checkout/apply-discount", { code, email: "buyer@example.test" }))).status, 200);
    const replay = await verifyPost(new Request("https://www.psllabs.org/api/partners/auth/verify", {
      method: "POST", headers: { origin: "https://www.psllabs.org", "content-type": "application/x-www-form-urlencoded", "x-vercel-forwarded-for": "192.0.2.10" }, body: new URLSearchParams({ token }),
    }));
    check(replay.status, 303);
    check(new URL(replay.headers.get("location")!).searchParams.get("signin"), "expired");
    check(new URL(replay.headers.get("location")!).pathname, "/partners/account");
    check(replay.headers.has("set-cookie"), false);
    await revokePartnerSession(request);
    check(await authenticatedPartnerId(request), null);
    const beforeMigration = statements.length;
    await migrateReferralPilot();
    const migration = statements.slice(beforeMigration).map(row => row.query).join("\n");
    check(migration.includes("pg_advisory_xact_lock") && migration.includes("FOR SHARE") && migration.includes("referral_partner_activation_guard"), true);
    check(migration.includes("ft.reporting_excluded = true"), true);
    check(migration.includes("UPDATE products") || statements.slice(beforeMigration).some(row => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(row.query)), false);
    check(migration.includes("DROP TABLE") || migration.includes("count(*) FROM partner_referral_terms"), false);
    const beforeDisabled = statements.length;
    delete process.env.REFERRAL_CODES_ENABLED;
    check(referralCodesEnabled(), false);
    check(await lookupReferralDiscount(code, "buyer@example.test"), null);
    check((await prepareReservedOrder(body, { paymentMethod: "bitcoin" })).ok, false);
    check(statements.length, beforeDisabled);
    check((await discount(apiRequest("/api/checkout/apply-discount", { code, email: "buyer@example.test" }))).status, 404);
    for (const flag of ["false", "1", "TRUE"]) { process.env.REFERRAL_CODES_ENABLED = flag; check(referralCodesEnabled(), false); }
    process.env.REFERRAL_CODES_ENABLED = "true";
    for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]) delete process.env[key];
    const unavailableMail = await readPartnerAuthReadiness();
    check([unavailableMail.secretConfigured, unavailableMail.schemaReady, unavailableMail.smtpConfigured, unavailableMail.smtpDeliveryVerified], [true, true, false, false]);
    Object.assign(process.env, { SMTP_HOST: "smtp.example.test", SMTP_USER: "fixture@example.test", SMTP_PASSWORD: "offline_smtp_fixture_password", SMTP_PORT: "587" });
    check((await readPartnerAuthReadiness()).smtpConfigured, true);
    let mailAttempts = 0; let mailClosed = 0; let rejectedRecipient = false; let transportOptions: Record<string, unknown> = {};
    const transportFactory = ((options: Record<string, unknown>) => { transportOptions = options; return {
      sendMail: async () => { mailAttempts++; return rejectedRecipient ? { accepted: [], rejected: ["partner@example.test"] } : { accepted: ["partner@example.test"], rejected: [] }; },
      close: () => { mailClosed++; },
    }; }) as never;
    await sendPartnerSignInEmail("partner@example.test", "https://www.psllabs.org/api/partners/auth/verify?token=fixture", transportFactory);
    check([mailAttempts, mailClosed, transportOptions.requireTLS, transportOptions.connectionTimeout, transportOptions.socketTimeout], [1, 1, true, 15000, 20000]);
    rejectedRecipient = true;
    await assert.rejects(sendPartnerSignInEmail("partner@example.test", "https://www.psllabs.org/api/partners/auth/verify?token=fixture", transportFactory)); checks++;
    check([mailAttempts, mailClosed], [2, 2]);
    usedToken = false;
    await requestPartnerSignIn("partner@example.test", async () => { throw new Error("offline send failure"); });
    check(statements.at(-1)?.query.includes("UPDATE partner_signin_tokens SET used_at = now()"), true);
    console.log(`Referral pilot: ${checks} offline calculation, eligibility, exclusive-discount, authentication, replay, ownership, and accounting checks passed. No real orders, email, payments, or network requests.`);
  } finally {
    __setSqlClientForTests(null); globalThis.fetch = fetchBefore;
    for (const key of Object.keys(process.env)) if (!(key in priorEnv)) delete process.env[key];
    Object.assign(process.env, priorEnv);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
