import assert from "node:assert/strict";
import { __setSqlClientForTests } from "../lib/db/sql";
import { validatePartnerRegistration, validateManualPayout } from "../lib/partners/registration-logic";
import { assertPartnerProgramAvailable, registerReferralPartner, recordManualPartnerPayout, loadPartnerPayouts } from "../lib/partners/registration-store";
import { calculateReferralCommission, REFERRAL_PILOT } from "../lib/partners/referral-logic";
import { validPartnerCode } from "../lib/partners/logic";
import { lookupReferralDiscount } from "../lib/partners/referral-store";

let checks = 0;
const check = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); checks++; };
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const statements: Array<{ query: string; values: unknown[] }> = [];
const id = "11111111-1111-4111-a111-111111111111";
let recorded = true;
let repeat = false;
let ready = true;
process.env.PSL_VISUAL_PREVIEW = "0";
process.env.DATABASE_URL = "fixture://unused";
process.env.REFERRAL_CODES_ENABLED = "true";
globalThis.fetch = async () => { throw new Error("No external requests in partner-program tests."); };
__setSqlClientForTests((async (parts: TemplateStringsArray, ...values: unknown[]) => {
  const query = parts.join("?"); statements.push({ query, values });
  if (query.includes("to_regclass")) return [{ ready }];
  if (query.includes("record_manual_referral_payout")) return [{ recorded }];
  if (query.includes("SELECT p.code, t.version")) return [{ code: "lukelab", version: REFERRAL_PILOT.version, repeat_customer: repeat }];
  return [];
}) as never);

async function main() {
  try {
    const application = { name: "Fixture Lab", email: "PARTNER@example.test", preferredCode: "LukeLab", payoutMethod: "zelle", payoutContact: "partner@example.test", acceptTerms: true };
    const registration = validatePartnerRegistration(application);
    check([registration.partner.email, registration.preferredCode, registration.termsVersion], ["partner@example.test", "lukelab", REFERRAL_PILOT.version]);
    check(validPartnerCode("lukelab"), true);
    check(validPartnerCode("fixture-lab-1234abcd"), true);
    for (const change of [{ acceptTerms: false }, { name: "<script>" }, { email: "no-email" }, { preferredCode: "../admin" }, { preferredCode: "a" }, { payoutMethod: "bank-login" }, { payoutContact: "not-a-phone" }, { payoutContact: "x\r\nBCC:private@example.test" }]) {
      assert.throws(() => validatePartnerRegistration({ ...application, ...change })); checks++;
    }
    const automatic = validatePartnerRegistration({ ...application, preferredCode: "", payoutMethod: "arrange", payoutContact: "" });
    check(automatic.preferredCode, null);
    await registerReferralPartner(registration);
    const saved = statements.find(row => row.query.includes("SELECT register_referral_partner"))!;
    check(saved.values[3], "lukelab");
    check(saved.values[5], REFERRAL_PILOT.version);
    check(statements.some(row => /^\s*(CREATE|ALTER|DROP|UPDATE|INSERT|DELETE)\b/i.test(row.query)), false);
    check(REFERRAL_PILOT.maximumPartners, null);
    check(REFERRAL_PILOT.supportedPaymentMethods, ["bitcoin", "card"]);
    check(await lookupReferralDiscount("lukelab", "buyer@example.test"), { code: "lukelab", percent: 10 });
    repeat = true;
    check(await lookupReferralDiscount("lukelab", "buyer@example.test"), { code: "lukelab", percent: 0 });
    const eligible = { termsVersion: REFERRAL_PILOT.version, productSubtotal: 100, discountAmount: 10, refundedProductAmount: 0, currency: "USD", paidAt: "2026-08-01T12:00:00Z", shippedAt: "2026-08-02T12:00:00Z", deliveredAt: "2026-08-05T12:00:00Z", status: "shipped", firstPaidOrder: true, selfReferral: false, reportingExcluded: false, financeVerified: true, refundOrVoidDetected: false, refundReviewConfirmed: true, fraudCleared: true };
    const now = new Date("2026-10-13T12:00:00Z");
    check(calculateReferralCommission(eligible, now).amount, 9);
    check(calculateReferralCommission({ ...eligible, firstPaidOrder: false, discountAmount: 0 }, now).amount, 10);
    check(calculateReferralCommission({ ...eligible, firstPaidOrder: false, discountAmount: 5 }, now).amount, 9.5);
    check(calculateReferralCommission({ ...eligible, firstPaidOrder: false, termsVersion: "psl-referral-pilot-v1" }, now).status, "ineligible");
    check(calculateReferralCommission({ ...eligible, refundedProductAmount: 30 }, now).amount, 6);
    check(calculateReferralCommission({ ...eligible, refundedProductAmount: 89.99 }, now).status, "ineligible");
    for (const flag of ["selfReferral", "reportingExcluded", "refundOrVoidDetected"] as const) check(calculateReferralCommission({ ...eligible, [flag]: true }, now).status, "ineligible");
    const payout = { partnerId: id, orderIds: ["psl_fixture_1", "psl_fixture_2"], expectedAmount: 19, reference: "fixture-manual-payment-1", method: "zelle", period: "2026-09", paymentSentConfirmed: true };
    check(validateManualPayout(payout).orderIds.length, 2);
    for (const change of [{ paymentSentConfirmed: false }, { expectedAmount: 0 }, { expectedAmount: 1.001 }, { period: "2026-13" }, { orderIds: ["psl_fixture_1", "psl_fixture_1"] }, { orderIds: ["../private"] }, { partnerId: "other" }, { reference: "<script>" }]) {
      assert.throws(() => validateManualPayout({ ...payout, ...change })); checks++;
    }
    await recordManualPartnerPayout(payout, "fixture-owner");
    check(statements.at(-1)?.values.at(-1), "fixture-owner");
    recorded = false;
    await assert.rejects(recordManualPartnerPayout(payout, "fixture-owner")); checks++;
    check(await loadPartnerPayouts(id), []);
    ready = false;
    await assert.rejects(assertPartnerProgramAvailable()); checks++;
    ready = true;
    process.env.PSL_VISUAL_PREVIEW = "1";
    const before = statements.length;
    await assert.rejects(registerReferralPartner(registration)); checks++;
    await assert.rejects(recordManualPartnerPayout(payout, "fixture-owner")); checks++;
    check(statements.length, before);
    console.log(`Partner program: ${checks} offline registration, term-version, first/repeat commissions, payout validation, failed-record and preview-isolation checks passed. No real accounts, emails, orders or payouts.`);
  } finally {
    __setSqlClientForTests(null); globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
