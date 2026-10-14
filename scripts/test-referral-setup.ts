/** Actual protected admin route with fixture auth/SQL; never touches live schema or mail. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { __setSqlClientForTests } from "../lib/db/sql";
import { createAdminSessionToken, verifyAdminSessionToken } from "../lib/admin/auth";
import * as partnerLogic from "../lib/partners/logic";
import * as partnerStore from "../lib/partners/store";
import * as referralStore from "../lib/partners/referral-store";
import * as referralLogic from "../lib/partners/referral-logic";
import { readPartnerAuthReadiness } from "../lib/partners/auth";
import * as registrationStore from "../lib/partners/registration-store";

const origin = "https://www.psllabs.org";
const savedEnv = { ...process.env };
Object.assign(process.env, { ADMIN_PASSWORD: "offline_admin_fixture_not_a_real_password", DATABASE_URL: "fixture://unused", PSL_VISUAL_PREVIEW: "0" });
delete process.env.PARTNER_AUTH_SECRET;
const statements: string[] = [];
let adminCookie: string | undefined;
let failDdl = false;
let failVerification = false;
let checks = 0;
function check(actual: unknown, expected: unknown) { assert.deepEqual(actual, expected); checks++; }
__setSqlClientForTests((async (parts: TemplateStringsArray) => {
  const query = parts.join("?"); statements.push(query);
  if (failDdl && query.includes("CREATE TABLE")) throw new Error("PRIVATE_FIXTURE_FAILURE_DO_NOT_EXPOSE");
  if (query.includes("to_regclass")) return [{ ready: !(failVerification && query.includes("pg_trigger")) }];
  return [];
}) as never);

const mocks: Record<string, unknown> = {
  "next/server": { NextResponse },
  "@/lib/admin/auth": { isAdminAuthenticated: async () => verifyAdminSessionToken(adminCookie ?? "") },
  "@/lib/partners/logic": partnerLogic,
  "@/lib/partners/store": { ...partnerStore,
    createPartner: async () => { throw new Error("Unexpected partner creation during schema setup"); },
    savePartner: async () => { throw new Error("Unexpected partner update during schema setup"); },
  },
  "@/lib/partners/referral-store": { ...referralStore,
    approveReferralPartner: async () => { throw new Error("Unexpected approval during setup"); },
    reviewReferralCommission: async () => { throw new Error("Unexpected commission review during setup"); },
    releaseUnpaidReferralClaim: async () => { throw new Error("Unexpected order update during setup"); },
  },
  "@/lib/partners/referral-logic": referralLogic,
  "@/lib/partners/auth": { readPartnerAuthReadiness },
  "@/lib/partners/registration-store": registrationStore,
};
function load(file: string): Record<string, unknown> {
  const filename = resolve(file);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports: Record<string, unknown> = {};
  const loader = (id: string) => { assert(id in mocks, `Unmocked dependency rejected: ${id}`); return mocks[id]; };
  new Script(`(function(require,exports){${code}\n})`, { filename }).runInContext(createContext({ console: { error() {} }, URL, Date, process: { env: {} } }))(loader, exports);
  return exports;
}
mocks["@/lib/admin/require-auth"] = load("lib/admin/require-auth.ts");
const route = load("app/api/admin/partners/route.ts") as { POST: (request: Request) => Promise<Response> };
function request(body: unknown = { action: "initialize_referral_pilot", setupVersion: referralLogic.REFERRAL_PILOT.version }, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/admin/partners`, { method: "POST", headers: {
    origin, "content-type": "application/json", "X-PSL-Partners-Action": "1", ...headers,
  }, body: JSON.stringify(body) });
}
async function main() {
  try {
    for (const cookie of [undefined, "invented", `${createAdminSessionToken()}tampered`]) {
      adminCookie = cookie;
      check((await route.POST(request())).status, 401);
      check(statements.length, 0);
    }
    adminCookie = createAdminSessionToken()!;
    const hostileHeaders: Record<string, string>[] = [{ origin: "https://evil.test" }, { "X-PSL-Partners-Action": "" },
      { "sec-fetch-site": "cross-site" }, { origin: `${origin}.evil.test` }];
    for (const headers of hostileHeaders) {
      check((await route.POST(request(undefined, headers))).status, 403);
      check(statements.length, 0);
    }
    check((await route.POST(request(undefined, { "content-type": "text/plain" }))).status, 415);
    check(statements.length, 0);
    for (const body of [{ action: "initialize_referral_pilot" }, { action: "initialize_referral_pilot", setupVersion: "other-version" },
      { action: "initialize_referral_pilot", setupVersion: referralLogic.REFERRAL_PILOT.version, sql: "DROP TABLE orders" },
      { action: "initialize_referral_pilot", setupVersion: referralLogic.REFERRAL_PILOT.version, schema: "another_schema" }]) {
      const before = statements.length;
      check((await route.POST(request(body))).status, 400);
      check(statements.slice(before).some(query => /CREATE|ALTER|DROP/i.test(query)), false);
    }
    const beforeSetup = statements.length;
    const response = await route.POST(request());
    check(response.status, 200);
    const result = await response.json();
    check([result.ok, result.setup.schemaVerified, result.setup.partnerApprovalPerformed, result.setup.outboundEmailSent,
      result.setup.paymentOrPayoutPerformed, result.setup.trackingActivated], [true, true, false, false, false, false]);
    check([result.setup.partnerAuth.secretConfigured, result.setup.partnerAuth.schemaReady, result.setup.partnerAuth.smtpDeliveryVerified], [false, true, false]);
    check(response.headers.get("cache-control"), "no-store");
    const firstSetup = statements.slice(beforeSetup);
    check(firstSetup.filter(query => query.includes("CREATE TABLE IF NOT EXISTS")).length, 8);
    check(firstSetup.filter(query => query.includes("CREATE OR REPLACE FUNCTION")).length, 9);
    check(firstSetup.filter(query => query.includes("CREATE OR REPLACE TRIGGER")).length, 1);
    check(firstSetup.some(query => /^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i.test(query)), false);
    check(firstSetup.some(query => query.includes("SELECT approve_referral_partner")), false);
    const beforeRepeat = statements.length;
    check((await route.POST(request())).status, 200);
    check(statements.slice(beforeRepeat), firstSetup);
    failVerification = true;
    const unverified = await route.POST(request());
    check(unverified.status, 503);
    check((await unverified.json()).available, false);
    failVerification = false; failDdl = true;
    const failed = await route.POST(request());
    check(failed.status, 500);
    check((await failed.text()).includes("PRIVATE_FIXTURE_FAILURE"), false);
    console.log(`Referral schema setup: ${checks} offline admin-auth, CSRF, version/field allowlist, idempotency, schema readback, no-business-mutation, and failure checks passed. No live migration or email.`);
  } finally {
    __setSqlClientForTests(null);
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
